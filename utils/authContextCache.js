/**
 * Short-lived, per-process cache of the authenticated request context (session + user + org +
 * roles) so authenticateJWT doesn't hit the database on every request.
 *
 * config/database.js clears it on any write to the tables it is built from. Other API processes
 * don't see that clear, so TTL_MS is the upper bound on staleness across instances.
 */
const TTL_MS = 30_000;
const MAX_ENTRIES = 5000;

const entries = new Map();

function get(key) {
  const entry = entries.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    entries.delete(key);
    return null;
  }
  return entry.value;
}

/** `notAfter` caps the entry at the session's own expiry. */
function set(key, value, notAfter) {
  const expiresAt = Math.min(Date.now() + TTL_MS, notAfter ? new Date(notAfter).getTime() : Infinity);
  if (entries.size >= MAX_ENTRIES && !entries.has(key)) {
    entries.delete(entries.keys().next().value);
  }
  entries.set(key, { value, expiresAt });
}

function clear() {
  entries.clear();
}

module.exports = { get, set, clear, TTL_MS };
