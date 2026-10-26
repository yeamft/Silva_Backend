const { test } = require("node:test");
const assert = require("node:assert/strict");
const cache = require("../utils/authContextCache");

test("returns cached value until cleared", () => {
  cache.clear();
  cache.set("u1:s1", { id: "u1" });
  assert.deepEqual(cache.get("u1:s1"), { id: "u1" });
  cache.clear();
  assert.equal(cache.get("u1:s1"), null);
});

test("never outlives the session expiry", () => {
  cache.clear();
  cache.set("u1:s1", { id: "u1" }, new Date(Date.now() - 1));
  assert.equal(cache.get("u1:s1"), null);
});

test("expires after the TTL", (t) => {
  cache.clear();
  t.mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
  cache.set("u1:s1", { id: "u1" });
  t.mock.timers.tick(cache.TTL_MS + 1);
  assert.equal(cache.get("u1:s1"), null);
});
