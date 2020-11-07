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
 * Fetches Gmail stats from DB
 * @param {string} time in Unix (seconds) (stringified)
 */
const fetchOneByKey = function (time) {
  const params = {
    TableName: "gmail-stats",
    Key: {
      time: time,
    },
  };
  return new Promise((resolve, reject) => {
    if (typeof time !== "string")
      return reject(
        "gmail-stats::fetchOneByKey::invalidInput - " + typeof time
      );
    docClient.get(params, function (err, data) {
      if (err) return reject("gmail-stats::fetchOneByKey::error - " + err);
      if (!data.Item) return reject("gmail-stats::fetchOneByKey::keyNotFound");
      resolve(data.Item);
    });
  });
};

exports.read = fetchOneByKey;
