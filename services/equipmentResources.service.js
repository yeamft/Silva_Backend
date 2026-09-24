const AppError = require("../utils/AppError");
const prisma = require("../config/database");
const { uuid } = require("../utils/ids");
const { assertEdit, requireProgramId } = require("../utils/modularRateAccess");

const ACTIVE_CARD_STATUSES = ["draft", "submitted", "approved", "rejected", "published"];

function serialize(row) {
  return {
    id: row.id,
    programId: row.programId,
    name: row.name,
    description: row.description || null,
    defaultUnit: row.defaultUnit,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function countActiveRefs(id) {
  return prisma.rate_card_line_items.count({
    where: {
      equipmentResourceId: id,
      rate_card: { status: { in: ACTIVE_CARD_STATUSES } },
    },
  });
}

exports.list = async (user, { includeInactive } = {}) => {
  assertEdit(user);
  const programId = requireProgramId(user);
  const rows = await prisma.equipment_resources.findMany({
    where: {
      programId,
      ...(includeInactive === "true" || includeInactive === true ? {} : { isActive: true }),
    },
    orderBy: { name: "asc" },
  });
  return rows.map(serialize);
};

exports.create = async (user, input) => {
  assertEdit(user);
  const programId = requireProgramId(user);
  const name = String(input.name || "").trim();
  const defaultUnit = String(input.defaultUnit || "").trim();
  if (!name) throw new AppError(400, "VALIDATION_ERROR", "Name is required");
  if (!defaultUnit) throw new AppError(400, "VALIDATION_ERROR", "Default unit is required");

  const created = await prisma.equipment_resources.create({
    data: {
      id: uuid("eqp"),
      programId,
      name,
      description: input.description?.trim() || null,
      defaultUnit,
      isActive: true,
    },
  });
  return serialize(created);
};

exports.update = async (user, id, input) => {
  assertEdit(user);
  const programId = requireProgramId(user);
  const existing = await prisma.equipment_resources.findFirst({ where: { id, programId } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Equipment resource not found");

  const updated = await prisma.equipment_resources.update({
    where: { id },
    data: {
      name: input.name != null ? String(input.name).trim() : undefined,
      description: input.description !== undefined ? (input.description?.trim() || null) : undefined,
      defaultUnit: input.defaultUnit != null ? String(input.defaultUnit).trim() : undefined,
      isActive: typeof input.isActive === "boolean" ? input.isActive : undefined,
    },
  });
  return serialize(updated);
};

exports.remove = async (user, id) => {
  assertEdit(user);
  const programId = requireProgramId(user);
  const existing = await prisma.equipment_resources.findFirst({ where: { id, programId } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Equipment resource not found");

  const refs = await countActiveRefs(id);
  if (refs > 0) {
    const updated = await prisma.equipment_resources.update({
      where: { id },
      data: { isActive: false },
    });
    return { ...serialize(updated), softDeleted: true };
  }

  await prisma.equipment_resources.delete({ where: { id } });
  return { id, deleted: true };
};
