const AppError = require("../utils/AppError");
const prisma = require("../config/database");
const { uuid } = require("../utils/ids");
const { permissionsFor, isSpxRole } = require("../utils/roles");
const { Prisma } = require("@prisma/client");

function requireProgramId(user) {
  if (!user.activeProgramId) {
    throw new AppError(400, "NO_ACTIVE_PROGRAM", "Select a workspace program first.");
  }
  return user.activeProgramId;
}

function assertRead(user) {
  const perms = permissionsFor(user.role) || [];
  if (
    perms.includes("work_orders.read") ||
    isSpxRole(user.role) ||
    ["system_admin", "spx_platform_admin", "spx_validator", "farm_owner", "field_supervisor", "vendor", "vendor_ops"].includes(
      user.role,
    )
  ) {
    return;
  }
  throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
}

function assertWrite(user) {
  const perms = permissionsFor(user.role) || [];
  if (
    perms.includes("work_orders.write") ||
    isSpxRole(user.role) ||
    ["system_admin", "spx_platform_admin", "spx_validator", "field_supervisor"].includes(user.role)
  ) {
    return;
  }
  throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
}

function serialize(row) {
  return {
    id: row.id,
    name: row.name,
    note: row.note || "",
    savedAt: row.updatedAt.toISOString(),
    snapshot: row.snapshotJson,
    includedCount: row.includedCount || 0,
    budgetEtb: Number(row.budgetEtb) || 0,
    scheduledCount: row.scheduledCount || 0,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

exports.listScenarios = async (user) => {
  assertRead(user);
  const programId = requireProgramId(user);
  const rows = await prisma.cropfort_plan_scenarios.findMany({
    where: { programId },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(serialize);
};

exports.createScenario = async (user, body) => {
  assertWrite(user);
  const programId = requireProgramId(user);
  const name = String(body.name || "").trim() || "Scenario";
  const note = String(body.note || "").trim();
  const snapshot = body.snapshot;
  if (!snapshot || typeof snapshot !== "object") {
    throw new AppError(400, "VALIDATION_ERROR", "snapshot is required");
  }
  const now = new Date();
  const row = await prisma.cropfort_plan_scenarios.create({
    data: {
      id: uuid("scn"),
      programId,
      name,
      note,
      snapshotJson: snapshot,
      includedCount: Number(body.includedCount) || 0,
      budgetEtb: new Prisma.Decimal(Number(body.budgetEtb || 0).toFixed(2)),
      scheduledCount: Number(body.scheduledCount) || 0,
      createdByUserId: user.id,
      updatedAt: now,
    },
  });
  return serialize(row);
};

exports.renameScenario = async (user, id, name) => {
  assertWrite(user);
  const programId = requireProgramId(user);
  const existing = await prisma.cropfort_plan_scenarios.findFirst({ where: { id, programId } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Scenario not found");
  const updated = await prisma.cropfort_plan_scenarios.update({
    where: { id },
    data: { name: String(name || "").trim() || existing.name, updatedAt: new Date() },
  });
  return serialize(updated);
};

exports.deleteScenario = async (user, id) => {
  assertWrite(user);
  const programId = requireProgramId(user);
  const existing = await prisma.cropfort_plan_scenarios.findFirst({ where: { id, programId } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Scenario not found");
  await prisma.cropfort_plan_scenarios.delete({ where: { id } });
  return { ok: true };
};
