const { test } = require("node:test");
const assert = require("node:assert/strict");
const { nextCodeNumber } = require("../utils/codeSequence");

const delegateWith = (codes) => ({ findMany: async () => codes.map((code) => ({ code })) });

test("starts one past the floor when the series is empty", async () => {
  assert.equal(await nextCodeNumber(delegateWith([]), { programId: "p", prefix: "MR-", floor: 2600 }), 2601);
});

test("continues past the highest code, not the row count", async () => {
  // MR-2602 was deleted: counting rows would reissue MR-2603
  const codes = ["MR-2601", "MR-2603"];
  assert.equal(await nextCodeNumber(delegateWith(codes), { programId: "p", prefix: "MR-", floor: 2600 }), 2604);
});

test("reads the number before a suffix", async () => {
  const codes = ["PRJ-02-K3X9", "PRJ-07-AB12", "PRJ-custom"];
  assert.equal(await nextCodeNumber(delegateWith(codes), { programId: "p", prefix: "PRJ-" }), 8);
});
