const { randomUUID, createHash, randomBytes } = require("crypto");

function uuid(prefix) {
  const id = randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function rawToken(bytes = 32) {
  return randomBytes(bytes).toString("hex");
}

module.exports = { uuid, hashToken, rawToken };
