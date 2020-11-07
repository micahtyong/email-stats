const AWS = require("aws-sdk");
const dotenv = require("dotenv");
dotenv.config();

let awsConfig = {
  region: "us-east-1",
  endpoint: "http://dynamodb.us-east-1.amazonaws.com",
  accessKeyId: process.env.AWS_ACCESS_KEY,
  secretAccessKey: process.env.AWS_SECRET_KEY,
};
AWS.config.update(awsConfig);

let docClient = new AWS.DynamoDB.DocumentClient();

let write = function (input) {
  //   const input = {
  //     time: "1604711690",
  //     email: "micahtyong@gmail.com",
  //     toMeFromGmail: 0,
  //     toMeFromNonGmail: 0,
  //     fromMeToGmail: 0,
  //     fromMeToNonGmail: 0,
  //     isDeleted: false,
  //   };
  const params = {
    TableName: "gmail-stats",
    Item: input,
  };
  docClient.put(params, function (err, data) {
    if (err) {
      console.log("gmail-stats::save::error - " + JSON.stringify(err, null, 2));
    } else {
      console.log("gmail-stats::save::success");
    }
  });
};

exports.write = write;
