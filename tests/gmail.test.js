const { handler } = require("../gmail");

test("SMOKE TEST: Verify no errors for main handler function", async () => {
  const res = handler();
  expect(res).toBe(true);
});
