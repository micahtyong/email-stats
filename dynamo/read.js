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
const fetchOneByKey = async function (email, time) {
  if (typeof time !== "number")
    throw "gmail-stats::fetchOneByKey::invalidInput - " + typeof time;
  const params = {
    TableName: "gmail-stats",
    Key: {
      id: email,
      time: time,
    },
  };
  try {
    const data = await docClient.get(params).promise();
    if (!data.Item) throw "gmail-stats::fetchOneByKey::keyNotFound";
    return data.Item;
  } catch (err) {
    throw "gmail-stats::fetchOneByKey::error - " + err;
  }
};

/**
 * Fetches gmail data according to some range
 * Formats for frontend client.
 */
const rangeScan = async function (email, start, end) {
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
  try {
    const data = await docClient.query(params).promise();
    if (
      !data.Items ||
      data.Items.length === 0 ||
      !data.Items[0].hasOwnProperty("id")
    )
      throw "gmail-stats::rangeScan::keyNotFound";

    // Step 0: Initialize variables
    const email = data.Items[0].id;
    const times = [];
    const toMeFromGmail = [];
    const toMeFromNonGmail = [];
    const fromMeToGmail = [];
    const fromMeToNonGmail = [];

    // Step 1: Extract
    let items = data.Items;
    for (gmailItem of items) {
      times.push(gmailItem.time);
      toMeFromGmail.push(gmailItem.toMeFromGmail);
      toMeFromNonGmail.push(gmailItem.toMeFromNonGmail);
      fromMeToGmail.push(gmailItem.fromMeToGmail);
      fromMeToNonGmail.push(gmailItem.fromMeToNonGmail);
    }

    // Step 2: Resolve!
    return {
      email,
      times,
      toMeFromGmail,
      toMeFromNonGmail,
      fromMeToGmail,
      fromMeToNonGmail,
    };
  } catch (err) {
    throw "gmail-stats::rangeScan::error - " + err;
  }
};

exports.read = fetchOneByKey;
exports.rangeScan = rangeScan;

exports
  .rangeScan("micahtyong@gmail.com", 1604707200, 1606676400)
  .then((res) => console.log(res))
  .catch((err) => console.err(err));
