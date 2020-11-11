# Email Stats

Scheduled lambda to collect basic email stats via Google's Gmail API. This repository can be used as a template for backend tasks that 1) communicate with an external source via API (e.g. gmail, twitter), and 2) stores data in a backend with basic CRUD functions set up. 

# Getting Started 

1. Clone this repository and run `npm i`. 
2. Create a .env file with API keys for DynamoDB. Store in root directory.
3. Create a project in [Google's Developer Console](https://console.developers.google.com/) with Gmail enabled to retrieve a credentials file `credentials.json`. Store in root directory. 
4. Run locally once with `node .`, which will generate `token.json` after you authenticate with your Gmail account.
5. Upload to AWS Lambda. 

# Technology 

- Written in Node.js. 
- Unit testing in Jest. 
- Hosted on AWS Lambda.
- Stores API data in AWS DynamoDB. 
