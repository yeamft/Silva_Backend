const AppError = require("../utils/AppError");
const prisma = require("../config/database");
const { uuid } = require("../utils/ids");
const { permissionsFor, isSpxRole, isSilvaRole, isVendorRole, isAssetOwnerApprover } = require("../utils/roles");
const { Prisma } = require("@prisma/client");
const workOrders = require("./workOrders.service");

function requireProgramId(user) {
  if (!user.activeProgramId) {
    throw new AppError(400, "NO_ACTIVE_PROGRAM", "Select a workspace program first.");
  }
  return user.activeProgramId;
}

function hasPerm(user, key) {
  const perms = permissionsFor(user.role) || [];
  if (perms.includes(key)) return true;
  const cf = user.cropfortRoles || [];
  if (
    cf.includes("spx_validator") ||
    cf.includes("spx_platform_admin") ||
    cf.includes("farm_owner") ||
    cf.includes("field_supervisor") ||
    cf.includes("bagro_office")
  ) {
    return true;
  }
  return false;
}

function assertRead(user) {
  if (
    hasPerm(user, "work_orders.read") ||
    isSpxRole(user.role) ||
    isSilvaRole(user.role) ||
    isVendorRole(user.role) ||
    user.role === "system_admin" ||
    user.role === "spx_platform_admin" ||
    user.role === "spx_validator" ||
    user.role === "farm_owner" ||
    user.role === "field_supervisor" ||
    user.role === "vendor" ||
    user.role === "vendor_ops"
  ) {
    return;
  }
  throw new AppError(403, "FORBIDDEN", "Insufficient permissions to view weekly plans");
}

function assertWrite(user) {
  if (
    hasPerm(user, "work_orders.write") ||
    isSpxRole(user.role) ||
    user.role === "system_admin" ||
    user.role === "spx_platform_admin" ||
    user.role === "spx_validator" ||
    user.role === "field_supervisor"
  ) {
    return;
  }
  throw new AppError(403, "FORBIDDEN", "Insufficient permissions to mutate weekly plans");
}

function assertDecide(user) {
  if (isAssetOwnerApprover(user)) return;
  throw new AppError(403, "FORBIDDEN", "Only Silva / asset owners can decide weekly plans");
}

function num(v) {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function asStringArray(v) {
  if (Array.isArray(v)) return v.map(String);
  return [];
}

function serializeLine(row) {
  return {
    id: row.id,
    monthlyLineId: row.monthlyLineId || "",
    activityId: row.activityId || "",
    activityCode: row.activityCode || "",
    activityName: row.activityName,
    blockId: row.blockId || "",
    blockCode: row.blockCode || "",
    qty: num(row.qty),
    unit: row.unit || "",
    crew: row.crew || "",
    materials: row.materials || "",
    manualsRef: row.manualsRef || "",
    etb: num(row.etb),
  };
}

function serialize(row) {
  return {
    id: row.id,
    code: row.code,
    programId: row.programId,
    monthlyWoId: row.monthlyWoId || "",
    monthlyWoCode: row.monthlyWoCode || "",
    weekLabel: row.weekLabel,
    status: row.status,
    lines: (row.lines || []).map(serializeLine),
    bridgedWorkOrderIds: asStringArray(row.bridgedWorkOrderIds),
    directInstructionIds: asStringArray(row.directInstructionIds),
    loop: row.loop || "none",
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

async function loadPlan(user, id) {
  const programId = requireProgramId(user);
  const row = await prisma.cropfort_weekly_plans.findFirst({
    where: { id, programId },
    include: INCLUDE,
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Weekly plan not found");
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
      id: uuid("wpl"),
      monthlyLineId: l.monthlyLineId || null,
      activityId: l.activityId || null,
      activityCode: String(l.activityCode || "").trim(),
      activityName,
      blockId: l.blockId || null,
      blockCode: String(l.blockCode || "").trim(),
      qty: new Prisma.Decimal(num(l.qty).toFixed(2)),
      unit: String(l.unit || "").trim(),
      crew: String(l.crew || "").trim(),
      materials: String(l.materials || "").trim(),
      manualsRef: String(l.manualsRef || "").trim(),
      etb: new Prisma.Decimal(num(l.etb).toFixed(2)),
      sortOrder: i,
      updatedAt: new Date(),
    };
  });
}

exports.listWeeklyPlans = async (user, { status } = {}) => {
  assertRead(user);
  const programId = requireProgramId(user);
  const where = { programId };
  if (status) where.status = status;
  const rows = await prisma.cropfort_weekly_plans.findMany({
    where,
    include: INCLUDE,
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(serialize);
};

exports.getWeeklyPlan = async (user, id) => {
  assertRead(user);
  return serialize(await loadPlan(user, id));
};

exports.createWeeklyPlan = async (user, body) => {
  assertWrite(user);
  const programId = requireProgramId(user);
  const weekLabel = String(body.weekLabel || "").trim();
  if (!weekLabel) throw new AppError(400, "VALIDATION_ERROR", "weekLabel is required");

  const code = String(body.code || `WIP-${weekLabel}`).trim();
  const existing = await prisma.cropfort_weekly_plans.findFirst({
    where: { programId, code },
  });
  if (existing) {
    throw new AppError(409, "ALREADY_EXISTS", `Weekly plan code ${code} already exists`);
  }

  const lineData = normalizeLines(body.lines || []);
  const now = new Date();
  const diIds = Array.isArray(body.directInstructionIds)
    ? body.directInstructionIds.filter(Boolean)
    : [];
  const created = await prisma.cropfort_weekly_plans.create({
    data: {
      id: uuid("wp"),
      programId,
      code,
      weekLabel,
      monthlyWoId: body.monthlyWoId || null,
      monthlyWoCode: body.monthlyWoCode || null,
      status: "draft",
      loop: body.loop || "none",
      note: String(body.note || "").trim(),
      bridgedWorkOrderIds: [],
      directInstructionIds: diIds,
      createdByUserId: user.id,
      updatedAt: now,
      lines: { create: lineData },
    },
    include: INCLUDE,
  });

  if (diIds.length) {
    const diService = require("./cropfortDirectInstructions.service");
    await diService.rollDirectInstructionsIntoWeekly(user, diIds, created.id);
  }

  return serialize(created);
};

exports.submitWeeklyPlan = async (user, id) => {
  assertWrite(user);
  const existing = await loadPlan(user, id);
  if (existing.status !== "draft" && existing.status !== "returned") {
    throw new AppError(400, "INVALID_STATUS", "Only draft or returned plans can be submitted");
  }
  const now = new Date();
  const updated = await prisma.cropfort_weekly_plans.update({
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

exports.decideWeeklyPlan = async (user, id, body) => {
  assertDecide(user);
  const existing = await loadPlan(user, id);
  if (existing.status !== "submitted") {
    throw new AppError(400, "INVALID_STATUS", "Only submitted plans can be decided");
  }
  const decision = body.decision;
  if (decision !== "approve" && decision !== "return") {
    throw new AppError(400, "VALIDATION_ERROR", "decision must be approve or return");
  }
  if (decision === "return" && !String(body.comment || "").trim()) {
    throw new AppError(400, "VALIDATION_ERROR", "comment is required when returning");
  }
  const now = new Date();
  const updated = await prisma.cropfort_weekly_plans.update({
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

exports.activateWeeklyPlan = async (user, id) => {
  assertWrite(user);
  const existing = await loadPlan(user, id);
  if (existing.status !== "approved" && existing.status !== "submitted") {
    throw new AppError(400, "INVALID_STATUS", "Approve or submit the weekly plan before activating");
  }

  const bridged = asStringArray(existing.bridgedWorkOrderIds);
  for (const line of existing.lines || []) {
    if (num(line.etb) <= 0) continue;
    const weekMatch = String(existing.weekLabel).match(/(\d+)/);
    const payload = {
      title: `${line.activityName} · ${line.blockCode || ""} · ${existing.weekLabel}`.trim(),
      activity: line.activityName,
      plannedCostEtb: num(line.etb),
      week: weekMatch ? Number(weekMatch[1]) : undefined,
      instructions: line.manualsRef || existing.note || null,
      blockId: line.blockId || undefined,
    };
    let wo;
    try {
      wo = await workOrders.createWorkOrder(user, payload);
    } catch (err) {
      // Demo / local monthly lines may carry block ids outside the programme map.
      if (payload.blockId) {
        wo = await workOrders.createWorkOrder(user, { ...payload, blockId: undefined });
      } else {
        throw err;
      }
    }
    const issued = await workOrders.transitionWorkOrder(user, wo.id, { status: "issued" });
    bridged.push(issued.id);
  }

  const now = new Date();
  const updated = await prisma.cropfort_weekly_plans.update({
    where: { id },
    data: {
      status: "active",
      activatedAt: now,
      bridgedWorkOrderIds: bridged,
      note:
        existing.note ||
        `Bridged ${bridged.length} work order(s)${
          existing.monthlyWoCode ? ` under ${existing.monthlyWoCode}` : ""
        }`,
      updatedAt: now,
    },
    include: INCLUDE,
  });
  return serialize(updated);
};

exports.setWeeklyPlanLoop = async (user, id, loop) => {
  assertWrite(user);
  await loadPlan(user, id);
  const updated = await prisma.cropfort_weekly_plans.update({
    where: { id },
    data: { loop: String(loop || "none"), updatedAt: new Date() },
    include: INCLUDE,
  });
  return serialize(updated);
};
