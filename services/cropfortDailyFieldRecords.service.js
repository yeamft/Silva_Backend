const AppError = require("../utils/AppError");
const prisma = require("../config/database");
const { uuid } = require("../utils/ids");
const { permissionsFor, isSpxRole, isSilvaRole } = require("../utils/roles");
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
  throw new AppError(403, "FORBIDDEN", "Insufficient permissions to view DFRs");
}

function assertWrite(user) {
  const perms = permissionsFor(user.role) || [];
  if (
    perms.includes("work_orders.write") ||
    hasCf(user) ||
    isSpxRole(user.role) ||
    ["system_admin", "spx_platform_admin", "spx_validator", "field_supervisor", "vendor", "vendor_ops"].includes(
      user.role,
    )
  ) {
    return;
  }
  throw new AppError(403, "FORBIDDEN", "Insufficient permissions to mutate DFRs");
}

function assertValidate(user) {
  if (
    isSpxRole(user.role) ||
    ["system_admin", "spx_platform_admin", "spx_validator", "farm_owner"].includes(user.role) ||
    hasCf(user)
  ) {
    return;
  }
  throw new AppError(403, "FORBIDDEN", "Insufficient permissions to validate DFRs");
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

function variancePct(planned, actual) {
  if (planned <= 0) return actual > 0 ? 100 : 0;
  return Math.round(((actual - planned) / planned) * 1000) / 10;
}

function pctDone(planned, actual) {
  if (planned <= 0) return actual > 0 ? 100 : 0;
  return Math.round((actual / planned) * 1000) / 10;
}

function serialize(row) {
  return {
    id: row.id,
    code: row.code,
    programId: row.programId,
    weeklyPlanId: row.weeklyPlanId || "",
    weeklyPlanLineId: row.weeklyPlanLineId || "",
    monthlyWoId: row.monthlyWoId || "",
    monthlyWoCode: row.monthlyWoCode || "",
    monthlyLineId: row.monthlyLineId || "",
    workOrderId: row.workOrderId,
    date: row.date.toISOString().slice(0, 10),
    blockId: row.blockId || "",
    blockCode: row.blockCode || "",
    activityId: row.activityId || "",
    activityCode: row.activityCode || "",
    activityName: row.activityName,
    plannedQty: num(row.plannedQty),
    actualQty: num(row.actualQty),
    unit: row.unit || "",
    laborHours: num(row.laborHours),
    materialsUsed: asStringArray(row.materialsUsedJson),
    notes: row.notes || "",
    status: row.status,
    variancePct: num(row.variancePct),
    linkedTicketId: row.linkedTicketId,
    pctDone: row.pctDone == null ? null : num(row.pctDone),
    qualityScore: row.qualityScore == null ? null : num(row.qualityScore),
    version: row.version,
    supersedesId: row.supersedesId,
    failedCriteria: asStringArray(row.failedCriteriaJson),
    entrySource: row.entrySource || "bagro_platform",
    missCause: row.missCause,
    loop: row.loop || "none",
    validationNotes: row.validationNotes || "",
    createdByUserId: row.createdByUserId,
    createdByName: row.users?.name || null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const INCLUDE = { users: { select: { id: true, name: true } } };

async function load(user, id) {
  const programId = requireProgramId(user);
  const row = await prisma.cropfort_daily_field_records.findFirst({
    where: { id, programId },
    include: INCLUDE,
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Daily field record not found");
  return row;
}

exports.listDailyFieldRecords = async (user, { status, latestOnly } = {}) => {
  assertRead(user);
  const programId = requireProgramId(user);
  const where = { programId };
  if (status) where.status = status;
  const rows = await prisma.cropfort_daily_field_records.findMany({
    where,
    include: INCLUDE,
    orderBy: [{ date: "desc" }, { version: "desc" }],
  });
  let list = rows.map(serialize);
  if (latestOnly !== false) {
    const seen = new Set();
    list = list.filter((r) => {
      const key = `${r.weeklyPlanLineId || r.activityCode}|${r.date}|${r.blockCode}`;
      if (seen.has(key) && r.supersedesId) return false;
      // Prefer highest version per lineage root
      const root = r.supersedesId || r.id;
      const lineageKey = `${root}|${r.date}`;
      if (seen.has(lineageKey)) return false;
      seen.add(lineageKey);
      return true;
    });
  }
  return list;
};

exports.getDailyFieldRecord = async (user, id) => {
  assertRead(user);
  return serialize(await load(user, id));
};

exports.createDailyFieldRecord = async (user, body) => {
  assertWrite(user);
  const programId = requireProgramId(user);
  const activityName = String(body.activityName || "").trim();
  if (!activityName) throw new AppError(400, "VALIDATION_ERROR", "activityName is required");
  const plannedQty = num(body.plannedQty);
  const actualQty = num(body.actualQty);
  const date = body.date ? new Date(body.date) : new Date();
  if (Number.isNaN(date.getTime())) throw new AppError(400, "VALIDATION_ERROR", "Invalid date");

  const code =
    String(body.code || "").trim() ||
    `DFR-${date.toISOString().slice(5, 10).replace("-", "")}-${Date.now().toString(36).slice(-4).toUpperCase()}`;

  const now = new Date();
  const created = await prisma.cropfort_daily_field_records.create({
    data: {
      id: uuid("dfr"),
      programId,
      code,
      weeklyPlanId: body.weeklyPlanId || null,
      weeklyPlanLineId: body.weeklyPlanLineId || null,
      monthlyWoId: body.monthlyWoId || null,
      monthlyWoCode: String(body.monthlyWoCode || "").trim(),
      monthlyLineId: body.monthlyLineId || null,
      workOrderId: body.workOrderId || null,
      date,
      blockId: body.blockId || null,
      blockCode: String(body.blockCode || "").trim(),
      activityId: body.activityId || null,
      activityCode: String(body.activityCode || "").trim(),
      activityName,
      plannedQty: new Prisma.Decimal(plannedQty.toFixed(2)),
      actualQty: new Prisma.Decimal(actualQty.toFixed(2)),
      unit: String(body.unit || "").trim(),
      laborHours: new Prisma.Decimal(num(body.laborHours).toFixed(2)),
      materialsUsedJson: Array.isArray(body.materialsUsed) ? body.materialsUsed : [],
      notes: String(body.notes || "").trim(),
      status: "draft",
      variancePct: new Prisma.Decimal(variancePct(plannedQty, actualQty).toFixed(2)),
      pctDone: new Prisma.Decimal(pctDone(plannedQty, actualQty).toFixed(2)),
      entrySource: body.entrySource || "bagro_platform",
      missCause: body.missCause || null,
      createdByUserId: user.id,
      updatedAt: now,
    },
    include: INCLUDE,
  });
  return serialize(created);
};

exports.updateDailyFieldRecord = async (user, id, body) => {
  assertWrite(user);
  const existing = await load(user, id);
  if (existing.status !== "draft" && existing.status !== "returned") {
    throw new AppError(400, "INVALID_STATUS", "Only draft or returned DFRs can be edited");
  }
  const plannedQty = body.plannedQty != null ? num(body.plannedQty) : num(existing.plannedQty);
  const actualQty = body.actualQty != null ? num(body.actualQty) : num(existing.actualQty);
  const data = {
    updatedAt: new Date(),
    variancePct: new Prisma.Decimal(variancePct(plannedQty, actualQty).toFixed(2)),
    pctDone: new Prisma.Decimal(pctDone(plannedQty, actualQty).toFixed(2)),
  };
  if (body.actualQty != null) data.actualQty = new Prisma.Decimal(actualQty.toFixed(2));
  if (body.plannedQty != null) data.plannedQty = new Prisma.Decimal(plannedQty.toFixed(2));
  if (body.laborHours != null) data.laborHours = new Prisma.Decimal(num(body.laborHours).toFixed(2));
  if (body.notes != null) data.notes = String(body.notes).trim();
  if (body.materialsUsed != null) data.materialsUsedJson = body.materialsUsed;
  if (body.date != null) {
    const d = new Date(body.date);
    if (Number.isNaN(d.getTime())) throw new AppError(400, "VALIDATION_ERROR", "Invalid date");
    data.date = d;
  }
  if (body.missCause !== undefined) data.missCause = body.missCause || null;
  if (existing.status === "returned") data.status = "draft";

  const updated = await prisma.cropfort_daily_field_records.update({
    where: { id },
    data,
    include: INCLUDE,
  });
  return serialize(updated);
};

exports.submitDailyFieldRecord = async (user, id) => {
  assertWrite(user);
  const existing = await load(user, id);
  if (existing.status !== "draft" && existing.status !== "returned") {
    throw new AppError(400, "INVALID_STATUS", "Only draft or returned DFRs can be submitted");
  }
  const updated = await prisma.cropfort_daily_field_records.update({
    where: { id },
    data: { status: "submitted", updatedAt: new Date() },
    include: INCLUDE,
  });
  return serialize(updated);
};

exports.siteCheckDailyFieldRecord = async (user, id, body = {}) => {
  assertWrite(user);
  const existing = await load(user, id);
  if (existing.status !== "submitted") {
    throw new AppError(400, "INVALID_STATUS", "Only submitted DFRs can be site-checked");
  }
  const updated = await prisma.cropfort_daily_field_records.update({
    where: { id },
    data: {
      status: "site_checked",
      qualityScore:
        body.qualityScore != null
          ? new Prisma.Decimal(num(body.qualityScore).toFixed(2))
          : existing.qualityScore,
      validationNotes: body.note
        ? String(body.note).trim()
        : existing.validationNotes,
      updatedAt: new Date(),
    },
    include: INCLUDE,
  });
  return serialize(updated);
};

exports.validateDailyFieldRecord = async (user, id, body = {}) => {
  assertValidate(user);
  const existing = await load(user, id);
  if (existing.status !== "submitted" && existing.status !== "site_checked") {
    throw new AppError(400, "INVALID_STATUS", "DFR must be submitted or site-checked to validate");
  }
  const updated = await prisma.cropfort_daily_field_records.update({
    where: { id },
    data: {
      status: "validated",
      qualityScore:
        body.qualityScore != null
          ? new Prisma.Decimal(num(body.qualityScore).toFixed(2))
          : existing.qualityScore,
      missCause: body.missCause !== undefined ? body.missCause || null : existing.missCause,
      validationNotes: body.note ? String(body.note).trim() : existing.validationNotes,
      failedCriteriaJson: [],
      updatedAt: new Date(),
    },
    include: INCLUDE,
  });
  return serialize(updated);
};

exports.returnDailyFieldRecord = async (user, id, body = {}) => {
  assertValidate(user);
  const existing = await load(user, id);
  if (
    existing.status !== "submitted" &&
    existing.status !== "site_checked" &&
    existing.status !== "validated"
  ) {
    throw new AppError(400, "INVALID_STATUS", "DFR cannot be returned in this status");
  }
  const note = String(body.note || body.comment || "").trim();
  if (!note) throw new AppError(400, "VALIDATION_ERROR", "note is required when returning");
  const updated = await prisma.cropfort_daily_field_records.update({
    where: { id },
    data: {
      status: "returned",
      validationNotes: note,
      failedCriteriaJson: Array.isArray(body.failedCriteria) ? body.failedCriteria : [],
      loop: "F_dfr_correction",
      updatedAt: new Date(),
    },
    include: INCLUDE,
  });
  return serialize(updated);
};

exports.correctDailyFieldRecord = async (user, id, body = {}) => {
  assertWrite(user);
  const existing = await load(user, id);
  if (existing.status !== "returned") {
    throw new AppError(400, "INVALID_STATUS", "Only returned DFRs can be corrected as a new version");
  }
  const plannedQty = num(existing.plannedQty);
  const actualQty = body.actualQty != null ? num(body.actualQty) : num(existing.actualQty);
  const now = new Date();
  const created = await prisma.cropfort_daily_field_records.create({
    data: {
      id: uuid("dfr"),
      programId: existing.programId,
      code: `${existing.code}-v${existing.version + 1}`,
      weeklyPlanId: existing.weeklyPlanId,
      weeklyPlanLineId: existing.weeklyPlanLineId,
      monthlyWoId: existing.monthlyWoId,
      monthlyWoCode: existing.monthlyWoCode,
      monthlyLineId: existing.monthlyLineId,
      workOrderId: existing.workOrderId,
      date: body.date ? new Date(body.date) : existing.date,
      blockId: existing.blockId,
      blockCode: existing.blockCode,
      activityId: existing.activityId,
      activityCode: existing.activityCode,
      activityName: existing.activityName,
      plannedQty: existing.plannedQty,
      actualQty: new Prisma.Decimal(actualQty.toFixed(2)),
      unit: existing.unit,
      laborHours:
        body.laborHours != null
          ? new Prisma.Decimal(num(body.laborHours).toFixed(2))
          : existing.laborHours,
      materialsUsedJson:
        body.materialsUsed != null ? body.materialsUsed : existing.materialsUsedJson,
      notes: body.notes != null ? String(body.notes).trim() : existing.notes,
      status: "draft",
      variancePct: new Prisma.Decimal(variancePct(plannedQty, actualQty).toFixed(2)),
      pctDone: new Prisma.Decimal(pctDone(plannedQty, actualQty).toFixed(2)),
      version: existing.version + 1,
      supersedesId: existing.id,
      entrySource: existing.entrySource,
      createdByUserId: user.id,
      updatedAt: now,
    },
    include: INCLUDE,
  });
  return serialize(created);
};
