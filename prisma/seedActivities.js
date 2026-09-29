/**
 * Platform Activity taxonomy seed from Cropfort Coffee Field OS Template.xlsx
 * Sheet: "Activity List"
 *
 *   node prisma/seedActivities.js
 *
 * Upsert keyed on id so re-runs sync corrections without duplicates.
 */

const path = require("path");
const ExcelJS = require("exceljs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

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

/**
 * @param {string} [xlsxPath]
 * @returns {Promise<{ id: string; tier: number; category: string; name: string; unitOfMeasure: string }[]>}
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
    rows.push({ id, tier, category, name, unitOfMeasure });
  });

  return rows;

}

async function seedActivities(client = prisma, xlsxPath = DEFAULT_XLSX) {
  const ACTIVITY_ROWS = await loadActivitiesFromExcel(xlsxPath);
  if (!ACTIVITY_ROWS.length) {
    console.warn("[seedActivities] No activity rows found in Excel.");
    return { upserted: 0 };
  }

  const byTier = { 1: 0, 2: 0, 3: 0 };
  let upserted = 0;
  for (const row of ACTIVITY_ROWS) {
    await client.activities.upsert({
      where: { id: row.id },
      create: {
        id: row.id,
        tier: row.tier,
        category: row.category,
        name: row.name,
        unitOfMeasure: row.unitOfMeasure,
      },
      update: {
        tier: row.tier,
        category: row.category,
        name: row.name,
        unitOfMeasure: row.unitOfMeasure,
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
