const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const { uuid } = require("../utils/ids");
const { requireProgramId } = require("../utils/farmRateAccess");
const { assertView, assertEdit, assertDecide } = require("../utils/modularRateAccess");
const { canCreateOrEditPlans, isAssetOwnerApprover } = require("../utils/roles");
const notifications = require("./notifications.service");

// Never load report bytes as part of a page or mutation response.
const metadata = {
  planId: true, status: true, findings: true, reportName: true, reportSize: true,
  revision: true, submittedByUserId: true, submittedAt: true, reviewedAt: true,
  history: true, updatedAt: true,
};
const editable = (row) => !row || ["draft", "changes_requested"].includes(row.status);
const planOpen = (plan) => !["archived", "closed"].includes(plan.status);

async function loadPlan(user, planId, db = prisma) {
  assertView(user);
  const plan = await db.cropfort_programme_plans.findFirst({
    where: { id: planId, programId: requireProgramId(user) },
    select: { id: true, programId: true, name: true, status: true },
  });
  if (!plan) throw new AppError(404, "NOT_FOUND", "Programme plan not found");
  return plan;
}

function serialize(row, user, plan) {
  return {
    ...(row || { planId: plan.id, status: "draft", findings: "", reportName: null,
      reportSize: null, revision: 0, submittedAt: null, reviewedAt: null, history: [] }),
    canEdit: planOpen(plan) && canCreateOrEditPlans(user) && editable(row),
    canReview: planOpen(plan) && isAssetOwnerApprover(user) && row?.status === "submitted" && row.submittedByUserId !== user.id,
  };
}

function assertOpen(plan) {
  if (!planOpen(plan)) throw new AppError(409, "INVALID_STATE_TRANSITION", "Archived or closed programmes are read-only");
}

function assertRevision(row, revision) {
  if ((row?.revision || 0) !== revision) {
    throw new AppError(409, "CONFLICT", "This assessment has changed. Reload it before continuing.");
  }
}

async function write(db, planId, row, data) {
  if (!row) {
    await db.cropfort_farm_assessments.create({ data: { planId, ...data } });
  } else {
    const result = await db.cropfort_farm_assessments.updateMany({
      where: { planId, revision: row.revision },
      data: { ...data, revision: { increment: 1 } },
    });
    if (result.count !== 1) throw new AppError(409, "CONFLICT", "This assessment has changed. Reload it before continuing.");
  }
  return db.cropfort_farm_assessments.findUnique({ where: { planId }, select: metadata });
}

async function audit(db, user, plan, action, row) {
  await db.audit_log.create({ data: {
    id: uuid("aud"), programId: plan.programId, userId: user.id,
    entityType: "farm_assessment", entityId: plan.id, action: `farm_assessment.${action}`,
    newValue: { status: row.status, revision: row.revision, reportName: row.reportName },
  } });
}

exports.get = async (user, planId) => {
  const plan = await loadPlan(user, planId);
  const row = await prisma.cropfort_farm_assessments.findUnique({ where: { planId }, select: metadata });
  return serialize(row, user, plan);
};

exports.list = async (user) => {
  assertView(user);
  const programId = requireProgramId(user);
  const canStart = canCreateOrEditPlans(user);
  const plans = await prisma.cropfort_programme_plans.findMany({
    where: {
      programId,
      status: { notIn: ["archived", "closed"] },
      ...(canStart ? {} : { farmAssessment: { isNot: null } }),
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      code: true,
      planningCycleLabel: true,
      budgetYearLabel: true,
      farm_estates: { select: { name: true } },
      farmAssessment: { select: { status: true, reportName: true, updatedAt: true } },
    },
  });
  return plans.map((plan) => ({
    planId: plan.id,
    planName: plan.name || plan.code || "Untitled programme",
    farmName: plan.farm_estates?.name || "",
    cycleLabel: plan.planningCycleLabel || plan.budgetYearLabel || "",
    status: plan.farmAssessment?.status || "draft",
    exists: Boolean(plan.farmAssessment),
    reportName: plan.farmAssessment?.reportName || null,
    updatedAt: plan.farmAssessment?.updatedAt?.toISOString() || null,
  }));
};

exports.download = async (user, planId) => {
  await loadPlan(user, planId);
  const row = await prisma.cropfort_farm_assessments.findUnique({
    where: { planId }, select: { reportName: true, reportData: true },
  });
  if (!row?.reportData) throw new AppError(404, "NOT_FOUND", "No assessment report has been uploaded");
  return row;
};

exports.save = async (user, planId, body, file) => {
  assertEdit(user);
  if (file && (file.size > 5 * 1024 * 1024 || file.buffer.subarray(0, 5).toString() !== "%PDF-")) {
    throw new AppError(400, "INVALID_FILE", "Upload a valid PDF report (up to 5 MB).");
  }
  return prisma.$transaction(async (db) => {
    const plan = await loadPlan(user, planId, db);
    assertOpen(plan);
    const row = await db.cropfort_farm_assessments.findUnique({ where: { planId }, select: metadata });
    assertRevision(row, body.revision);
    if (!editable(row)) throw new AppError(409, "INVALID_STATE_TRANSITION", "Only drafts and assessments needing changes can be edited");
    const data = { findings: body.findings };
    if (file) {
      data.reportName = file.originalname.split(/[\\/]/).pop().replace(/[\x00-\x1f\x7f]/g, "").slice(-200) || "assessment.pdf";
      data.reportData = file.buffer;
      data.reportSize = file.size;
    }
    const updated = await write(db, planId, row, data);
    await audit(db, user, plan, "saved", updated);
    return serialize(updated, user, plan);
  });
};

exports.submit = async (user, planId, body) => {
  assertEdit(user);
  return prisma.$transaction(async (db) => {
    const plan = await loadPlan(user, planId, db);
    assertOpen(plan);
    const row = await db.cropfort_farm_assessments.findUnique({ where: { planId }, select: metadata });
    assertRevision(row, body.revision);
    if (!row || !editable(row)) throw new AppError(409, "INVALID_STATE_TRANSITION", "Save a draft assessment before submitting");
    if (!row.findings.trim() || !row.reportName) throw new AppError(400, "VALIDATION_ERROR", "Add findings and upload a report before submitting");
    const at = new Date();
    const updated = await write(db, planId, row, {
      status: "submitted", submittedByUserId: user.id, submittedAt: at, reviewedAt: null,
      history: [...row.history, { action: "submitted", actorName: user.name, at: at.toISOString(), comment: "", reportName: row.reportName }],
    });
    await audit(db, user, plan, "submitted", updated);
    await notifications.notifyFarmAssessment(plan, updated, "submitted", user.name, db);
    return serialize(updated, user, plan);
  });
};

exports.decide = async (user, planId, body) => {
  assertDecide(user);
  if (body.decision !== "approve" && body.decision !== "request_changes") throw new AppError(400, "VALIDATION_ERROR", "Invalid decision");
  const comment = String(body.comment || "").trim();
  if (body.decision === "request_changes" && !comment) throw new AppError(400, "VALIDATION_ERROR", "Explain the changes needed");
  return prisma.$transaction(async (db) => {
    const plan = await loadPlan(user, planId, db);
    assertOpen(plan);
    const row = await db.cropfort_farm_assessments.findUnique({ where: { planId }, select: metadata });
    assertRevision(row, body.revision);
    if (row?.status !== "submitted") throw new AppError(409, "INVALID_STATE_TRANSITION", "Only submitted assessments can be reviewed");
    if (row.submittedByUserId === user.id) throw new AppError(403, "FORBIDDEN", "You cannot review your own submission");
    const at = new Date();
    const status = body.decision === "approve" ? "approved" : "changes_requested";
    const updated = await write(db, planId, row, {
      status, reviewedAt: at,
      history: [...row.history, { action: status, actorName: user.name, at: at.toISOString(), comment }],
    });
    await audit(db, user, plan, status, updated);
    await notifications.notifyFarmAssessment(plan, updated, status, user.name, db);
    return serialize(updated, user, plan);
  });
};
