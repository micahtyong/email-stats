const { read } = require("../dynamo/read");

test("Read 1604782800 (11/7/20 1 - 2 PM PST) from DB. I sent and received no emails during this period.", async () => {
  const data = await read("1604782800");
  expect(data).toStrictEqual({
    toMeFromGmail: 0,
    fromMeToGmail: 0,
    isDeleted: false,
    time: "1604782800",
    email: "micahtyong@gmail.com",
    toMeFromNonGmail: 0,
    fromMeToNonGmail: 0,
  });
});

test("Read 1604714400 (11/6/20 6 - 7 PM PST) from DB. I sent one email and received two emails during this period. One sent email was to supermicahyong@gmail.com. One received email was from accounts.google.com, the other was from linkedin.com", async () => {
  const data = await read("1604714400");
  expect(data).toStrictEqual({
    toMeFromGmail: 1,
    fromMeToGmail: 1,
    isDeleted: false,
    time: "1604714400",
    email: "micahtyong@gmail.com",
    toMeFromNonGmail: 1,
    fromMeToNonGmail: 0,
  });
});

test("Read non-existent key from DB. Catch an error.", async () => {
  expect.assertions(1);
  try {
    await read("bad input");
  } catch (e) {
    expect(e).toMatch("gmail-stats::fetchOneByKey::keyNotFound");
  }
});

test("Read key of invalid type (number) in DB. Catch an error.", async () => {
  expect.assertions(1);
  try {
    await read(10000);
  } catch (e) {
    expect(e).toMatch("gmail-stats::fetchOneByKey::invalidInput - number");
  }
});

test("Read key of invalid type (object) in DB. Catch an error.", async () => {
  expect.assertions(1);
  try {
    await read(new String("hi"));
  } catch (e) {
    expect(e).toMatch("gmail-stats::fetchOneByKey::invalidInput - object");
  }
});
