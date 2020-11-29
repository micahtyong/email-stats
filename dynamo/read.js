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
const fetchOneByKey = function (time) {
  const params = {
    TableName: "gmail-stats",
    Key: {
      id: time.toString(),
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
const rangeScan = function (start, end) {
  const params = {
    TableName: "gmail-stats",
    Limit: 60,
  };
  return new Promise((resolve, reject) => {
    docClient.scan(params, function (err, data) {
      if (err) return reject("gmail-stats::rangeScan::error - " + err);
      if (!data.Items) return reject("gmail-stats::rangeScan::keyNotFound");
      // Step 0: Initialize variables
      const email = data.Items[0].email || "micahtyong@gmail.com";
      const times = [];
      const toMeFromGmail = [];
      const toMeFromNonGmail = [];
      const fromMeToGmail = [];
      const fromMeToNonGmail = [];

      // Step 1: Iterate through Items, filtering, sorting, then extracting
      let items = data.Items;
      items = items.filter(
        (item) => parseInt(item.time) >= start && parseInt(item.time) <= end
      );
      items.sort(function (a, b) {
        return parseInt(a.time) - parseInt(b.time);
      });
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

exports
  .rangeScan(1605157200, 1605420000)
  .then((res) => console.log(res))
  .catch((err) => console.log(err));
