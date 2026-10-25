const { randomUUID } = require("crypto");
const AppError = require("../utils/AppError");
const prisma = require("../config/database");

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
  const where = { active: true };
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
  const tier = Number(body.tier);
  const active = body.active !== false;
  const sortOrder = Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0;

  if (![1, 2, 3].includes(tier)) {
    throw new AppError(400, "VALIDATION_ERROR", "tier must be 1, 2, or 3");
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
    : ["code", "name", "tier", "category", "subgroup", "unitOfMeasure", "description"];
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
