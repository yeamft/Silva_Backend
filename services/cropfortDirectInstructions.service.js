const AppError = require("../utils/AppError");
const prisma = require("../config/database");
const { uuid } = require("../utils/ids");
const { permissionsFor, isSpxRole, isSilvaRole } = require("../utils/roles");
const { Prisma } = require("@prisma/client");

const DEFAULT_DI_VALUE_ETB = 50_000;

function requireProgramId(user) {
  if (!user.activeProgramId) {
    throw new AppError(400, "NO_ACTIVE_PROGRAM", "Select a workspace program first.");
  }
  return user.activeProgramId;
}

function hasCf(user) {
  const cf = user.cropfortRoles || [];
  return (
    cf.includes("spx_validator") ||
    cf.includes("spx_platform_admin") ||
    cf.includes("farm_owner") ||
    cf.includes("field_supervisor")
  );
}

function assertRead(user) {
  const perms = permissionsFor(user.role) || [];
  if (
    perms.includes("work_orders.read") ||
    hasCf(user) ||
    isSpxRole(user.role) ||
    isSilvaRole(user.role) ||
    ["system_admin", "spx_platform_admin", "spx_validator", "farm_owner", "field_supervisor", "vendor", "vendor_ops"].includes(
      user.role,
    )
  ) {
    return;
  }
  throw new AppError(403, "FORBIDDEN", "Insufficient permissions to view direct instructions");
}

function assertIssue(user) {
  if (
    isSpxRole(user.role) ||
    ["system_admin", "spx_platform_admin", "spx_validator"].includes(user.role)
  ) {
    return;
  }
  throw new AppError(403, "FORBIDDEN", "Only SPX can issue Direct Instructions");
}

function assertWrite(user) {
  if (
    isSpxRole(user.role) ||
    isSilvaRole(user.role) ||
    ["system_admin", "spx_platform_admin", "spx_validator", "farm_owner", "field_supervisor"].includes(
      user.role,
    )
  ) {
    return;
  }
  throw new AppError(403, "FORBIDDEN", "Insufficient permissions to update Direct Instructions");
}

function num(v) {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function serialize(row) {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description || "",
    monthlyWoId: row.monthlyWoId || null,
    monthlyWoCode: row.monthlyWoCode || null,
    weeklyPlanId: row.weeklyPlanId || null,
    weeklyPlanLineId: row.weeklyPlanLineId || null,
    workOrderId: row.workOrderId || null,
    blockId: row.blockId || "",
    blockCode: row.blockCode || "",
    amountEtb: num(row.amountEtb),
    overThreshold: Boolean(row.overThreshold),
    oralPendingConfirm: Boolean(row.oralPendingConfirm),
    status: row.status,
    issuedAt: row.issuedAt ? row.issuedAt.toISOString() : row.createdAt.toISOString(),
    confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
    rolledIntoWeeklyPlanId: row.rolledIntoWeeklyPlanId || null,
    note: row.note || "",
    createdByUserId: row.createdByUserId,
    createdByName: row.users?.name || null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const INCLUDE = {
  users: { select: { id: true, name: true } },
};

async function load(user, id) {
  const programId = requireProgramId(user);
  const row = await prisma.cropfort_direct_instructions.findFirst({
    where: { id, programId },
    include: INCLUDE,
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Direct Instruction not found");
  return row;
}

exports.listDirectInstructions = async (user, { status, monthlyWoId } = {}) => {
  assertRead(user);
  const programId = requireProgramId(user);
  const where = { programId };
  if (status) where.status = status;
  if (monthlyWoId) where.monthlyWoId = monthlyWoId;
  const rows = await prisma.cropfort_direct_instructions.findMany({
    where,
    include: INCLUDE,
    orderBy: { issuedAt: "desc" },
  });
  return rows.map(serialize);
};

exports.getDirectInstruction = async (user, id) => {
  assertRead(user);
  return serialize(await load(user, id));
};

exports.issueDirectInstruction = async (user, body) => {
  assertIssue(user);
  const programId = requireProgramId(user);
  const title = String(body.title || "").trim() || "Direct Instruction";
  const amount = Math.max(0, Math.round(num(body.amountEtb)));
  const threshold = DEFAULT_DI_VALUE_ETB;
  const over = amount > threshold;
  const oral = Boolean(body.oral);
  const now = new Date();

  const code =
    String(body.code || "").trim() ||
    `DI-${Date.now().toString(36).slice(-6).toUpperCase()}`;

  const existing = await prisma.cropfort_direct_instructions.findFirst({
    where: { programId, code },
  });
  if (existing) throw new AppError(409, "ALREADY_EXISTS", `Code ${code} already exists`);

  let status = "issued";
  let confirmedAt = null;
  let oralPendingConfirm = oral;
  let note = "";
  if (over) {
    status = "escalated";
    oralPendingConfirm = false;
    note = `Above DI value (${threshold.toLocaleString()} ETB) — route as Intervention / Approvals`;
  } else if (!oral) {
    status = "confirmed";
    confirmedAt = now;
  }

  const created = await prisma.cropfort_direct_instructions.create({
    data: {
      id: uuid("di"),
      programId,
      code,
      title,
      description: String(body.description || "").trim(),
      monthlyWoId: body.monthlyWoId || null,
      monthlyWoCode: body.monthlyWoCode || null,
      weeklyPlanId: body.weeklyPlanId || null,
      weeklyPlanLineId: body.weeklyPlanLineId || null,
      workOrderId: body.workOrderId || null,
      blockId: body.blockId || null,
      blockCode: String(body.blockCode || "").trim(),
      amountEtb: new Prisma.Decimal(amount.toFixed(2)),
      overThreshold: over,
      oralPendingConfirm,
      status,
      issuedAt: now,
      confirmedAt,
      rolledIntoWeeklyPlanId: null,
      note,
      createdByUserId: user.id,
      updatedAt: now,
    },
    include: INCLUDE,
  });
  return serialize(created);
};

exports.confirmDirectInstruction = async (user, id) => {
  assertWrite(user);
  const existing = await load(user, id);
  if (!existing.oralPendingConfirm && existing.status !== "issued") {
    throw new AppError(400, "INVALID_STATUS", "Direct Instruction is not pending written confirmation");
  }
  const now = new Date();
  const updated = await prisma.cropfort_direct_instructions.update({
    where: { id },
    data: {
      oralPendingConfirm: false,
      status: existing.status === "issued" ? "confirmed" : existing.status,
      confirmedAt: now,
      updatedAt: now,
    },
    include: INCLUDE,
  });
  return serialize(updated);
};

exports.rollDirectInstructionsIntoWeekly = async (user, ids, weeklyPlanId) => {
  assertWrite(user);
  const programId = requireProgramId(user);
  const list = Array.isArray(ids) ? ids.filter(Boolean) : [];
  if (!list.length || !weeklyPlanId) return [];
  const now = new Date();
  await prisma.cropfort_direct_instructions.updateMany({
    where: {
      programId,
      id: { in: list },
      overThreshold: false,
      status: { in: ["issued", "confirmed"] },
      rolledIntoWeeklyPlanId: null,
    },
    data: {
      status: "rolled_into_weekly",
      rolledIntoWeeklyPlanId: weeklyPlanId,
      weeklyPlanId,
      updatedAt: now,
    },
  });
  const rows = await prisma.cropfort_direct_instructions.findMany({
    where: { programId, id: { in: list } },
    include: INCLUDE,
  });
  return rows.map(serialize);
};

exports.pendingForMonthly = async (user, monthlyWoId) => {
  assertRead(user);
  const programId = requireProgramId(user);
  const rows = await prisma.cropfort_direct_instructions.findMany({
    where: {
      programId,
      monthlyWoId,
      overThreshold: false,
      status: { in: ["issued", "confirmed"] },
      rolledIntoWeeklyPlanId: null,
    },
    include: INCLUDE,
    orderBy: { issuedAt: "asc" },
  });
  return rows.map(serialize);
};
