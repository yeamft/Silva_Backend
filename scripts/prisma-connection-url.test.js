const { test } = require("node:test");
const assert = require("node:assert/strict");
const { withPrismaConnectionLimit } = require("../config/prisma-connection-url");

test("defaults Prisma connection limit to three", () => {
  const url = new URL(withPrismaConnectionLimit("postgresql://db.example/app"));
  assert.equal(url.searchParams.get("connection_limit"), "3");
});

test("uses configured Prisma connection limit", () => {
  const url = new URL(withPrismaConnectionLimit("postgresql://db.example/app", "5"));
  assert.equal(url.searchParams.get("connection_limit"), "5");
});

test("preserves connection limit already set in database URL", () => {
  const url = new URL(
    withPrismaConnectionLimit("postgresql://db.example/app?connection_limit=7", "3"),
  );
  assert.equal(url.searchParams.get("connection_limit"), "7");
});

test("rejects invalid configured limits", () => {
  assert.throws(
    () => withPrismaConnectionLimit("postgresql://db.example/app", "0"),
    /PRISMA_CONNECTION_LIMIT must be a positive integer/,
  );
});

