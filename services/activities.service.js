const { randomUUID } = require("crypto");
const AppError = require("../utils/AppError");
const prisma = require("../config/database");
const ExcelJS = require("exceljs");

const ACTIVITY_CATEGORIES = new Set([
  "Nursery",
  "Young Coffee",
  "Matured Coffee",
  "Infilling",
  "Harvesting & Related",
]);

// Workbook import also accepts the legacy ampersand variant
const IMPORT_CATEGORY_ALIASES = new Map([
  ["harvesting & related", "Harvesting & Related"],
  ["picking & related", "Harvesting & Related"],
]);

function workbookCellText(row, column) {
  const value = row.getCell(column).value;
  if (value == null) return "";
  if (typeof value === "object" && "text" in value) return String(value.text || "").trim();
  return String(value).trim();
}

function normalizeCatalogValue(value) {
  return String(value || "").trim().toLocaleLowerCase();
}

function sameActivity(existing, incoming) {
  return ["name", "nameAm", "category", "subgroup", "unitOfMeasure"].every(
    (field) => normalizeCatalogValue(existing[field]) === normalizeCatalogValue(incoming[field]),
  );
}

exports.previewWorkbookImport = async (buffer) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const benchmarkSheet = workbook.getWorksheet("Benchmark Data");
  if (!benchmarkSheet) {
    throw new AppError(400, "INVALID_FILE", 'Workbook must contain a "Benchmark Data" sheet');
  }

  const amharicNames = new Map();
  for (const [sheetName, codeColumn, amharicColumn, scenarioColumn] of [
    ["Nursery", 2, 4, 7],
    ["Young Coffee", 1, 3, 6],
    ["Matured Coffee", 1, 3, 6],
    ["Infilling", 1, 3, 6],
    ["Harvesting", 1, 3, 6],
  ]) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) continue;
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const code = workbookCellText(row, codeColumn);
      const scenario = workbookCellText(row, scenarioColumn);
      const amharic = workbookCellText(row, amharicColumn);
      if (code && scenario === "Industry average" && amharic) amharicNames.set(code, amharic);
    });
  }

  const candidates = [];
  const seenCodes = new Set();
  const invalid = [];
  const aggregates = [];
  for (let rowNumber = 7; rowNumber <= benchmarkSheet.rowCount; rowNumber += 1) {
    const row = benchmarkSheet.getRow(rowNumber);
    const code = workbookCellText(row, 1);
    if (!code) continue;
    const incoming = {
      code,
      name: workbookCellText(row, 4),
      nameAm: amharicNames.get(code) || "",
      category: workbookCellText(row, 2),
      subgroup: workbookCellText(row, 3),
      unitOfMeasure: workbookCellText(row, 5),
      sourceRow: rowNumber,
      tier: null,
    };
    if (seenCodes.has(code)) {
      invalid.push({ ...incoming, reason: "Activity code appears more than once in the workbook" });
      continue;
    }
    seenCodes.add(code);
    if (incoming.category === "Total - All Field Work" || incoming.category === "Total – All Field Work") {
      aggregates.push(incoming);
      continue;
    }
    // Normalise legacy category aliases from older workbook sheets
    const aliased = IMPORT_CATEGORY_ALIASES.get(incoming.category.toLowerCase());
    if (aliased) incoming.category = aliased;
    const reasons = [];
    if (!ACTIVITY_CATEGORIES.has(incoming.category)) reasons.push("Unknown operational category");
    if (!incoming.name) reasons.push("Missing English activity name");
    if (!incoming.subgroup) reasons.push("Missing sub-group");
    if (!incoming.unitOfMeasure || incoming.unitOfMeasure.length > 32 || !/^[\p{L}\p{N}][\p{L}\p{N}\s./_-]*$/u.test(incoming.unitOfMeasure)) {
      reasons.push("Missing or invalid unit");
    }
    if (reasons.length) invalid.push({ ...incoming, reason: reasons.join("; ") });
    else candidates.push(incoming);
  }

  const existingRows = await prisma.activities.findMany({
    where: { code: { in: candidates.map((activity) => activity.code) } },
  });
  const existingByCode = new Map(existingRows.map((activity) => [activity.code, activity]));
  const newActivities = [];
  const matches = [];
  const conflicts = [];
  for (const incoming of candidates) {
    const existing = existingByCode.get(incoming.code);
    if (!existing) {
      newActivities.push(incoming);
    } else if (sameActivity(existing, incoming)) {
      matches.push({ ...incoming, existingId: existing.id, existingActive: existing.active });
    } else {
      conflicts.push({
        ...incoming,
        existingId: existing.id,
        existing: {
          name: existing.name,
          nameAm: existing.nameAm,
          category: existing.category,
          subgroup: existing.subgroup,
          unitOfMeasure: existing.unitOfMeasure,
          active: existing.active,
        },
      });
    }
  }
  return { newActivities, matches, conflicts, invalid, aggregates };
};

exports.commitWorkbookImport = async (rows) => {
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 500) {
    throw new AppError(400, "VALIDATION_ERROR", "Select between 1 and 500 new activities to import");
  }
  const codes = rows.map((row) => String(row.code || "").trim());
  if (codes.some((code) => !code) || new Set(codes).size !== codes.length) {
    throw new AppError(400, "VALIDATION_ERROR", "Activity codes must be present and unique");
  }
  const existingCount = await prisma.activities.count({ where: { code: { in: codes } } });
  if (existingCount) {
    throw new AppError(409, "CONFLICT", "Some activity codes were added after preview. Preview the workbook again.");
  }

  const data = rows.map((row) => {
    const tier = Number(row.tier);
    const code = String(row.code).trim();
    const name = String(row.name || "").trim();
    const rawCategory = String(row.category || "").trim();
    const category = IMPORT_CATEGORY_ALIASES.get(rawCategory.toLowerCase()) || rawCategory;
    const subgroup = String(row.subgroup || "").trim();
    const unitOfMeasure = String(row.unitOfMeasure || "").trim();
    if (![1, 2, 3].includes(tier)) {
      throw new AppError(400, "VALIDATION_ERROR", `${code}: choose Labor, Materials, or Services`);
    }
    if (!ACTIVITY_CATEGORIES.has(category) || !name || !subgroup || !unitOfMeasure || unitOfMeasure.length > 32 || !/^[\p{L}\p{N}][\p{L}\p{N}\s./_-]*$/u.test(unitOfMeasure)) {
      throw new AppError(400, "VALIDATION_ERROR", `${code}: invalid activity classification or unit`);
    }
    return {
      id: randomUUID(),
      code,
      name,
      nameAm: String(row.nameAm || "").trim() || null,
      category,
      subgroup,
      tier,
      unitOfMeasure,
      active: true,
      sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : 0,
      description: null,
    };
  });
  await prisma.activities.createMany({ data });
  return { importedCount: data.length };
};

function serialize(row) {
  return {
    id: row.id,
    tier: row.tier,
    category: row.category,
    subgroup: row.subgroup,
    code: row.code,
    name: row.name,
    nameAm: row.nameAm ?? "",
    unitOfMeasure: row.unitOfMeasure,
    description: row.description ?? "",
    defaultAnnualFrequency: row.defaultAnnualFrequency == null ? null : Number(row.defaultAnnualFrequency),
    planningCategory: row.planningCategory || null,
    planningNotes: row.planningNotes || "",
    active: row.active,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * @param {{ tier?: string|number, category?: string, q?: string }} query
 */
exports.list = async (query = {}) => {
  const where = {};
  if (query.includeInactive !== "1" && query.includeInactive !== "true" && query.includeInactive !== true) {
    where.active = true;
  }
  if (query.tier != null && query.tier !== "") {
    const tier = Number(query.tier);
    if (![1, 2, 3].includes(tier)) {
      throw new AppError(400, "VALIDATION_ERROR", "tier must be 1, 2, or 3");
    }
    where.tier = tier;
  }
  if (query.category) {
    where.category = String(query.category).trim();
  }
  if (query.q) {
    const q = String(query.q).trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { id: { contains: q, mode: "insensitive" } },
      { category: { contains: q, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.activities.findMany({
    where,
    orderBy: [{ tier: "asc" }, { category: "asc" }, { id: "asc" }],
  });
  return rows.map(serialize);
};

exports.create = async (body = {}) => {
  const code = String(body.code ?? "").trim();
  const name = String(body.name ?? "").trim();
  const nameAm = body.nameAm == null ? null : String(body.nameAm).trim() || null;
  const category = String(body.category ?? "").trim();
  const subgroup = String(body.subgroup ?? "").trim();
  const unitOfMeasure = String(body.unitOfMeasure ?? "").trim();
  const description = body.description == null ? null : String(body.description).trim();
  const defaultAnnualFrequency = body.defaultAnnualFrequency == null || body.defaultAnnualFrequency === ""
    ? null
    : Number(body.defaultAnnualFrequency);
  const planningCategory = body.planningCategory == null ? null : String(body.planningCategory).trim() || null;
  const planningNotes = body.planningNotes == null ? null : String(body.planningNotes).trim() || null;
  const tier = Number(body.tier);
  const active = body.active !== false;
  const sortOrder = Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0;

  if (![1, 2, 3].includes(tier)) {
    throw new AppError(400, "VALIDATION_ERROR", "tier must be 1, 2, or 3");
  }
  if (defaultAnnualFrequency != null && (!Number.isFinite(defaultAnnualFrequency) || defaultAnnualFrequency < 0)) {
    throw new AppError(400, "VALIDATION_ERROR", "defaultAnnualFrequency must be a non-negative number");
  }
  if (!code || !name || !category || !unitOfMeasure) {
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "code, name, category, and unitOfMeasure are required",
    );
  }

  const existing = await prisma.activities.findUnique({ where: { code } });
  if (existing) {
    throw new AppError(409, "CONFLICT", `Activity code "${code}" already exists`);
  }

  const row = await prisma.activities.create({
    data: {
      id: randomUUID(),
      code,
      tier,
      category,
      subgroup,
      name,
      nameAm,
      description,
      defaultAnnualFrequency,
      planningCategory,
      planningNotes,
      unitOfMeasure,
      active,
      sortOrder,
    },
  });

  return serialize(row);
};

function activityUpdateData(body = {}, { bulk = false } = {}) {
  const data = {};
  const fields = bulk
    ? ["tier", "category", "subgroup", "unitOfMeasure"]
    : ["code", "name", "tier", "category", "subgroup", "unitOfMeasure", "description", "planningCategory", "planningNotes"];
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
    if (field === "tier") {
      const tier = Number(body.tier);
      if (![1, 2, 3].includes(tier)) {
        throw new AppError(400, "VALIDATION_ERROR", "tier must be 1, 2, or 3");
      }
      data.tier = tier;
      continue;
    }
    data[field] = String(body[field] ?? "").trim();
  }
  if (!bulk && Object.prototype.hasOwnProperty.call(body, "defaultAnnualFrequency")) {
    if (body.defaultAnnualFrequency == null || body.defaultAnnualFrequency === "") {
      data.defaultAnnualFrequency = null;
    } else {
      const frequency = Number(body.defaultAnnualFrequency);
      if (!Number.isFinite(frequency) || frequency < 0) {
        throw new AppError(400, "VALIDATION_ERROR", "defaultAnnualFrequency must be a non-negative number");
      }
      data.defaultAnnualFrequency = frequency;
    }
  }
  if (!bulk) {
    if (Object.prototype.hasOwnProperty.call(data, "code") && !data.code) {
      throw new AppError(400, "VALIDATION_ERROR", "code is required");
    }
    for (const field of ["name", "category", "unitOfMeasure"]) {
      if (Object.prototype.hasOwnProperty.call(data, field) && !data[field]) {
        throw new AppError(400, "VALIDATION_ERROR", `${field} is required`);
      }
    }
  }
  if (Object.keys(data).length === 0) {
    throw new AppError(400, "VALIDATION_ERROR", "Provide at least one field to update");
  }
  return data;
}

exports.update = async (id, body = {}) => {
  const data = activityUpdateData(body);
  if (data.code) {
    const existing = await prisma.activities.findUnique({ where: { code: data.code } });
    if (existing && existing.id !== String(id)) {
      throw new AppError(409, "CONFLICT", `Activity code "${data.code}" already exists`);
    }
  }
  try {
    const row = await prisma.activities.update({
      where: { id: String(id) },
      data,
    });
    return serialize(row);
  } catch (err) {
    if (err?.code === "P2025") throw new AppError(404, "NOT_FOUND", "Activity not found");
    throw err;
  }
};

exports.bulkUpdate = async (ids, body = {}) => {
  if (!Array.isArray(ids) || ids.length < 2 || ids.length > 200 || ids.some((id) => typeof id !== "string" || !id.trim())) {
    throw new AppError(400, "VALIDATION_ERROR", "Select between 2 and 200 activities");
  }
  const data = activityUpdateData(body, { bulk: true });
  const uniqueIds = [...new Set(ids.map((id) => id.trim()))];
  if (uniqueIds.length !== ids.length) {
    throw new AppError(400, "VALIDATION_ERROR", "Activity IDs must be unique");
  }
  const existing = await prisma.activities.count({ where: { id: { in: uniqueIds }, active: true } });
  if (existing !== uniqueIds.length) {
    throw new AppError(404, "NOT_FOUND", "One or more active activities could not be found");
  }
  await prisma.activities.updateMany({ where: { id: { in: uniqueIds }, active: true }, data });
  const rows = await prisma.activities.findMany({
    where: { id: { in: uniqueIds } },
    orderBy: [{ tier: "asc" }, { category: "asc" }, { id: "asc" }],
  });
  return rows.map(serialize);
};

exports.deactivateMany = async (ids) => {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200 || ids.some((id) => typeof id !== "string" || !id.trim())) {
    throw new AppError(400, "VALIDATION_ERROR", "Select between 1 and 200 activities");
  }
  const uniqueIds = [...new Set(ids.map((id) => id.trim()))];
  if (uniqueIds.length !== ids.length) {
    throw new AppError(400, "VALIDATION_ERROR", "Activity IDs must be unique");
  }
  const existing = await prisma.activities.count({ where: { id: { in: uniqueIds }, active: true } });
  if (existing !== uniqueIds.length) {
    throw new AppError(404, "NOT_FOUND", "One or more active activities could not be found");
  }
  const result = await prisma.activities.updateMany({
    where: { id: { in: uniqueIds }, active: true },
    data: { active: false },
  });
  return { deactivatedCount: result.count };
};

exports.get = async (id) => {
  const row = await prisma.activities.findUnique({ where: { id: String(id) } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Activity not found");
  return serialize(row);
};
