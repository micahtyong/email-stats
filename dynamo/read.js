const AWS = require("aws-sdk");
const dotenv = require("dotenv");
dotenv.config();

const awsConfig = {
  region: "us-east-1",
  endpoint: "http://dynamodb.us-east-1.amazonaws.com",
  accessKeyId: process.env.AWS_DB_ACCESS_KEY,
  secretAccessKey: process.env.AWS_DB_SECRET_KEY,
};
AWS.config.update(awsConfig);

const docClient = new AWS.DynamoDB.DocumentClient();
/**
 * Fetches Gmail stats from DB in raw form
 * @param {string} time in Unix (seconds) (stringified)
 */
const fetchOneByKey = function (email, time) {
  const params = {
    TableName: "gmail-stats",
    Key: {
      id: email,
      time: time,
    },
  };
  return new Promise((resolve, reject) => {
    if (typeof time !== "number")
      return reject(
        "gmail-stats::fetchOneByKey::invalidInput - " + typeof time
      );
    docClient.get(params, function (err, data) {
      if (err) return reject("gmail-stats::fetchOneByKey::error - " + err);
      console.log(data);
      if (!data.Item) return reject("gmail-stats::fetchOneByKey::keyNotFound");
      resolve(data.Item);
    });
  });
};

/**
 * Fetches gmail data according to some range
 * Formats for frontend client.
 */
const rangeScan = function (email, start, end) {
  const params = {
    TableName: "gmail-stats",
    KeyConditionExpression: "id = :id AND #t between :start AND :end",
    ExpressionAttributeNames: {
      "#t": "time",
    },
    ExpressionAttributeValues: {
      ":id": email,
      ":start": start,
      ":end": end,
    },
  };
  return new Promise((resolve, reject) => {
    docClient.query(params, function (err, data) {
      if (err) return reject("gmail-stats::rangeScan::error - " + err);
      if (
        !data.Items ||
        data.Items.length === 0 ||
        !data.Items[0].hasOwnProperty("id")
      )
        return reject("gmail-stats::rangeScan::keyNotFound");
      // Step 0: Initialize variables
      const email = data.Items[0].id;
      const times = [];
      const toMeFromGmail = [];
      const toMeFromNonGmail = [];
      const fromMeToGmail = [];
      const fromMeToNonGmail = [];

      // Step 1: Iterate through Items, filtering, sorting, then extracting
      let items = data.Items;
      for (gmailItem of items) {
        times.push(gmailItem.time);
        toMeFromGmail.push(gmailItem.toMeFromGmail);
        toMeFromNonGmail.push(gmailItem.toMeFromNonGmail);
        fromMeToGmail.push(gmailItem.fromMeToGmail);
        fromMeToNonGmail.push(gmailItem.fromMeToNonGmail);
      }

      // Step 2: Resolve!
      resolve({
        email,
        times,
        toMeFromGmail,
        toMeFromNonGmail,
        fromMeToGmail,
        fromMeToNonGmail,
      });
    });
  });
};

exports.read = fetchOneByKey;
exports.rangeScan = rangeScan;
