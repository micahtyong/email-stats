"use strict";
const fs = require("fs").promises;
const readline = require("readline-sync");
const { google } = require("googleapis");
const { exec } = require("child_process");
const { write: dynamoWrite } = require("./dynamo/write");

// If modifying these scopes, delete token.json.
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = "./token.json";

exports.handler = async () => {
  const credentials = await fs.readFile("./credentials.json");
  const authToken = await authorize(JSON.parse(credentials));
  const stats = await gmailStatsToDB(authToken);
  return stats;
};

/**
 * Main Lambda function
 *
 * @param {google.auth.OAuth2} auth
 */
async function gmailStatsToDB(auth) {
  // 0) Get user profile information
  const user = await getProfile(auth);

  // 1) Collect email keys from the preceding hour
  const pastHour = getLastHour();
  const rawEmails = await getEmailKeys(auth, ["INBOX"], pastHour);
  rawEmails.push(...(await getEmailKeys(auth, ["SENT"], pastHour)));

  // 2) Format emails
  const emails = await getParsedEmails(auth, rawEmails);

  // 3) Extract metrics from emails
  const emailStats = await getEmailStats(user, emails);

  // 4) Write to DB
  const input = {
    ...emailStats,
    id: user.emailAddress,
    isDeleted: false,
    time: pastHour,
  };
  await dynamoWrite(input);
  return input;
}

/**
 * Returns the last valid hour that the lambda function can be called.
 *
 * ex) It's 7:10 PM.
 *      getLastHour() returns the Unix timestamp in seconds for 6:00 PM,
 *      and our API scaper should scan between 6:00 PM and 7:00 PM only.
 */
function getLastHour() {
  const mostRecentHour = Math.floor(Date.now() / 1000 / 60 / 60) * 60 * 60;
  return mostRecentHour - 3600;
}

/**
 * Extract the following metrics from emails:
 * (a) sent to:you from:gmail-users,
 * (b) sent to:you from:non-gmail-users,
 * (c) sent from:you to:gmail-users,
 * (d) sent from:you to:non-gmail-users)
 * @param {User} user .emailAddress gets the user's email address.
 * @param {Email[]} emails
 */
async function getEmailStats(user, emails) {
  const stats = {
    toMeFromGmail: 0,
    toMeFromNonGmail: 0,
    fromMeToGmail: 0,
    fromMeToNonGmail: 0,
  };
  for (const email of emails) {
    const sentToMe = email.to.includes(user.emailAddress);
    const sentFromMe = email.from.includes(user.emailAddress);
    const fromGmail =
      email.from.includes("gmail.com") || (await isGmailHosted(email.from));
    const toGmail =
      email.to.includes("gmail.com") || (await isGmailHosted(email.to));
    if (sentToMe && fromGmail) {
      stats.toMeFromGmail += 1;
    } else if (sentToMe && !fromGmail) {
      stats.toMeFromNonGmail += 1;
    } else if (sentFromMe && toGmail) {
      stats.fromMeToGmail += 1;
    } else {
      stats.fromMeToNonGmail += 1;
    }
  }
  return stats;
}

/**
 * Determines whether email domain is managed by Google.
 * 1) Extract domain name
 * 2) Execute shell child process to check host (@source: https://stackabuse.com/executing-shell-commands-with-node-js/)
 * @param {string} emailAddress
 *
 * ex) team@calblueprint.org => true
 * reject(`error: ${error.message}`)
 * reject(`stderr: ${stderr}`)
 */
function isGmailHosted(emailAddress) {
  const domain = emailAddress.match(/(?<=@)[^.]+(.(\w+))*/g);
  return new Promise((resolve) => {
    if (domain.length) {
      exec(`host ${domain[0]}`, (error, stdout, stderr) => {
        if (error) resolve(false);
        if (stderr) resolve(false);
        resolve(stdout.includes("google.com"));
      });
    }
  });
}

/**
 * Create an OAuth2 client with the given credentials.
 * @param {Object} credentials The authorization client credentials.
 * @returns {google.auth.OAuth2} The OAuth2 client to run subsequent calls to Gmail API.
 */
async function authorize(credentials) {
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  let token;
  try {
    token = await fs.readFile(TOKEN_PATH);
  } catch (err) {
    token = await getNewToken(oAuth2Client);
  }
  oAuth2Client.setCredentials(JSON.parse(token));
  return oAuth2Client;
}

/**
 * Get and store new token after prompting for user authorization.
 * Store the token to disk for later program executions.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 */
async function getNewToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });
  console.log("Authorize this app by visiting this url:", authUrl);
  const code = readline.question("Enter the code from that page here: ");
  const { tokens } = await oAuth2Client.getToken(code);
  await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens));
  return JSON.stringify(tokens);
}

/**
 * Returns user profile information based on authorized client.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function getProfile(auth) {
  const gmail = google.gmail({ version: "v1", auth });
  return new Promise((resolve, reject) => {
    gmail.users.getProfile(
      {
        userId: "me",
      },
      (err, res) => {
        if (err)
          return reject(
            "The API returned an error while fetching user: " + err
          );
        resolve(res.data);
      }
    );
  });
}

/**
 * Lists the labels in the user's account.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function getLabels(auth) {
  const gmail = google.gmail({ version: "v1", auth });
  return new Promise((resolve, reject) => {
    gmail.users.labels.list(
      {
        userId: "me",
      },
      (err, res) => {
        if (err) return reject("The API returned an error " + err);
        const labels = res.data.labels;
        if (labels) {
          resolve(labels);
        } else {
          resolve([]);
        }
      }
    );
  });
}

/**
 * Fetches received messages in the user's account.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function getEmailKeys(auth, labels, hourAgo) {
  const gmail = google.gmail({ version: "v1", auth });
  return new Promise((resolve, reject) => {
    gmail.users.messages.list(
      {
        userId: "me",
        q: `after:${hourAgo}`,
        labelIds: labels,
      },
      (err, res) => {
        if (err) return reject("The API returned an error " + err);
        const messages = res.data.messages;
        if (messages) {
          resolve(messages);
        } else {
          resolve([]);
        }
      }
    );
  });
}

/**
 * Process raw emails and returning parsed emails.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 * @param {gmail_v1.Schema$Message} rawEmails A list of raw emails retrieved from Gmail API client.
 */
function getParsedEmails(auth, rawEmails) {
  const emails = [];
  return new Promise(async (resolve) => {
    if (rawEmails.length) {
      for (const rawEmail of rawEmails) {
        const email = await parseEmail(auth, rawEmail);
        emails.push(email);
      }
    }
    resolve(emails);
  });
}

/**
 * Parse a single raw email.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 * @param {gmail_v1.Schema$Message} rawEmail A raw email retrieved from Gmail API client.
 */
function parseEmail(auth, rawEmail) {
  const gmail = google.gmail({ version: "v1", auth });
  return new Promise((resolve, reject) => {
    gmail.users.messages.get(
      {
        userId: "me",
        id: rawEmail["id"],
      },
      (err, res) => {
        if (err) return reject("The email is invalid: " + err);
        const email = {
          id: res.data.id,
          snippet: res.data.snippet,
          labelIds: res.data.labelIds,
        };
        const headers = res.data.payload.headers;
        headers.forEach((header) => {
          switch (header.name) {
            case "Date":
              email["date"] = header.value;
              break;
            case "Subject":
              email["subject"] = header.value;
              break;
            case "From":
              email["from"] = header.value;
              break;
            case "To":
              email["to"] = header.value;
              break;
          }
        });
        resolve(email);
      }
    );
  });
}

exports.handler();
