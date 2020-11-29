const { write } = require("../dynamo/write");
const { read } = require("../dynamo/read");

test("Write 1604710800 (11/6/20 5 - 6 PM PST) to DB.", async () => {
  const input = {
    toMeFromGmail: 5,
    fromMeToGmail: 3,
    isDeleted: false,
    time: 1604710800,
    id: "micahtyong@gmail.com",
    toMeFromNonGmail: 2,
    fromMeToNonGmail: 2,
  };
  const response = await write(input);
  expect(response).toBe("gmail-stats::save::success");
});

test("Write then read 1604707200 (11/6/20 4 - 5 PM PST) to DB.", async () => {
  const input = {
    toMeFromGmail: 10,
    fromMeToGmail: 10,
    isDeleted: false,
    time: 1604707200,
    id: "micahtyong@gmail.com",
    toMeFromNonGmail: 10,
    fromMeToNonGmail: 10,
  };
  const writeResponse = await write(input);
  expect(writeResponse).toBe("gmail-stats::save::success");
  const readData = await read(input.id, 1604707200);
  expect(readData).toStrictEqual(input);
});

test("Write without primary or sorted key (id or time). Catch an error.", async () => {
  expect.assertions(1);
  const badInput = {
    toMeFromGmail: 5,
    id: "micahtyong@gmail.com",
    fromMeToNonGmail: 2,
  };
  try {
    await write(badInput);
  } catch (e) {
    expect(e).toBe("gmail-stats::save::inputError - no 'time' attribute");
  }
});

test("Write with invalid sorted key (string instead of number). Catch an error.", async () => {
  expect.assertions(1);
  const badInput = {
    toMeFromGmail: 5,
    id: "micahtyong@gmail.com",
    time: "1604710800",
    fromMeToNonGmail: 2,
  };
  try {
    await write(badInput);
  } catch (e) {
    expect(e).toBe(
      "gmail-stats::save::inputError - 'time' attribute of type string"
    );
  }
});
