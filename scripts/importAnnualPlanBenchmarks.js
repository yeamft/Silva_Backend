/**
 * Imports the annual-plan workbook's "Benchmark Data" sheet from the command line.
 * The app does the same through Annual Budget → Import benchmark data.
 *
 * Usage: node scripts/importAnnualPlanBenchmarks.js <workbook.xlsx>
 */
const path = require("node:path");
const ExcelJS = require("exceljs");
const prisma = require("../config/database");
const { parseBenchmarkWorkbook, saveBenchmarkSet } = require("../services/annualPlanBenchmarks.service");

async function main() {
  const workbookPath = process.argv[2];
  if (!workbookPath) {
    throw new Error("Usage: node scripts/importAnnualPlanBenchmarks.js <workbook.xlsx>");
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);
  const result = await saveBenchmarkSet(parseBenchmarkWorkbook(workbook), path.basename(workbookPath));
  console.log(
    `Imported ${result.activities} activities into benchmark set ${result.version}; ${result.matchedActivities} taxonomy codes matched.`,
  );
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
