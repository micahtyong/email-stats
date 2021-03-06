"use strict";
const fs = require("fs").promises;
const readline = require("readline-sync");
const { google } = require("googleapis");
const Promise = require("bluebird");
const Verifier = require("email-verifier");
const { write: dynamoWrite } = require("./dynamo/write");
const dotenv = require("dotenv");
dotenv.config();

// If modifying these scopes, delete token.json.
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = "./token.json";

async function main() {
  const credentials = await fs.readFile("./credentials.json");
  const authToken = await authorize(JSON.parse(credentials));
  const res = await gmailStatsToDB(authToken);
  return res;
}

/**
 * Main Lambda function after authentication
 *
 * @param {google.auth.OAuth2} auth
 */
async function gmailStatsToDB(auth) {
  // 0) Get user profile information
  const user = await getProfile(auth);

  // 1) Collect email keys from the preceding hour
  const pastHour = getLastHour();
  const rawEmails = [
    ...(await getEmailKeys(auth, ["INBOX"], pastHour)),
    ...(await getEmailKeys(auth, ["SENT"], pastHour)),
  ];

  // 2) Format emails
  const emails = await Promise.map(rawEmails, (email) =>
    parseEmail(auth, email)
  );

  // 3) Extract metrics from emails
  const emailStats = await getEmailStats(user, emails);

  // 4) Write to DB
  const input = {
    ...emailStats,
    id: user.emailAddress,
    isDeleted: false,
    time: pastHour,
  };
  return await dynamoWrite(input);
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
 *
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
 * @source for email-verifier: https://www.npmjs.com/package/email-verifier.
 * @param {string} emailAddress
 *
 * ex) team@calblueprint.org => true
 * reject(`error: ${error.message}`)
 * reject(`stderr: ${stderr}`)
 *
 * note: email-verifier 1) has no Promise support and 2) a rate limit of 10/second
 */
function isGmailHosted(emailAddress) {
  const verifier = new Verifier(process.env.AWS_EMAIL_VERIFICATION_KEY);
  return new Promise((resolve) => {
    verifier.verify(emailAddress, (err, data) => {
      if (err) resolve(false);
      resolve(
        data &&
          data.mxRecords &&
          data.mxRecords.length > 0 &&
          data.mxRecords[0].includes("google.com")
      );
    });
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
    token = JSON.parse(await fs.readFile(TOKEN_PATH));
  } catch (err) {
    token = JSON.parse(await getNewToken(oAuth2Client));
  }
  oAuth2Client.setCredentials(token);
  return oAuth2Client;
}

/**
 * Get and store new token after prompting for user authorization.
 * Store the token to disk for later program executions.
 * @source for async reads: https://stackoverflow.com/questions/43638105/how-to-get-synchronous-readline-or-simulate-it-using-async-in-nodejs
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 */
async function getNewToken(oAuth2Client) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });
  console.log("Authorize this app by visiting this url:", authUrl);
  const code = readline.question("Enter the code from that page here: ");
  try {
    let { tokens } = await oAuth2Client.getToken(code);
    tokens = JSON.stringify(tokens);
    await fs.writeFile(TOKEN_PATH, tokens);
    return tokens;
  } catch (err) {
    throw err;
  }
}

/**
 * Returns user profile information based on authorized client.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
async function getProfile(auth) {
  const gmail = google.gmail({ version: "v1", auth });
  try {
    const res = await gmail.users.getProfile({
      userId: "me",
    });
    return res.data;
  } catch (err) {
    throw "The API returned an error while fetching user: " + err;
  }
}

/**
 * Fetches received messages in the user's account.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
async function getEmailKeys(auth, labels, hourAgo) {
  const gmail = google.gmail({ version: "v1", auth });
  try {
    const res = await gmail.users.messages.list({
      userId: "me",
      q: `after:${hourAgo}`,
      labelIds: labels,
    });
    const msgs = res.data.messages;
    if (msgs) {
      return msgs;
    } else {
      return [];
    }
  } catch (err) {
    throw "The API returned an error: " + err;
  }
}

/**
 * Parse a single raw email.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 * @param {gmail_v1.Schema$Message} rawEmail A raw email retrieved from Gmail API client.
 */
async function parseEmail(auth, rawEmail) {
  const gmail = google.gmail({ version: "v1", auth });
  try {
    const res = await gmail.users.messages.get({
      userId: "me",
      id: rawEmail["id"],
    });
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
    return email;
  } catch (err) {
    throw "The email is invalid: " + err;
  }
}

exports.handler = main;
exports.handler();
