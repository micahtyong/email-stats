const { read, rangeScan } = require("../dynamo/read");

test("Read 1604707200 from DB. I sent and received 10 emails from both categories during this period.", async () => {
  const data = await read("micahtyong@gmail.com", 1604707200);
  expect(data).toStrictEqual({
    toMeFromGmail: 10,
    fromMeToGmail: 10,
    isDeleted: false,
    time: 1604707200,
    id: "micahtyong@gmail.com",
    toMeFromNonGmail: 10,
    fromMeToNonGmail: 10,
  });
});

test("Read non-existent key from DB. Catch an error.", async () => {
  try {
    await read("micahtyong@gmail.com", 100);
  } catch (e) {
    expect(e).toMatch("gmail-stats::fetchOneByKey::keyNotFound");
  }
});

test("Read key of invalid type (string) in DB. Catch an error.", async () => {
  try {
    await read("micahtyong@gmail.com", "500");
  } catch (e) {
    expect(e).toMatch("gmail-stats::fetchOneByKey::invalidInput - string");
  }
});

test("Read key of invalid type (object) in DB. Catch an error.", async () => {
  try {
    await read("", new String("hi"));
  } catch (e) {
    expect(e).toMatch("gmail-stats::fetchOneByKey::invalidInput - object");
  }
});

test("Range scan from 1604707200 to 1604710800 for micahtyong@gmail.com", async () => {
  const data = await rangeScan("micahtyong@gmail.com", 1604707200, 1604710800);
  expect(data).toStrictEqual({
    email: "micahtyong@gmail.com",
    times: [1604707200, 1604710800],
    toMeFromGmail: [10, 5],
    toMeFromNonGmail: [10, 2],
    fromMeToGmail: [10, 3],
    fromMeToNonGmail: [10, 2],
  });
});

test("Range scan where key (email / id) is not found. Catch an error.", async () => {
  try {
    await rangeScan("mong@gmil.com", 1604707200, 1604710800);
  } catch (e) {
    expect(e).toMatch("gmail-stats::rangeScan::keyNotFound");
  }
});
