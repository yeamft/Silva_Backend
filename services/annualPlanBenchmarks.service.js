const prisma = require("../config/database");

exports.getLatest = async (version) => {
  const set = version
    ? await prisma.cropfort_annual_benchmark_sets.findUnique({
        where: { version },
        include: { activities: { orderBy: { code: "asc" } } },
      })
    : await prisma.cropfort_annual_benchmark_sets.findFirst({
    orderBy: [{ importedAt: "desc" }, { version: "desc" }],
    include: { activities: { orderBy: { code: "asc" } } },
  });
  if (!set) return { version: null, sourceFile: null, importedAt: null, activities: [] };
  return {
    version: set.version,
    sourceFile: set.sourceFile,
    importedAt: set.importedAt.toISOString(),
    activities: set.activities.map((activity) => ({
      code: activity.code,
      category: activity.category,
      subgroup: activity.subgroup,
      activity: activity.activityName,
      unit: activity.unit,
      farms: activity.farms,
      dataNotes: activity.dataNotes,
      sourceRow: activity.sourceRow,
      taxonomyActivityId: activity.taxonomyActivityId,
    })),
  };
};
const crypto = require("node:crypto");
const path = require("node:path");
const ExcelJS = require("exceljs");
const AppError = require("../utils/AppError");
const { assertEdit, assertView, requireProgramId } = require("../utils/modularRateAccess");

/** Benchmark Data sheet layout: cost per unit, man-days per unit and frequency columns per farm. */
const FARM_COLUMNS = [
  ["Telli", 6, 12, 18],
  ["Gawi", 7, 13, 19],
  ["Chetu", 8, 14, 20],
  ["Ephrata", 9, 15, 21],
  ["Kamisse", 10, 16, 22],
  ["Shakisso", 11, 17, 23],
];
const FIRST_DATA_ROW = 7;
const EXPECTED_ACTIVITIES = 124;

function cellText(row, column) {
  const value = row.getCell(column).value;
  if (value == null) return "";
  if (typeof value === "object" && "text" in value) return String(value.text || "").trim();
  if (typeof value === "object" && "result" in value) return String(value.result ?? "").trim();
  return String(value).trim();
}

function cellNumber(row, column) {
  let value = row.getCell(column).value;
  if (value && typeof value === "object" && "result" in value) value = value.result;
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new AppError(400, "INVALID_WORKBOOK", `Invalid number in ${row.getCell(column).address} of Benchmark Data`);
  }
  if (parsed < 0) {
    throw new AppError(400, "INVALID_WORKBOOK", `Negative value in ${row.getCell(column).address} of Benchmark Data`);
  }
  return parsed;
}

/** Reads the annual-plan workbook's "Benchmark Data" sheet into benchmark activities. */
function parseBenchmarkWorkbook(workbook) {
  const sheet = workbook.getWorksheet("Benchmark Data");
  if (!sheet) throw new AppError(400, "INVALID_WORKBOOK", 'The workbook must contain a "Benchmark Data" sheet');

  const activities = [];
  for (let rowNumber = FIRST_DATA_ROW; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const code = cellText(row, 1);
    if (!code) continue;
    const farms = Object.fromEntries(
      FARM_COLUMNS.map(([name, costColumn, daysColumn, frequencyColumn]) => [
        name,
        {
          costPerUnit: cellNumber(row, costColumn),
          manDaysPerUnit: cellNumber(row, daysColumn),
          frequency: cellNumber(row, frequencyColumn),
        },
      ]),
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

  if (activities.length !== EXPECTED_ACTIVITIES) {
    throw new AppError(
      400,
      "INVALID_WORKBOOK",
      `Expected ${EXPECTED_ACTIVITIES} benchmark activities in Benchmark Data; found ${activities.length}`,
    );
  }
  if (new Set(activities.map((a) => a.code)).size !== activities.length) {
    throw new AppError(400, "INVALID_WORKBOOK", "Benchmark activity codes must be unique");
  }
  return activities;
}

/** Saves a parsed benchmark set; importing the same file name again replaces that version. */
async function saveBenchmarkSet(activities, sourceFile) {
  const version = path.basename(sourceFile, path.extname(sourceFile));
  const set = await prisma.cropfort_annual_benchmark_sets.upsert({
    where: { version },
    create: { id: `abset_${crypto.randomUUID()}`, version, sourceFile },
    update: { sourceFile, importedAt: new Date() },
  });
  const matched = await prisma.activities.findMany({
    where: { code: { in: activities.map((a) => a.code) } },
    select: { id: true, code: true },
  });
  const activityIdByCode = new Map(matched.map((a) => [a.code, a.id]));
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
  return { version, sourceFile, activities: records.length, matchedActivities: matched.length };
}

exports.parseBenchmarkWorkbook = parseBenchmarkWorkbook;
exports.saveBenchmarkSet = saveBenchmarkSet;

/** Upload of the annual-plan workbook from the app (SPX). */
exports.importWorkbook = async (user, file) => {
  assertEdit(user);
  if (!file?.buffer) throw new AppError(400, "VALIDATION_ERROR", "Choose the annual-plan workbook (.xlsx) to import");
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(file.buffer);
  } catch {
    throw new AppError(400, "INVALID_WORKBOOK", "The file couldn't be read as an Excel workbook (.xlsx)");
  }
  return saveBenchmarkSet(parseBenchmarkWorkbook(workbook), file.originalname || "benchmark-import.xlsx");
};

/** Band 1 / Band 2 above the industry average, shared by rate cards and the Annual Budget plan. */
exports.getScenarioSettings = async (user) => {
  assertView(user);
  const program = await prisma.programs.findUnique({
    where: { id: requireProgramId(user) },
    select: { cropfortScenarioBand1Pct: true, cropfortScenarioBand2Pct: true },
  });
  return {
    band1Pct: Number(program?.cropfortScenarioBand1Pct ?? 25),
    band2Pct: Number(program?.cropfortScenarioBand2Pct ?? 50),
  };
};

exports.updateScenarioSettings = async (user, body = {}) => {
  assertEdit(user);
  const programId = requireProgramId(user);
  const data = {};
  for (const [key, column] of [
    ["band1Pct", "cropfortScenarioBand1Pct"],
    ["band2Pct", "cropfortScenarioBand2Pct"],
  ]) {
    if (body[key] === undefined) continue;
    const value = Number(body[key]);
    if (!Number.isFinite(value) || value < 0 || value > 500) {
      throw new AppError(400, "VALIDATION_ERROR", `${key} must be a percentage between 0 and 500`);
    }
    data[column] = value;
  }
  await prisma.programs.update({ where: { id: programId }, data });
  require("./rateCardProposal.service").clearBandCache(programId);
  return exports.getScenarioSettings(user);
};
