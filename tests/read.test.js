const { read } = require("../dynamo/read");

test("Read 1604707200 from DB. I sent and received 10 emails from both categories during this period.", async () => {
  const data = await read(1604707200);
  expect(data).toStrictEqual({
    toMeFromGmail: 10,
    fromMeToGmail: 10,
    isDeleted: false,
    time: 1604707200,
    id: "1604707200",
    email: "micahtyong@gmail.com",
    toMeFromNonGmail: 10,
    fromMeToNonGmail: 10,
  });
});

test("Read non-existent key from DB. Catch an error.", async () => {
  expect.assertions(1);
  try {
    await read(100);
  } catch (e) {
    expect(e).toMatch("gmail-stats::fetchOneByKey::keyNotFound");
  }
});

test("Read key of invalid type (string) in DB. Catch an error.", async () => {
  expect.assertions(1);
  try {
    await read("500");
  } catch (e) {
    expect(e).toMatch("gmail-stats::fetchOneByKey::invalidInput - string");
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
