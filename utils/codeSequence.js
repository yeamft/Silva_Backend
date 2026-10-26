/**
 * Next number for a `<prefix><n>…` code series: one past the highest existing number, and never
 * below `floor + 1`. Counting rows instead would reissue a live code after any delete.
 */
async function nextCodeNumber(delegate, { programId, prefix, floor = 0 }) {
  const rows = await delegate.findMany({
    where: { programId, code: { startsWith: prefix } },
    select: { code: true },
  });
  let max = floor;
  for (const { code } of rows) {
    const n = Number.parseInt(code.slice(prefix.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

function isUniqueViolation(err) {
  return err && err.code === "P2002";
}

module.exports = { nextCodeNumber, isUniqueViolation };
