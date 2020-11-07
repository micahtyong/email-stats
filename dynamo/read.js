const AWS = require("aws-sdk");
const dotenv = require("dotenv");
dotenv.config();

const awsConfig = {
  region: "us-east-1",
  endpoint: "http://dynamodb.us-east-1.amazonaws.com",
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
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
  docClient.get(params, function (err, data) {
    if (err) {
      console.log(
        "gmail-stats::fetchOneByKey::error - " + JSON.stringify(err, null, 2)
      );
    } else {
      console.log(
        "gmail-stats::fetchOneByKey::success - " + JSON.stringify(data, null, 2)
      );
    }
  });
};

exports.read = fetchOneByKey;
