const fs = require("fs");
const readline = require("readline");
const { google } = require("googleapis");
const { exec } = require("child_process");

// If modifying these scopes, delete token.json.
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = "token.json";

// Load client secrets from a local file.
fs.readFile("credentials.json", (err, content) => {
  if (err) return console.log("Error loading client secret file:", err);
  // Authorize a client with credentials, then call the Gmail API.
  authorize(JSON.parse(content), gmailStatsToDB);
});

/**
 * Main Lambda function to
 * 0) Get user profile information
 * 1) Collect emails from the preceding hour
 * 2) Format emails
 * 3) Extract metrics from emails
 * @param {google.auth.OAuth2} auth
 */
async function gmailStatsToDB(auth) {
  const user = await getProfile(auth);
  const rawEmails = await getRawEmails(auth, ["INBOX"]);
  rawEmails.push(...(await getRawEmails(auth, ["SENT"])));
  const emails = await getParsedEmails(auth, rawEmails);
  const emailStats = await getEmailStats(user, emails);
  console.log(emailStats);
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
    ToMeFromGmail: 0,
    ToMeFromNonGmail: 0,
    FromMeToGmail: 0,
    FromMeToNonGmail: 0,
  };
  for (const email of emails) {
    const sentToMe = email.to.includes(user.emailAddress);
    const sentFromMe = email.from.includes(user.emailAddress);
    const fromGmail =
      email.from.includes("gmail.com") || (await isGmailHosted(email.from));
    const toGmail =
      email.to.includes("gmail.com") || (await isGmailHosted(email.to));
    if (sentToMe && fromGmail) {
      stats.ToMeFromGmail += 1;
    } else if (sentToMe && !fromGmail) {
      stats.ToMeFromNonGmail += 1;
    } else if (sentFromMe && toGmail) {
      stats.FromMeToGmail += 1;
    } else {
      stats.FromMeToNonGmail += 1;
    }
  }
  return stats;
}

/**
 * Determines whether email domain is managed by Google.
 * 1) Extract domain name
 * 2) Execute shell child process to check host (@source: https://stackabuse.com/executing-shell-commands-with-node-js/)
 * @param {string} emailAddress
 */
function isGmailHosted(emailAddress) {
  const domain = emailAddress.match(/(?<=@)[^.]+.(\w+)/g);
  return new Promise((resolve, reject) => {
    if (domain.length) {
      exec(`host ${domain[0]}`, (error, stdout, stderr) => {
        if (error) reject(`error: ${error.message}`);
        if (stderr) reject(`stderr: ${stderr}`);
        console.log(`stdout: ${stdout}`);
        resolve(stdout.includes("google.com"));
      });
    }
  });
}

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getNewToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getNewToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
  });
  console.log("Authorize this app by visiting this url:", authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question("Enter the code from that page here: ", (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error("Error retrieving access token", err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log("Token stored to", TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

/**
 * Returns user profile information based on authorized client.
 *
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
          reject("The API returned an error while fetching user: " + err);
        resolve(res.data);
      }
    );
  });
}

/**
 * Lists the labels in the user's account.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function getLabels(auth) {
  const gmail = google.gmail({ version: "v1", auth });
  const emailLabels = [];
  gmail.users.labels.list(
    {
      userId: "me",
    },
    (err, res) => {
      if (err) return console.log("The API returned an error: " + err);
      const labels = res.data.labels;
      if (labels.length) {
        labels.forEach((label) => {
          console.log(`- ${label.name}`);
          emailLabels.push(label);
        });
      } else {
        console.log("No labels found.");
      }
    }
  );
  return emailLabels;
}

/**
 * Fetches received messages in the user's account.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function getRawEmails(auth, labels) {
  const gmail = google.gmail({ version: "v1", auth });
  const hourAgo = Math.floor(Date.now() / 1000 - 3600);
  return new Promise((resolve, reject) => {
    gmail.users.messages.list(
      {
        userId: "me",
        q: `after:${hourAgo}`,
        labelIds: labels,
      },
      (err, res) => {
        if (err) reject("The API returned an error " + err);
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
 *
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
        if (err) reject("The email is invalid: " + err);
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
