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

function canDraft(user) {
  const perms = permissionsFor(user.role) || [];
  return (
    perms.includes("reports.draft") ||
    isSpxRole(user.role) ||
    ["system_admin", "spx_platform_admin", "spx_validator", "field_supervisor"].includes(user.role)
  );
}

function canRelease(user) {
  const perms = permissionsFor(user.role) || [];
  return perms.includes("reports.release") || isAssetOwnerApprover(user) || user.role === "system_admin";
}

function canRead(user) {
  const perms = permissionsFor(user.role) || [];
  return (
    canDraft(user) ||
    canRelease(user) ||
    perms.includes("reports.read_released") ||
    isSpxRole(user.role) ||
    ["farm_owner", "field_supervisor", "vendor", "vendor_ops"].includes(user.role)
  );
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function serialize(row) {
  return {
    id: row.id,
    code: row.code,
    title: row.title || "",
    cadence: row.cadence,
    periodLabel: row.periodLabel,
    status: row.status,
    farmName: row.farmName || "",
    programName: row.programName || "",
    authorName: row.authorName || "",
    summary: row.summary || "",
    highlights: row.highlights || "",
    risks: row.risks || "",
    recommendations: row.recommendations || "",
    outlook: row.outlook || "",
    planEtb: num(row.planEtb),
    actualEtb: num(row.actualEtb),
    variancePct: num(row.variancePct),
    metrics: row.metricsJson || {},
    activityLines: row.activityLinesJson || [],
    blockLines: row.blockLinesJson || [],
    attentionItems: row.attentionItemsJson || [],
    missAttributions: row.missAttributionsJson || [],
    events: row.eventsJson || [],
    returnedComment: row.returnedComment || null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    releasedAt: row.releasedAt ? row.releasedAt.toISOString() : null,
    releasedTo: row.releasedTo || null,
  };
}

function assertVisible(user, row) {
  if (canDraft(user) || canRelease(user)) return;
  if (row.status === "released" || row.visibleToSilva) return;
  throw new AppError(403, "FORBIDDEN", "Report not available");
}

exports.listReports = async (user, { status } = {}) => {
  if (!canRead(user)) throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  const programId = requireProgramId(user);
  const where = { programId };
  if (status) where.status = status;
  if (!canDraft(user) && !canRelease(user)) {
    where.OR = [{ status: "released" }, { visibleToSilva: true }];
  }
  const rows = await prisma.reports.findMany({
    where,
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(serialize);
};

exports.getReport = async (user, id) => {
  if (!canRead(user)) throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  const programId = requireProgramId(user);
  const row = await prisma.reports.findFirst({ where: { id, programId } });
  if (!row) throw new AppError(404, "NOT_FOUND", "Report not found");
  assertVisible(user, row);
  return serialize(row);
};

exports.createReport = async (user, body) => {
  if (!canDraft(user)) throw new AppError(403, "FORBIDDEN", "Cannot draft reports");
  const programId = requireProgramId(user);
  const cadence = body.cadence || "monthly";
  if (!["monthly", "six_month", "annual"].includes(cadence)) {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid cadence");
  }
  const periodLabel = String(body.periodLabel || "").trim();
  if (!periodLabel) throw new AppError(400, "VALIDATION_ERROR", "periodLabel is required");

  const n = (await prisma.reports.count({ where: { programId } })) + 1;
  const code =
    cadence === "monthly"
      ? `MR-${2600 + n}`
      : cadence === "six_month"
        ? `SMR-${100 + n}`
        : `AR-${2026 + (n % 10)}`;

  const now = new Date();
  const events = [
    {
      id: uuid("rev"),
      at: now.toISOString(),
      actor: user.name || user.email || "User",
      action: "Created draft",
    },
  ];

  const row = await prisma.reports.create({
    data: {
      id: uuid("rpt"),
      programId,
      code,
      title: String(body.title || "").trim() || `${cadence} report — ${periodLabel}`,
      cadence,
      periodLabel,
      status: "draft",
      farmName: String(body.farmName || "").trim(),
      programName: String(body.programName || "").trim(),
      authorName: String(body.authorName || user.name || "").trim(),
      summary: String(body.summary || ""),
      highlights: String(body.highlights || ""),
      risks: String(body.risks || ""),
      recommendations: String(body.recommendations || ""),
      outlook: String(body.outlook || ""),
      planEtb: new Prisma.Decimal(num(body.planEtb).toFixed(2)),
      actualEtb: new Prisma.Decimal(num(body.actualEtb).toFixed(2)),
      variancePct: new Prisma.Decimal(num(body.variancePct).toFixed(2)),
      metricsJson: body.metrics || {},
      activityLinesJson: body.activityLines || [],
      blockLinesJson: body.blockLines || [],
      attentionItemsJson: body.attentionItems || [],
      missAttributionsJson: body.missAttributions || [],
      eventsJson: events,
      createdByUserId: user.id,
      updatedAt: now,
    },
  });
  return serialize(row);
};

exports.updateDraft = async (user, id, body) => {
  if (!canDraft(user)) throw new AppError(403, "FORBIDDEN", "Cannot edit reports");
  const programId = requireProgramId(user);
  const existing = await prisma.reports.findFirst({ where: { id, programId } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Report not found");
  if (existing.status !== "draft" && existing.status !== "returned") {
    throw new AppError(400, "INVALID_STATUS", "Only draft/returned reports can be edited");
  }

  const patch = {};
  for (const key of [
    "title",
    "summary",
    "highlights",
    "risks",
    "recommendations",
    "outlook",
    "periodLabel",
    "farmName",
    "programName",
  ]) {
    if (body[key] !== undefined) patch[key] = String(body[key] ?? "");
  }
  if (body.planEtb != null) patch.planEtb = new Prisma.Decimal(num(body.planEtb).toFixed(2));
  if (body.actualEtb != null) patch.actualEtb = new Prisma.Decimal(num(body.actualEtb).toFixed(2));
  if (body.variancePct != null) {
    patch.variancePct = new Prisma.Decimal(num(body.variancePct).toFixed(2));
  }
  if (body.metrics) patch.metricsJson = body.metrics;
  if (body.activityLines) patch.activityLinesJson = body.activityLines;
  if (body.blockLines) patch.blockLinesJson = body.blockLines;
  if (body.attentionItems) patch.attentionItemsJson = body.attentionItems;
  if (body.missAttributions) patch.missAttributionsJson = body.missAttributions;

  const events = Array.isArray(existing.eventsJson) ? [...existing.eventsJson] : [];
  events.push({
    id: uuid("rev"),
    at: new Date().toISOString(),
    actor: user.name || "User",
    action: "Updated draft",
  });
  patch.eventsJson = events;
  patch.updatedAt = new Date();

  const updated = await prisma.reports.update({ where: { id }, data: patch });
  return serialize(updated);
};

exports.submitReport = async (user, id) => {
  if (!canDraft(user)) throw new AppError(403, "FORBIDDEN", "Cannot submit reports");
  const programId = requireProgramId(user);
  const existing = await prisma.reports.findFirst({ where: { id, programId } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Report not found");
  if (existing.status !== "draft" && existing.status !== "returned") {
    throw new AppError(400, "INVALID_STATUS", "Only draft/returned reports can be submitted");
  }
  const events = Array.isArray(existing.eventsJson) ? [...existing.eventsJson] : [];
  events.push({
    id: uuid("rev"),
    at: new Date().toISOString(),
    actor: user.name || "User",
    action: "Submitted",
  });
  const updated = await prisma.reports.update({
    where: { id },
    data: {
      status: "submitted",
      submittedAt: new Date(),
      returnedComment: null,
      eventsJson: events,
      updatedAt: new Date(),
    },
  });
  return serialize(updated);
};

exports.releaseReport = async (user, id, body = {}) => {
  if (!canRelease(user)) throw new AppError(403, "FORBIDDEN", "Cannot release reports");
  const programId = requireProgramId(user);
  const existing = await prisma.reports.findFirst({ where: { id, programId } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Report not found");
  if (existing.status !== "submitted") {
    throw new AppError(400, "INVALID_STATUS", "Only submitted reports can be released to Silva");
  }
  const events = Array.isArray(existing.eventsJson) ? [...existing.eventsJson] : [];
  events.push({
    id: uuid("rev"),
    at: new Date().toISOString(),
    actor: user.name || "User",
    action: "Released",
  });
  const updated = await prisma.reports.update({
    where: { id },
    data: {
      status: "released",
      releasedAt: new Date(),
      releasedTo: String(body.to || "Silva / asset owner").trim(),
      releasedByUserId: user.id,
      visibleToSilva: true,
      eventsJson: events,
      updatedAt: new Date(),
    },
  });
  return serialize(updated);
};

exports.returnReport = async (user, id, body = {}) => {
  if (!canRelease(user)) throw new AppError(403, "FORBIDDEN", "Cannot return reports");
  const programId = requireProgramId(user);
  const existing = await prisma.reports.findFirst({ where: { id, programId } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Report not found");
  if (existing.status !== "submitted") {
    throw new AppError(400, "INVALID_STATUS", "Only submitted reports can be returned");
  }
  const events = Array.isArray(existing.eventsJson) ? [...existing.eventsJson] : [];
  events.push({
    id: uuid("rev"),
    at: new Date().toISOString(),
    actor: user.name || "User",
    action: "Returned",
  });
  const updated = await prisma.reports.update({
    where: { id },
    data: {
      status: "returned",
      returnedComment: String(body.comment || "").trim() || null,
      eventsJson: events,
      updatedAt: new Date(),
    },
  });
  return serialize(updated);
};

exports.deleteReport = async (user, id) => {
  if (!canDraft(user)) throw new AppError(403, "FORBIDDEN", "Cannot delete reports");
  const programId = requireProgramId(user);
  const existing = await prisma.reports.findFirst({ where: { id, programId } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Report not found");
  if (existing.status === "released") {
    throw new AppError(400, "INVALID_STATUS", "Released reports cannot be deleted");
  }
  await prisma.reports.delete({ where: { id } });
  return { ok: true };
};
