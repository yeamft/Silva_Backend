/**
 * Platform Activity taxonomy seed — Silva workbook field operations (NU/YC/MC/IF/HR).
 *
 *   node prisma/seedActivities.js
 *
 * Upserts all activities from activity-taxonomy-seed.json without changing
 * activity records that are not included in the seed.
 */

require("dotenv").config();
const path = require("path");
const fs = require("fs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({ log: ["error", "warn"] });

const JSON_SEED = path.join(__dirname, "activity-taxonomy-seed.json");

function loadFromJson(jsonPath = JSON_SEED) {
  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  return raw.map((row, index) => ({
    id: String(row.id || row.code).trim(),
    code: String(row.code || row.id).trim(),
    tier: Number(row.tier),
    category: String(row.category || "").trim(),
    subgroup: String(row.subgroup || "").trim(),
    name: String(row.name || "").trim(),
    nameAm: row.nameAm ? String(row.nameAm).trim() : null,
    description: row.description ?? null,
    unitOfMeasure: String(row.unitOfMeasure || "").trim(),
    active: row.active !== false,
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : index + 1,
  }));
}

async function seedActivities(client = prisma) {
  const rows = loadFromJson();
  if (!rows.length) {
    console.warn("[seedActivities] No activity rows found.");
    return { upserted: 0 };
  }

  // Warm the connection — Supabase session pool can reject the first attempt.
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await client.$connect();
      break;
    } catch (err) {
      if (attempt === 5) throw err;
      console.warn(`[seedActivities] connect attempt ${attempt} failed; retrying…`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  const byTier = { 1: 0, 2: 0, 3: 0 };
  let upserted = 0;

  for (const row of rows) {
    await client.activities.upsert({
      where: { id: row.id },
      create: {
        id: row.id,
        code: row.code,
        tier: row.tier,
        category: row.category,
        subgroup: row.subgroup,
        name: row.name,
        nameAm: row.nameAm,
        description: row.description,
        unitOfMeasure: row.unitOfMeasure,
        active: row.active,
        sortOrder: row.sortOrder,
      },
      update: {
        code: row.code,
        tier: row.tier,
        category: row.category,
        subgroup: row.subgroup,
        name: row.name,
        nameAm: row.nameAm,
        description: row.description,
        unitOfMeasure: row.unitOfMeasure,
        active: row.active,
        sortOrder: row.sortOrder,
      },
    });
    byTier[row.tier] = (byTier[row.tier] || 0) + 1;
    upserted += 1;
  }

  console.log(
    `[seedActivities] upserted ${upserted} activities (T1=${byTier[1] || 0}, T2=${byTier[2] || 0}, T3=${byTier[3] || 0})`,
  );
  return { upserted, byTier };
}

async function main() {
  await seedActivities();
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = { seedActivities };
