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
 * Adds or updates DB with new Gmail stats
 * @param {Stats} input Gmail stats object
 */
const write = function (input) {
  const params = {
    TableName: "gmail-stats",
    Item: input,
  };
  return new Promise((resolve, reject) => {
    if (!input.hasOwnProperty("time"))
      return reject("gmail-stats::save::inputError - no 'time' attribute");
    if (!(typeof input.time === "string"))
      return reject(
        "gmail-stats::save::inputError - 'time' attribute of type " +
          typeof input.time
      );
    docClient.put(params, function (err) {
      if (err) reject("gmail-stats::save::error - " + err);
      resolve("gmail-stats::save::success");
    });
  });
};

exports.write = write;
