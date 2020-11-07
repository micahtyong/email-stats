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
  docClient.put(params, function (err, data) {
    if (err) {
      console.log("gmail-stats::save::error - " + JSON.stringify(err, null, 2));
    } else {
      console.log(
        "gmail-stats::save::success - " + JSON.stringify(data, null, 2)
      );
    }
  });
};

exports.write = write;
