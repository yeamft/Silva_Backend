const AppError = require("../utils/AppError");
const prisma = require("../config/database");
const { uuid } = require("../utils/ids");
const { permissionsFor, isSpxRole, isAssetOwnerApprover } = require("../utils/roles");
const { Prisma } = require("@prisma/client");

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
  throw new AppError(403, "FORBIDDEN", "Insufficient permissions to view monthly work orders");
}

function assertWrite(user) {
  const perms = permissionsFor(user.role) || [];
  if (
    perms.includes("work_orders.write") ||
    hasCf(user) ||
    isSpxRole(user.role) ||
    ["system_admin", "spx_platform_admin", "spx_validator", "field_supervisor"].includes(user.role)
  ) {
    return;
  }
  throw new AppError(403, "FORBIDDEN", "Insufficient permissions to mutate monthly work orders");
}

function assertDecide(user) {
  if (isAssetOwnerApprover(user)) return;
  throw new AppError(403, "FORBIDDEN", "Only Silva / asset owners can decide monthly work orders");
}

function num(v) {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function serializeLine(row) {
  return {
    id: row.id,
    activityId: row.activityId || "",
    activityCode: row.activityCode || "",
    activityName: row.activityName,
    blockId: row.blockId || "",
    blockCode: row.blockCode || "",
    plannedQty: num(row.plannedQty),
    unit: row.unit || "",
    etb: num(row.etb),
    manualsRef: row.manualsRef || "",
    inPlan: Boolean(row.inPlan),
  };
}

function serialize(row) {
  const lines = (row.lines || []).map(serializeLine);
  return {
    id: row.id,
    code: row.code,
    farmId: row.farmId || "",
    farmName: row.farmName || "",
    programId: row.programId,
    ethiopianMonth: row.ethiopianMonth,
    yearGc: row.yearGc,
    status: row.status,
    lines,
    sourcePlanId: row.sourcePlanId,
    outOfPlanReason: row.outOfPlanReason || "",
    loop: row.loop || "none",
    totalEtb: num(row.totalEtb) || lines.reduce((s, l) => s + l.etb, 0),
    lastMonthInsights: row.lastMonthInsights || "",
    structuredInsights: row.structuredInsightsJson || null,
    recommendedAdjustments: Array.isArray(row.recommendedAdjustmentsJson)
      ? row.recommendedAdjustmentsJson
      : [],
    note: row.note || "",
    returnedComment: row.returnedComment || null,
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    activatedAt: row.activatedAt ? row.activatedAt.toISOString() : null,
    createdByUserId: row.createdByUserId,
    createdByName: row.users?.name || null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const INCLUDE = {
  lines: { orderBy: { sortOrder: "asc" } },
  users: { select: { id: true, name: true } },
};

async function load(user, id) {
  const programId = requireProgramId(user);
  const row = await prisma.cropfort_monthly_work_orders.findFirst({
    where: { id, programId },
    include: INCLUDE,
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Monthly work order not found");
  return row;
}

function normalizeLines(lines) {
  if (!Array.isArray(lines) || !lines.length) {
    throw new AppError(400, "VALIDATION_ERROR", "At least one line is required");
  }
  return lines.map((l, i) => {
    const activityName = String(l.activityName || "").trim();
    if (!activityName) {
      throw new AppError(400, "VALIDATION_ERROR", `Line ${i + 1}: activityName is required`);
    }
    return {
      id: uuid("ml"),
      activityId: l.activityId || null,
      activityCode: String(l.activityCode || "").trim(),
      activityName,
      blockId: l.blockId || null,
      blockCode: String(l.blockCode || "").trim(),
      plannedQty: new Prisma.Decimal(num(l.plannedQty).toFixed(2)),
      unit: String(l.unit || "").trim(),
      etb: new Prisma.Decimal(num(l.etb).toFixed(2)),
      manualsRef: String(l.manualsRef || "").trim(),
      inPlan: l.inPlan !== false,
      sortOrder: i,
      updatedAt: new Date(),
    };
  });
}

exports.listMonthlyWorkOrders = async (user, { status } = {}) => {
  assertRead(user);
  const programId = requireProgramId(user);
  const where = { programId };
  if (status) where.status = status;
  const rows = await prisma.cropfort_monthly_work_orders.findMany({
    where,
    include: INCLUDE,
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(serialize);
};

exports.getMonthlyWorkOrder = async (user, id) => {
  assertRead(user);
  return serialize(await load(user, id));
};

exports.createMonthlyWorkOrder = async (user, body) => {
  assertWrite(user);
  const programId = requireProgramId(user);
  const ethiopianMonth = String(body.ethiopianMonth || "").trim();
  const yearGc = Number(body.yearGc);
  if (!ethiopianMonth) throw new AppError(400, "VALIDATION_ERROR", "ethiopianMonth is required");
  if (!Number.isInteger(yearGc) || yearGc < 2000) {
    throw new AppError(400, "VALIDATION_ERROR", "yearGc must be a valid year");
  }

  const lineData = normalizeLines(body.lines || []);
  const totalEtb = lineData.reduce((s, l) => s + num(l.etb), 0);
  const code =
    String(body.code || "").trim() ||
    `MWO-${String(yearGc).slice(2)}${ethiopianMonth.slice(0, 3).toUpperCase()}-${Date.now().toString(36).slice(-4).toUpperCase()}`;

  const existing = await prisma.cropfort_monthly_work_orders.findFirst({
    where: { programId, code },
  });
  if (existing) throw new AppError(409, "ALREADY_EXISTS", `Code ${code} already exists`);

  const now = new Date();
  const created = await prisma.cropfort_monthly_work_orders.create({
    data: {
      id: uuid("mwo"),
      programId,
      code,
      farmId: body.farmId || null,
      farmName: String(body.farmName || "").trim(),
      ethiopianMonth,
      yearGc,
      status: "draft",
      sourcePlanId: body.sourcePlanId || null,
      outOfPlanReason: String(body.outOfPlanReason || "").trim(),
      loop: body.loop || "none",
      totalEtb: new Prisma.Decimal(totalEtb.toFixed(2)),
      lastMonthInsights: String(body.lastMonthInsights || "").trim(),
      structuredInsightsJson: body.structuredInsights || null,
      recommendedAdjustmentsJson: body.recommendedAdjustments || [],
      note: String(body.note || "").trim(),
      createdByUserId: user.id,
      updatedAt: now,
      lines: { create: lineData },
    },
    include: INCLUDE,
  });
  return serialize(created);
};

exports.submitMonthlyWorkOrder = async (user, id) => {
  assertWrite(user);
  const existing = await load(user, id);
  if (existing.status !== "draft" && existing.status !== "returned") {
    throw new AppError(400, "INVALID_STATUS", "Only draft or returned monthly WOs can be submitted");
  }
  const now = new Date();
  const updated = await prisma.cropfort_monthly_work_orders.update({
    where: { id },
    data: {
      status: "submitted",
      submittedAt: now,
      returnedComment: null,
      updatedAt: now,
    },
    include: INCLUDE,
  });
  return serialize(updated);
};

exports.decideMonthlyWorkOrder = async (user, id, body) => {
  assertDecide(user);
  const existing = await load(user, id);
  if (existing.status !== "submitted") {
    throw new AppError(400, "INVALID_STATUS", "Only submitted monthly WOs can be decided");
  }
  const decision = body.decision;
  if (decision !== "approve" && decision !== "return") {
    throw new AppError(400, "VALIDATION_ERROR", "decision must be approve or return");
  }
  if (decision === "return" && !String(body.comment || "").trim()) {
    throw new AppError(400, "VALIDATION_ERROR", "comment is required when returning");
  }
  const now = new Date();
  const updated = await prisma.cropfort_monthly_work_orders.update({
    where: { id },
    data:
      decision === "approve"
        ? {
            status: "approved",
            approvedAt: now,
            returnedComment: null,
            note: body.comment ? String(body.comment).trim() : existing.note,
            updatedAt: now,
          }
        : {
            status: "returned",
            returnedComment: String(body.comment).trim(),
            note: String(body.comment).trim(),
            updatedAt: now,
          },
    include: INCLUDE,
  });
  return serialize(updated);
};

exports.activateMonthlyWorkOrder = async (user, id) => {
  assertWrite(user);
  const existing = await load(user, id);
  if (existing.status !== "approved" && existing.status !== "submitted") {
    throw new AppError(400, "INVALID_STATUS", "Approve the monthly WO before activating");
  }
  const now = new Date();
  const updated = await prisma.cropfort_monthly_work_orders.update({
    where: { id },
    data: { status: "active", activatedAt: now, updatedAt: now },
    include: INCLUDE,
  });
  return serialize(updated);
};

exports.setMonthlyWorkOrderLoop = async (user, id, loop) => {
  assertWrite(user);
  await load(user, id);
  const updated = await prisma.cropfort_monthly_work_orders.update({
    where: { id },
    data: { loop: String(loop || "none"), updatedAt: new Date() },
    include: INCLUDE,
  });
  return serialize(updated);
};

exports.addOutOfPlanLine = async (user, id, body) => {
  assertWrite(user);
  const existing = await load(user, id);
  if (existing.status !== "draft" && existing.status !== "returned") {
    throw new AppError(400, "INVALID_STATUS", "Out-of-plan lines can only be added in draft or returned");
  }
  const activityName = String(body.activityName || "").trim();
  if (!activityName) {
    throw new AppError(400, "VALIDATION_ERROR", "activityName is required");
  }
  const reason = String(body.reason || "").trim();
  if (!reason) {
    throw new AppError(400, "VALIDATION_ERROR", "reason is required for out-of-plan lines");
  }

  const sortOrder = (existing.lines || []).length;
  const etb = num(body.etb);
  const now = new Date();
  const reasonNote = existing.outOfPlanReason
    ? `${existing.outOfPlanReason}\n• ${activityName}: ${reason}`
    : `• ${activityName}: ${reason}`;

  await prisma.cropfort_monthly_wo_lines.create({
    data: {
      id: uuid("ml"),
      monthlyWoId: id,
      activityId: body.activityId || null,
      activityCode: String(body.activityCode || "").trim(),
      activityName,
      blockId: body.blockId || null,
      blockCode: String(body.blockCode || "").trim(),
      plannedQty: new Prisma.Decimal(num(body.plannedQty).toFixed(2)),
      unit: String(body.unit || "").trim(),
      etb: new Prisma.Decimal(etb.toFixed(2)),
      manualsRef: String(body.manualsRef || "").trim(),
      inPlan: false,
      sortOrder,
      updatedAt: now,
    },
  });

  const updated = await prisma.cropfort_monthly_work_orders.update({
    where: { id },
    data: {
      outOfPlanReason: reasonNote,
      totalEtb: new Prisma.Decimal((num(existing.totalEtb) + etb).toFixed(2)),
      updatedAt: now,
    },
    include: INCLUDE,
  });
  return serialize(updated);
};
