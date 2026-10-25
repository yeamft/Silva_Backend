const path = require("node:path");
const ExcelJS = require("exceljs");
const prisma = require("../config/database");

const FARM_COLUMNS = [
  ["Telli", 6, 12, 18],
  ["Gawi", 7, 13, 19],
  ["Chetu", 8, 14, 20],
  ["Ephrata", 9, 15, 21],
  ["Kamisse", 10, 16, 22],
  ["Shakisso", 11, 17, 23],
];

function cellText(row, column) {
  const value = row.getCell(column).value;
  if (value == null) return "";
  if (typeof value === "object" && "text" in value) return String(value.text || "").trim();
  return String(value).trim();
}

function cellNumber(row, column) {
  const value = row.getCell(column).value;
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value in ${row.getCell(column).address}`);
  }
  if (parsed < 0) {
    throw new Error(`Negative benchmark value in ${row.getCell(column).address}`);
  }
  return parsed;
}

async function main() {
  const workbookPath = process.argv[2];
  if (!workbookPath) {
    throw new Error("Usage: node scripts/importAnnualPlanBenchmarks.js <workbook.xlsx>");
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);
  const sheet = workbook.getWorksheet("Benchmark Data");
  if (!sheet) throw new Error('Workbook must contain a "Benchmark Data" sheet');

  const activities = [];
  for (let rowNumber = 7; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const code = cellText(row, 1);
    if (!code) continue;

    const farms = Object.fromEntries(
      FARM_COLUMNS.map(([name, costColumn, daysColumn, frequencyColumn]) => [name, {
        costPerUnit: cellNumber(row, costColumn),
        manDaysPerUnit: cellNumber(row, daysColumn),
        frequency: cellNumber(row, frequencyColumn),
      }]),
    );
    activities.push({
      id: `abact_${crypto.randomUUID()}`,
      code,
      category: cellText(row, 2),
      subgroup: cellText(row, 3),
      activityName: cellText(row, 4),
      unit: cellText(row, 5),
      farms,
      dataNotes: cellText(row, 37),
      sourceRow: rowNumber,
    });
  }

  if (activities.length !== 124) {
    throw new Error(`Expected 124 benchmark activities; found ${activities.length}`);
  }
  if (new Set(activities.map((activity) => activity.code)).size !== activities.length) {
    throw new Error("Benchmark activity codes must be unique");
  }

  const sourceFile = path.basename(workbookPath);
  const version = path.basename(workbookPath, path.extname(workbookPath));
  const set = await prisma.cropfort_annual_benchmark_sets.upsert({
    where: { version },
    create: { id: `abset_${crypto.randomUUID()}`, version, sourceFile },
    update: { sourceFile, importedAt: new Date() },
  });
  const matched = await prisma.activities.findMany({
    where: { code: { in: activities.map((activity) => activity.code) } },
    select: { id: true, code: true },
  });
  const activityIdByCode = new Map(matched.map((activity) => [activity.code, activity.id]));
  const records = activities.map(({ farms, ...activity }) => ({
    ...activity,
    benchmarkSetId: set.id,
    taxonomyActivityId: activityIdByCode.get(activity.code) || null,
    farms,
  }));

  await prisma.$transaction([
    prisma.cropfort_annual_benchmark_activities.deleteMany({ where: { benchmarkSetId: set.id } }),
    prisma.cropfort_annual_benchmark_activities.createMany({ data: records }),
  ]);
  console.log(`Imported ${records.length} activities into benchmark set ${version}; ${matched.length} taxonomy codes matched.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());