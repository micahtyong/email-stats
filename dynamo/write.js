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
const write = async function (input) {
  if (!input.hasOwnProperty("time"))
    throw "gmail-stats::save::inputError - no 'time' attribute";
  if (!input.hasOwnProperty("id"))
    throw "gmail-stats::save::inputError - no 'id' attribute";
  if (!(typeof input.time === "number"))
    throw (
      "gmail-stats::save::inputError - 'time' attribute of type " +
      typeof input.time
    );
  const params = {
    TableName: "gmail-stats",
    Item: input,
  };
  try {
    await docClient.put(params).promise();
    return "gmail-stats::save::success";
  } catch (err) {
    throw "gmail-stats::save::error - " + err;
  }
};

exports.write = write;
