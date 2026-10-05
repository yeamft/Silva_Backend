/**
 * Platform Activity taxonomy seed from Cropfort Coffee Field OS Template.xlsx
 * Sheet: "Activity List"
 *
 *   node prisma/seedActivities.js
 *
 * Upsert keyed on id so re-runs sync corrections without duplicates.
 * Falls back to prisma/activity-taxonomy-seed.json if the Excel file is missing.
 */

require("dotenv").config();
const path = require("path");
const fs = require("fs");
const ExcelJS = require("exceljs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({ log: ["error", "warn"] });

const DEFAULT_XLSX = path.join(
  __dirname,
  "..",
  "data",
  "Cropfort Coffee Field OS Template.xlsx",
);

function cellText(cell) {
  if (cell == null) return "";
  const v = cell.value;
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v).trim();
  if (typeof v === "object") {
    if (v.text != null) return String(v.text).trim();
    if (v.result != null) return String(v.result).trim();
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text || "").join("").trim();
  }
  return String(v).trim();
}

function parseTier(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/tier\s*([123])/i) || s.match(/^([123])\b/);
  if (!m) return null;
  return Number(m[1]);
}

async function loadActivitiesFromJson(jsonPath = path.join(__dirname, "activity-taxonomy-seed.json")) {
  const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  return raw.map((row, index) => ({
    id: row.id,
    code: row.code || row.id,
    tier: Number(row.tier),
    category: String(row.category || "").trim(),
    name: String(row.name || "").trim(),
    description: row.description ?? null,
    unitOfMeasure: String(row.unitOfMeasure || "").trim(),
    active: row.active !== false,
    sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : index + 1,
  }));
}

/**
 * @param {string} [xlsxPath]
 * @returns {Promise<{ id: string; code: string; tier: number; category: string; name: string; description: string|null; unitOfMeasure: string; active: boolean; sortOrder: number }[]>}
 */
async function loadActivitiesFromExcel(xlsxPath = DEFAULT_XLSX) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);
  const ws = wb.getWorksheet("Activity List");
  if (!ws) throw new Error('Worksheet "Activity List" not found in template');

  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const id = cellText(row.getCell(1));
    const tier = parseTier(cellText(row.getCell(2)));
    const category = cellText(row.getCell(3));
    const name = cellText(row.getCell(4));
    const unitOfMeasure = cellText(row.getCell(5));

    if (!id) return;
    if (!tier || ![1, 2, 3].includes(tier)) {
      throw new Error(`Row ${rowNumber}: invalid tier for ${id}: "${cellText(row.getCell(2))}"`);
    }
    if (!category || !name || !unitOfMeasure) {
      throw new Error(
        `Row ${rowNumber}: missing category/name/unit for ${id} (${JSON.stringify({
          category,
          name,
          unitOfMeasure,
        })})`,
      );
    }
    rows.push({
      id,
      code: id,
      tier,
      category,
      name,
      description: null,
      unitOfMeasure,
      active: true,
      sortOrder: rows.length + 1,
    });
  });

  return rows;
}

async function seedActivities(client = prisma, xlsxPath = DEFAULT_XLSX) {
  let ACTIVITY_ROWS = [];
  if (fs.existsSync(xlsxPath)) {
    try {
      ACTIVITY_ROWS = await loadActivitiesFromExcel(xlsxPath);
    } catch (err) {
      console.warn(`[seedActivities] Excel load failed (${err.message}); falling back to JSON.`);
    }
  } else {
    console.warn(`[seedActivities] Excel not found at ${xlsxPath}; using JSON seed.`);
  }
  if (!ACTIVITY_ROWS.length) {
    ACTIVITY_ROWS = await loadActivitiesFromJson();
  }
  if (!ACTIVITY_ROWS.length) {
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
  for (const row of ACTIVITY_ROWS) {
    await client.activities.upsert({
      where: { id: row.id },
      create: {
        id: row.id,
        code: row.code || row.id,
        tier: row.tier,
        category: row.category,
        name: row.name,
        description: row.description ?? null,
        unitOfMeasure: row.unitOfMeasure,
        active: row.active !== false,
        sortOrder: row.sortOrder ?? upserted + 1,
      },
      update: {
        code: row.code || row.id,
        tier: row.tier,
        category: row.category,
        name: row.name,
        description: row.description ?? null,
        unitOfMeasure: row.unitOfMeasure,
        active: row.active !== false,
        sortOrder: row.sortOrder ?? upserted + 1,
      },
    });
    byTier[row.tier] += 1;
    upserted += 1;
  }

  console.log(
    `[seedActivities] upserted ${upserted} activities (T1=${byTier[1]}, T2=${byTier[2]}, T3=${byTier[3]})`,
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

module.exports = { seedActivities, loadActivitiesFromExcel };
