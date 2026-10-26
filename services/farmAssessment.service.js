const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const { uuid } = require("../utils/ids");
const { requireProgramId } = require("../utils/farmRateAccess");
const { assertView, assertEditAssessment, assertDecide } = require("../utils/modularRateAccess");
const { canCreateOrEditPlans, isAssetOwnerApprover } = require("../utils/roles");
const notifications = require("./notifications.service");

const PURPOSES = ["annual_baseline", "follow_up", "special"];
const CONDITIONS = ["good", "fair", "poor"];

const metadata = {
  id: true, planId: true, farmEstateId: true, programId: true,
  planningCycle: true, planYear: true, title: true,
  assessmentDate: true, assessorName: true, assessorUserId: true,
  assessmentPurpose: true, assessedAreaHa: true, cropStage: true,
  generalCondition: true, findings: true, recommendedOps: true,
  blockIds: true, reportName: true, reportSize: true,
  revision: true, status: true, returnedComment: true,
  submittedByUserId: true, submittedAt: true, reviewedAt: true,
  history: true, createdAt: true, updatedAt: true,
};

const editable = (row) => !row || ["draft", "changes_requested"].includes(row.status);

// ── helpers ────────────────────────────────────────────────────────────────

function normalizeTitle(title) {
  return String(title || "")
    .replace(" Annual Farm Assessment — ", " Annual Farm Assessment ")
    .replace(/^Annual Farm Assessment — /, "Annual Farm Assessment ");
}

async function loadAssessment(user, id, db = prisma) {
  assertView(user);
  const programId = requireProgramId(user);
  const row = await db.cropfort_farm_assessments.findFirst({
    where: { id, programId },
    select: metadata,
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Farm assessment not found");
  return row;
}

/**
 * Resolve an assessment by planId for backward-compatible plan-scoped routes.
 * Returns the assessment whose planId matches, or throws 404.
 */
async function loadAssessmentByPlanId(user, planId, db = prisma) {
  assertView(user);
  const programId = requireProgramId(user);
  const row = await db.cropfort_farm_assessments.findFirst({
    where: { planId, programId },
    select: metadata,
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Farm assessment not found");
  return row;
}

/**
 * For the legacy redirect endpoint: find all assessments linked to a planId.
 * Returns an array (may be empty or have exactly one entry given the unique constraint).
 */
async function findByPlanId(user, planId, db = prisma) {
  assertView(user);
  const programId = requireProgramId(user);
  return db.cropfort_farm_assessments.findMany({
    where: { planId, programId },
    select: { id: true, title: true, status: true, assessmentDate: true },
    orderBy: { createdAt: "asc" },
  });
}

function serialize(row, user) {
  return {
    ...row,
    title: normalizeTitle(row.title),
    assessedAreaHa: row.assessedAreaHa ? Number(row.assessedAreaHa) : null,
    recommendedOps: Array.isArray(row.recommendedOps) ? row.recommendedOps : [],
    history: Array.isArray(row.history) ? row.history : [],
    blockIds: Array.isArray(row.blockIds) ? row.blockIds : [],
    assessmentDate: row.assessmentDate ? row.assessmentDate.toISOString().slice(0, 10) : null,
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    createdAt: row.createdAt ? row.createdAt.toISOString() : null,
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
    canEdit: editable(row) && (canCreateOrEditPlans(user) || _isFieldRole(user)),
    canReview: isAssetOwnerApprover(user) && row.status === "submitted" && row.submittedByUserId !== user.id,
  };
}

function _isFieldRole(user) {
  const role = user.role || "";
  const cf = user.cropfortRoles || [];
  return (
    role === "field_supervisor" || role === "bagro_office" ||
    cf.includes("field_supervisor") || cf.includes("bagro_office")
  );
}

async function write(db, id, row, data) {
  if (!row) {
    return db.cropfort_farm_assessments.create({ data: { id, ...data }, select: metadata });
  }
  const result = await db.cropfort_farm_assessments.updateMany({
    where: { id, revision: row.revision },
    data: { ...data, revision: { increment: 1 } },
  });
  if (result.count !== 1) throw new AppError(409, "CONFLICT", "This assessment has changed. Reload it before continuing.");
  return db.cropfort_farm_assessments.findUnique({ where: { id }, select: metadata });
}

async function auditLog(db, user, row, action) {
  await db.audit_log.create({
    data: {
      id: uuid("aud"), programId: row.programId, userId: user.id,
      entityType: "farm_assessment", entityId: row.id,
      action: `farm_assessment.${action}`,
      newValue: { status: row.status, revision: row.revision },
    },
  });
}

function generateTitle(farmName, planYear, planningCycle) {
  const farm = String(farmName || "").trim();
  const cycle = String(planningCycle || "").trim() || (planYear ? `${planYear} Programme` : "");
  if (farm && cycle) return `${farm} Annual Farm Assessment ${cycle}`;
  if (farm) return `${farm} Annual Farm Assessment`;
  return cycle ? `Annual Farm Assessment ${cycle}` : "Farm Assessment";
}

function hasSubmittableContent(row) {
  if (row.findings && row.findings.trim()) return true;
  if (row.generalCondition) return true;
  if (Array.isArray(row.recommendedOps) && row.recommendedOps.length > 0) return true;
  return false;
}

// ── GET by id ──────────────────────────────────────────────────────────────
exports.get = async (user, id) => {
  const row = await loadAssessment(user, id);
  return serialize(row, user);
};

// ── GET by planId (legacy plan-scoped route) ───────────────────────────────
exports.getByPlanId = async (user, planId) => {
  const row = await loadAssessmentByPlanId(user, planId);
  return serialize(row, user);
};

// ── RESOLVE planId → assessment id(s) for redirect ────────────────────────
exports.resolveByPlanId = async (user, planId) => {
  return findByPlanId(user, planId);
};

// ── LIST ───────────────────────────────────────────────────────────────────
exports.list = async (user, filters = {}) => {
  assertView(user);
  const programId = requireProgramId(user);

  const where = { programId };
  if (filters.farmEstateId) where.farmEstateId = filters.farmEstateId;
  if (filters.planYear) where.planYear = Number(filters.planYear);
  if (filters.status) where.status = filters.status;
  if (filters.search) {
    const term = String(filters.search).trim();
    where.OR = [
      { title: { contains: term, mode: "insensitive" } },
      { assessorName: { contains: term, mode: "insensitive" } },
      { planningCycle: { contains: term, mode: "insensitive" } },
    ];
  }
  if (filters.dateFrom || filters.dateTo) {
    where.assessmentDate = {};
    if (filters.dateFrom) where.assessmentDate.gte = new Date(filters.dateFrom);
    if (filters.dateTo) where.assessmentDate.lte = new Date(filters.dateTo);
  }

  const rows = await prisma.cropfort_farm_assessments.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true, planId: true, farmEstateId: true, planYear: true,
      title: true, planningCycle: true, assessmentDate: true,
      assessmentPurpose: true, assessedAreaHa: true, status: true,
      reportName: true, updatedAt: true,
      recommendedOps: true,
      farm_estate: { select: { name: true } },
      plan: { select: { name: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    planId: r.planId || null,
    planName: r.plan?.name || null,
    farmName: r.farm_estate?.name || null,
    farmEstateId: r.farmEstateId || null,
    planYear: r.planYear || null,
    cycleLabel: r.planningCycle || (r.planYear ? `${r.planYear} Programme` : ""),
    title: normalizeTitle(r.title),
    assessmentDate: r.assessmentDate ? r.assessmentDate.toISOString().slice(0, 10) : null,
    assessmentPurpose: r.assessmentPurpose,
    assessedAreaHa: r.assessedAreaHa ? Number(r.assessedAreaHa) : null,
    status: r.status,
    reportName: r.reportName || null,
    findingsCount: 0, // Phase 3: will count from child table
    recommendationsCount: Array.isArray(r.recommendedOps) ? r.recommendedOps.length : 0,
    updatedAt: r.updatedAt?.toISOString() || null,
  }));
};

// ── SUMMARY COUNTS for register cards ─────────────────────────────────────
exports.summaryCounts = async (user) => {
  assertView(user);
  const programId = requireProgramId(user);
  const rows = await prisma.cropfort_farm_assessments.groupBy({
    by: ["status"],
    where: { programId },
    _count: { id: true },
  });
  const counts = { total: 0, draft: 0, submitted: 0, approved: 0, changes_requested: 0 };
  for (const r of rows) {
    const n = r._count.id;
    counts.total += n;
    if (r.status in counts) counts[r.status] += n;
  }
  return counts;
};

// ── CREATE (standalone — no plan required) ─────────────────────────────────
exports.create = async (user, body) => {
  assertEditAssessment(user);
  const programId = requireProgramId(user);

  // Validate farm belongs to program
  if (!body.farmEstateId) throw new AppError(400, "VALIDATION_ERROR", "farmEstateId is required");
  const farm = await prisma.farm_estates.findFirst({
    where: { id: body.farmEstateId, programId },
    select: { id: true, name: true },
  });
  if (!farm) throw new AppError(400, "VALIDATION_ERROR", "Farm area not found in this workspace");

  // Validate optional plan belongs to same program + farm
  let linkedPlan = null;
  if (body.planId) {
    linkedPlan = await prisma.cropfort_programme_plans.findFirst({
      where: { id: body.planId, programId, farmEstateId: farm.id },
      select: { id: true, name: true, planYear: true, planningCycleLabel: true },
    });
    if (!linkedPlan) throw new AppError(400, "VALIDATION_ERROR", "Core Operations plan not found or does not belong to this farm");
    // Prevent linking to a plan that already has an assessment
    const existing = await prisma.cropfort_farm_assessments.findFirst({
      where: { planId: body.planId },
      select: { id: true },
    });
    if (existing) throw new AppError(409, "CONFLICT", "This Core Operations plan already has an assessment linked to it");
  }

  const planYear = body.planYear ? Number(body.planYear) : (linkedPlan?.planYear || null);
  const planningCycle = String(body.planningCycle || linkedPlan?.planningCycleLabel || "").trim() || null;
  const title = String(body.title || "").trim() || generateTitle(farm.name, planYear, planningCycle);

  const id = uuid("fa");
  return prisma.$transaction(async (db) => {
    const row = await db.cropfort_farm_assessments.create({
      data: {
        id,
        programId,
        planId: body.planId || null,
        farmEstateId: farm.id,
        planYear,
        planningCycle,
        title,
        assessmentDate: body.assessmentDate ? new Date(body.assessmentDate) : new Date(),
        assessorName: body.assessorName || user.name,
        assessorUserId: body.assessorUserId || user.id,
        assessmentPurpose: PURPOSES.includes(body.assessmentPurpose) ? body.assessmentPurpose : "annual_baseline",
        blockIds: Array.isArray(body.blockIds) ? body.blockIds : [],
        findings: "",
        recommendedOps: [],
        status: "draft",
        revision: 1,
      },
      select: metadata,
    });
    await auditLog(db, user, row, "created");
    return serialize(row, user);
  });
};

// ── SAVE (findings + structured fields + optional report) ──────────────────
exports.save = async (user, id, body, file) => {
  assertEditAssessment(user);
  if (file && (file.size > 5 * 1024 * 1024 || file.buffer.subarray(0, 5).toString() !== "%PDF-")) {
    throw new AppError(400, "INVALID_FILE", "Upload a valid PDF report (up to 5 MB).");
  }
  return prisma.$transaction(async (db) => {
    const row = await loadAssessment(user, id, db);
    if (!editable(row)) throw new AppError(409, "INVALID_STATE_TRANSITION", "Only drafts and assessments needing changes can be edited");
    if ((row.revision || 0) !== body.revision) throw new AppError(409, "CONFLICT", "This assessment has changed. Reload it before continuing.");

    const data = {
      findings: body.findings ?? row.findings,
      assessedAreaHa: body.assessedAreaHa != null ? body.assessedAreaHa : row.assessedAreaHa,
      cropStage: body.cropStage ?? row.cropStage,
      generalCondition: CONDITIONS.includes(body.generalCondition) ? body.generalCondition : row.generalCondition,
      recommendedOps: Array.isArray(body.recommendedOps) ? body.recommendedOps : row.recommendedOps,
      assessorName: body.assessorName ?? row.assessorName,
      assessorUserId: body.assessorUserId !== undefined ? (body.assessorUserId || null) : row.assessorUserId,
      assessmentDate: body.assessmentDate ? new Date(body.assessmentDate) : row.assessmentDate,
      planningCycle: body.planningCycle ?? row.planningCycle,
      planYear: body.planYear != null ? Number(body.planYear) : row.planYear,
      title: body.title ? String(body.title).trim() : row.title,
      blockIds: Array.isArray(body.blockIds) ? body.blockIds : row.blockIds,
      planId: body.planId !== undefined ? (body.planId || null) : row.planId,
    };
    if (file) {
      data.reportName = file.originalname.split(/[\\\/]/).pop().replace(/[\x00-\x1f\x7f]/g, "").slice(-200) || "assessment.pdf";
      data.reportData = file.buffer;
      data.reportSize = file.size;
    }
    const updated = await write(db, id, row, data);
    await auditLog(db, user, updated, "saved");
    return serialize(updated, user);
  });
};

// ── SAVE via legacy planId route ───────────────────────────────────────────
exports.saveByPlanId = async (user, planId, body, file) => {
  const row = await loadAssessmentByPlanId(user, planId);
  return exports.save(user, row.id, body, file);
};

// ── SUBMIT ─────────────────────────────────────────────────────────────────
exports.submit = async (user, id, body) => {
  assertEditAssessment(user);
  const updated = await prisma.$transaction(async (db) => {
    const row = await loadAssessment(user, id, db);
    if ((row.revision || 0) !== body.revision) throw new AppError(409, "CONFLICT", "This assessment has changed. Reload it before continuing.");
    if (!editable(row)) throw new AppError(409, "INVALID_STATE_TRANSITION", "Save a draft assessment before submitting");
    if (!hasSubmittableContent(row)) {
      throw new AppError(400, "VALIDATION_ERROR", "Add at least one finding, condition assessment, or recommendation before submitting");
    }
    const at = new Date();
    const u = await write(db, id, row, {
      status: "submitted", submittedByUserId: user.id, submittedAt: at, reviewedAt: null,
      returnedComment: null,
      history: [...(row.history || []), { action: "submitted", actorName: user.name, at: at.toISOString(), comment: "", reportName: row.reportName }],
    });
    await auditLog(db, user, u, "submitted");
    return u;
  });
  notifications.notifyFarmAssessment(
    { id: updated.id, name: updated.title || updated.planningCycle || "Farm Assessment", programId: updated.programId },
    updated, "submitted", user.name,
  ).catch(() => {});
  return serialize(updated, user);
};

// ── SUBMIT via legacy planId route ─────────────────────────────────────────
exports.submitByPlanId = async (user, planId, body) => {
  const row = await loadAssessmentByPlanId(user, planId);
  return exports.submit(user, row.id, body);
};

// ── DECIDE ─────────────────────────────────────────────────────────────────
exports.decide = async (user, id, body) => {
  assertDecide(user);
  if (!["approve", "request_changes"].includes(body.decision)) throw new AppError(400, "VALIDATION_ERROR", "Invalid decision");
  const comment = String(body.comment || "").trim();
  if (body.decision === "request_changes" && !comment) throw new AppError(400, "VALIDATION_ERROR", "Explain the changes needed");
  const updated = await prisma.$transaction(async (db) => {
    const row = await loadAssessment(user, id, db);
    if ((row.revision || 0) !== body.revision) throw new AppError(409, "CONFLICT", "This assessment has changed. Reload it before continuing.");
    if (row.status !== "submitted") throw new AppError(409, "INVALID_STATE_TRANSITION", "Only submitted assessments can be reviewed");
    if (row.submittedByUserId === user.id) throw new AppError(403, "FORBIDDEN", "You cannot review your own submission");
    const at = new Date();
    const status = body.decision === "approve" ? "approved" : "changes_requested";
    const u = await write(db, id, row, {
      status, reviewedAt: at,
      returnedComment: body.decision === "request_changes" ? comment : null,
      history: [...(row.history || []), { action: status, actorName: user.name, at: at.toISOString(), comment }],
    });
    await auditLog(db, user, u, status);
    return u;
  });
  const status = updated.status;
  notifications.notifyFarmAssessment(
    { id: updated.id, name: updated.title || updated.planningCycle || "Farm Assessment", programId: updated.programId },
    updated, status, user.name,
  ).catch(() => {});
  return serialize(updated, user);
};

// ── DECIDE via legacy planId route ─────────────────────────────────────────
exports.decideByPlanId = async (user, planId, body) => {
  const row = await loadAssessmentByPlanId(user, planId);
  return exports.decide(user, row.id, body);
};

// ── DOWNLOAD ───────────────────────────────────────────────────────────────
exports.download = async (user, id) => {
  await loadAssessment(user, id);
  const row = await prisma.cropfort_farm_assessments.findUnique({
    where: { id }, select: { reportName: true, reportData: true },
  });
  if (!row?.reportData) throw new AppError(404, "NOT_FOUND", "No assessment report has been uploaded");
  return row;
};

// ── DOWNLOAD via legacy planId route ──────────────────────────────────────
exports.downloadByPlanId = async (user, planId) => {
  const row = await loadAssessmentByPlanId(user, planId);
  return exports.download(user, row.id);
};
