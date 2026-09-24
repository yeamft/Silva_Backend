const AppError = require("../utils/AppError");
const prisma = require("../config/database");
const { uuid } = require("../utils/ids");
const {
  loadFarmForUser,
  assertCanEditFarmRates,
  assertView,
  requireProgramId,
  num,
} = require("../utils/farmRateAccess");
const { assertDecide } = require("../utils/modularRateAccess");
const notifications = require("./notifications.service");

const VARIANCE_FLAG_PCT = 10;
const KINDS = new Set(["labor", "materials", "services"]);

function kindFromTier(tier) {
  if (tier === 1) return "labor";
  if (tier === 2) return "materials";
  if (tier === 3) return "services";
  return null;
}

function varianceFields(proposed, recommended) {
  if (recommended == null || !recommended || !Number.isFinite(proposed)) {
    return { variancePct: null, flagged: false };
  }
  const variancePct = Math.round(((proposed - recommended) / recommended) * 1000) / 10;
  return { variancePct, flagged: Math.abs(variancePct) > VARIANCE_FLAG_PCT };
}

function dateOnly(v) {
  if (v == null || v === "") return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function serialize(row) {
  const proposed = num(row.proposedRate);
  const recommended = num(row.recommendedRate);
  const { variancePct, flagged } = varianceFields(proposed, recommended);
  return {
    id: row.id,
    programId: row.programId,
    farmAreaId: row.farmEstateId,
    farmEstateId: row.farmEstateId,
    farmEstateName: row.farm_estates?.name || null,
    budgetYear: row.budgetYear,
    blockId: row.blockId || null,
    activityId: row.activityId,
    activityCode: row.activity?.id || null,
    activityName: row.activity?.name || null,
    activityUnit: row.activity?.unitOfMeasure || null,
    activityTier: row.activity?.tier ?? null,
    kind: row.kind,
    sourceSurveyId: row.sourceSurveyId || null,
    recommendedRate: recommended,
    proposedRate: proposed,
    variancePct,
    flagged,
    norm: num(row.norm),
    fallbackRate: num(row.fallbackRate),
    sourceBasis: row.sourceBasis || "",
    availableFrom: row.availableFrom ? dateOnly(row.availableFrom) : null,
    availableTo: row.availableTo ? dateOnly(row.availableTo) : null,
    justificationNote: row.justificationNote || "",
    sourceEvidence: row.sourceEvidence || "",
    notes: row.notes || "",
    status: row.archivedAt ? "archived" : row.status,
    returnComment: row.returnedComment || null,
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    approvedByUserId: row.approvedByUserId || null,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const includeActivity = {
  activity: { select: { id: true, name: true, tier: true, unitOfMeasure: true, category: true } },
  farm_estates: { select: { id: true, name: true } },
};

async function getOrThrow(id) {
  const row = await prisma.rate_card_proposals.findUnique({
    where: { id },
    include: includeActivity,
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Rate card not found");
  return row;
}

function assertEditable(row) {
  if (row.archivedAt) throw new AppError(409, "ARCHIVED", "Archived rate cards cannot be edited");
  if (row.status !== "draft" && row.status !== "returned") {
    throw new AppError(409, "INVALID_STATE", `Cannot edit rate card in status “${row.status}”`);
  }
}

async function promoteToStanding(row, userId) {
  const farmEstateId = row.farmEstateId;
  const programId = row.programId;
  const activityId = row.activityId;
  const proposed = num(row.proposedRate);
  const norm = num(row.norm);

  if (row.kind === "labor") {
    const existing = await prisma.labor_rate_cards.findFirst({
      where: { farmEstateId, activityId },
      orderBy: { version: "desc" },
    });
    const wage =
      norm != null && norm > 0 && proposed != null ? Math.round((proposed / norm) * 100) / 100 : null;
    await prisma.labor_rate_cards.create({
      data: {
        id: uuid("lrc"),
        programId,
        farmEstateId,
        activityId,
        normMandayPerUnit: norm,
        wageRatePerManday: wage,
        status: "approved",
        version: (existing?.version ?? 0) + 1,
        supersedesId: existing?.id ?? null,
        createdByUserId: userId,
        updatedAt: new Date(),
      },
    });
    return;
  }

  if (row.kind === "materials") {
    const unit = row.activity?.unitOfMeasure || "unit";
    const existing = await prisma.material_rate_cards.findFirst({
      where: { farmEstateId, activityId },
      orderBy: { updatedAt: "desc" },
    });
    if (existing) {
      await prisma.material_rate_cards.update({
        where: { id: existing.id },
        data: { rate: proposed, unit, updatedAt: new Date() },
      });
    } else {
      await prisma.material_rate_cards.create({
        data: {
          id: uuid("mrc"),
          programId,
          farmEstateId,
          activityId,
          unit,
          rate: proposed,
          currency: "ETB",
          updatedAt: new Date(),
        },
      });
    }
    return;
  }

  if (row.kind === "services") {
    const unit = row.activity?.unitOfMeasure || "unit";
    const existing = await prisma.service_rate_cards.findFirst({
      where: { farmEstateId, activityId },
      orderBy: { updatedAt: "desc" },
    });
    if (existing) {
      await prisma.service_rate_cards.update({
        where: { id: existing.id },
        data: { rate: proposed, unit, updatedAt: new Date() },
      });
    } else {
      await prisma.service_rate_cards.create({
        data: {
          id: uuid("src"),
          programId,
          farmEstateId,
          activityId,
          unit,
          rate: proposed,
          currency: "ETB",
          updatedAt: new Date(),
        },
      });
    }
  }
}

exports.list = async (user, farmId, query = {}) => {
  const farm = await loadFarmForUser(user, farmId);
  const where = { farmEstateId: farm.id, programId: farm.programId };
  if (query.budgetYear) where.budgetYear = Number(query.budgetYear);
  if (query.kind && KINDS.has(String(query.kind))) where.kind = String(query.kind);
  if (query.status === "archived") {
    where.archivedAt = { not: null };
  } else if (query.status && query.status !== "all") {
    where.status = String(query.status);
    where.archivedAt = null;
  } else if (!query.status || query.status === "all") {
    where.archivedAt = null;
  }

  const rows = await prisma.rate_card_proposals.findMany({
    where,
    include: includeActivity,
    orderBy: [{ updatedAt: "desc" }],
  });
  return rows.map(serialize);
};

/**
 * Single-query list for the user's active program (all farms).
 * Prefer this over N farm-scoped calls from the client.
 * Query: status, kind, farmEstateId?, budgetYear?, programWide=1 (ignore farm/year).
 */
exports.listProgram = async (user, query = {}) => {
  assertView(user);
  const programId = requireProgramId(user);
  const programWide =
    query.programWide === "1" ||
    query.programWide === "true" ||
    query.programWide === true ||
    query.status === "submitted" ||
    query.status === "approved" ||
    query.status === "returned";

  const where = { programId };
  if (!programWide && query.farmEstateId) {
    where.farmEstateId = String(query.farmEstateId);
  }
  if (!programWide && query.budgetYear) {
    where.budgetYear = Number(query.budgetYear);
  }
  if (query.kind && KINDS.has(String(query.kind))) where.kind = String(query.kind);
  if (query.status === "archived") {
    where.archivedAt = { not: null };
  } else if (query.status && query.status !== "all") {
    where.status = String(query.status);
    where.archivedAt = null;
  } else {
    where.archivedAt = null;
  }

  const rows = await prisma.rate_card_proposals.findMany({
    where,
    include: includeActivity,
    orderBy: [{ updatedAt: "desc" }],
  });
  return rows.map(serialize);
};

exports.get = async (user, id) => {
  assertView(user);
  const row = await getOrThrow(id);
  await loadFarmForUser(user, row.farmEstateId);
  return serialize(row);
};

exports.createFromSurvey = async (user, farmId, input) => {
  assertCanEditFarmRates(user);
  const farm = await loadFarmForUser(user, farmId);
  const sourceSurveyId = String(input.sourceSurveyId || "").trim();
  if (!sourceSurveyId) throw new AppError(400, "VALIDATION_ERROR", "sourceSurveyId is required");

  const survey = await prisma.benchmark_surveys.findFirst({
    where: { id: sourceSurveyId, farmEstateId: farm.id },
    include: includeActivity,
  });
  if (!survey) throw new AppError(404, "NOT_FOUND", "Benchmark survey not found");
  if (!survey.lockedAt) {
    throw new AppError(409, "NOT_LOCKED", "Lock the benchmark before creating a rate card");
  }

  const existing = await prisma.rate_card_proposals.findFirst({
    where: {
      sourceSurveyId,
      archivedAt: null,
      status: { in: ["draft", "submitted", "approved"] },
    },
  });
  if (existing) {
    throw new AppError(409, "ALREADY_EXISTS", `Rate card ${existing.id} already references this benchmark`);
  }

  const kind = kindFromTier(survey.activity?.tier) || "labor";
  const recommended = num(survey.recommendedRate);
  const proposed =
    input.proposedRate != null && input.proposedRate !== ""
      ? num(input.proposedRate)
      : num(survey.proposedRate) ?? recommended;
  if (proposed == null || proposed < 0) {
    throw new AppError(400, "VALIDATION_ERROR", "Proposed rate must be a non-negative number");
  }

  const budgetYear = Number(input.budgetYear) || new Date().getFullYear();
  const day = new Date();
  day.setHours(0, 0, 0, 0);

  const created = await prisma.rate_card_proposals.create({
    data: {
      id: uuid("rc"),
      programId: farm.programId,
      farmEstateId: farm.id,
      budgetYear,
      blockId: input.blockId || null,
      activityId: survey.activityId,
      kind,
      sourceSurveyId: survey.id,
      recommendedRate: recommended,
      proposedRate: proposed,
      norm: input.norm != null ? num(input.norm) : null,
      fallbackRate:
        input.fallbackRate != null ? num(input.fallbackRate) : Math.round(proposed * 0.95 * 100) / 100,
      sourceBasis: String(input.sourceBasis || `Benchmark ${survey.id}`).trim(),
      availableFrom: input.availableFrom ? new Date(input.availableFrom) : day,
      availableTo: input.availableTo ? new Date(input.availableTo) : survey.validUntil,
      justificationNote: String(input.justificationNote || "").trim() || null,
      sourceEvidence: String(input.sourceEvidence || "").trim() || null,
      notes: String(input.notes || "").trim() || null,
      status: "draft",
      createdByUserId: user.id,
      updatedAt: new Date(),
    },
    include: includeActivity,
  });
  return serialize(created);
};

/** Import drafts without a linked survey (labor/material/service CSV). */
exports.createImport = async (user, farmId, input) => {
  assertCanEditFarmRates(user);
  const farm = await loadFarmForUser(user, farmId);
  const activityId = String(input.activityId || "").trim();
  const activity = await prisma.activities.findFirst({ where: { id: activityId } });
  if (!activity) throw new AppError(404, "NOT_FOUND", "Activity not found");

  const kind = String(input.kind || kindFromTier(activity.tier) || "").trim();
  if (!KINDS.has(kind)) throw new AppError(400, "VALIDATION_ERROR", "kind must be labor|materials|services");
  if (kind === "labor" && activity.tier !== 1) {
    throw new AppError(400, "VALIDATION_ERROR", "Labor rate cards require a tier 1 activity");
  }
  if (kind === "materials" && activity.tier !== 2) {
    throw new AppError(400, "VALIDATION_ERROR", "Materials rate cards require a tier 2 activity");
  }
  if (kind === "services" && activity.tier !== 3) {
    throw new AppError(400, "VALIDATION_ERROR", "Services rate cards require a tier 3 activity");
  }

  const proposed = num(input.proposedRate);
  if (proposed == null || proposed < 0) {
    throw new AppError(400, "VALIDATION_ERROR", "Proposed rate must be a non-negative number");
  }
  const budgetYear = Number(input.budgetYear) || new Date().getFullYear();
  const day = new Date();
  day.setHours(0, 0, 0, 0);

  const created = await prisma.rate_card_proposals.create({
    data: {
      id: uuid("rc"),
      programId: farm.programId,
      farmEstateId: farm.id,
      budgetYear,
      activityId,
      kind,
      sourceSurveyId: null,
      recommendedRate: null,
      proposedRate: proposed,
      norm: input.norm != null ? num(input.norm) : null,
      fallbackRate:
        input.fallbackRate != null ? num(input.fallbackRate) : Math.round(proposed * 0.95 * 100) / 100,
      sourceBasis: String(input.sourceBasis || "Rate card import").trim(),
      availableFrom: input.availableFrom ? new Date(input.availableFrom) : day,
      availableTo: input.availableTo ? new Date(input.availableTo) : null,
      sourceEvidence: String(input.sourceEvidence || input.sourceBasis || "").trim() || null,
      notes: String(input.notes || "").trim() || null,
      status: "draft",
      createdByUserId: user.id,
      updatedAt: new Date(),
    },
    include: includeActivity,
  });
  return serialize(created);
};

exports.update = async (user, id, input) => {
  assertCanEditFarmRates(user);
  const row = await getOrThrow(id);
  await loadFarmForUser(user, row.farmEstateId);
  assertEditable(row);

  const data = { updatedAt: new Date() };
  if (input.proposedRate !== undefined) {
    const p = num(input.proposedRate);
    if (p == null || p < 0) throw new AppError(400, "VALIDATION_ERROR", "Invalid proposedRate");
    data.proposedRate = p;
  }
  if (input.availableFrom !== undefined) {
    data.availableFrom = input.availableFrom ? new Date(input.availableFrom) : null;
  }
  if (input.availableTo !== undefined) {
    data.availableTo = input.availableTo ? new Date(input.availableTo) : null;
  }
  if (input.fallbackRate !== undefined) {
    data.fallbackRate = input.fallbackRate === "" || input.fallbackRate == null ? null : num(input.fallbackRate);
  }
  if (input.norm !== undefined) {
    data.norm = input.norm === "" || input.norm == null ? null : num(input.norm);
  }
  if (input.sourceBasis !== undefined) data.sourceBasis = String(input.sourceBasis || "").trim();
  if (input.justificationNote !== undefined) {
    data.justificationNote = String(input.justificationNote || "").trim() || null;
  }
  if (input.sourceEvidence !== undefined) {
    data.sourceEvidence = String(input.sourceEvidence || "").trim() || null;
  }
  if (input.notes !== undefined) data.notes = String(input.notes || "").trim() || null;
  if (input.blockId !== undefined) data.blockId = input.blockId || null;
  if (row.status === "returned") {
    data.status = "draft";
    data.returnedComment = null;
  }

  const updated = await prisma.rate_card_proposals.update({
    where: { id },
    data,
    include: includeActivity,
  });
  return serialize(updated);
};

exports.submit = async (user, id) => {
  assertCanEditFarmRates(user);
  const row = await getOrThrow(id);
  await loadFarmForUser(user, row.farmEstateId);
  if (row.archivedAt) throw new AppError(409, "ARCHIVED", "Archived rate cards cannot be submitted");
  if (row.status !== "draft" && row.status !== "returned") {
    throw new AppError(409, "INVALID_STATE", "Only draft or returned rate cards can be submitted");
  }
  if (!row.availableFrom) {
    throw new AppError(400, "VALIDATION_ERROR", "Effective from date is required before submit");
  }
  const { flagged } = varianceFields(num(row.proposedRate), num(row.recommendedRate));
  if (flagged && !String(row.justificationNote || "").trim()) {
    throw new AppError(400, "JUSTIFICATION_REQUIRED", "Justification is required when variance is flagged (±10%)");
  }

  const updated = await prisma.rate_card_proposals.update({
    where: { id },
    data: { status: "submitted", submittedAt: new Date(), updatedAt: new Date() },
    include: includeActivity,
  });

  try {
    await notifications.notifyRateCardProposalSubmitted(row.programId, updated);
  } catch (err) {
    console.error("[rate-card-proposal] notify submit failed:", err?.message || err);
  }

  return serialize(updated);
};

exports.approve = async (user, id) => {
  assertDecide(user);
  const row = await getOrThrow(id);
  await loadFarmForUser(user, row.farmEstateId);
  if (row.archivedAt) throw new AppError(409, "ARCHIVED", "Archived rate cards cannot be approved");
  if (row.status !== "submitted") {
    throw new AppError(409, "INVALID_STATE", "Only submitted rate cards can be approved");
  }

  const updated = await prisma.rate_card_proposals.update({
    where: { id },
    data: {
      status: "approved",
      approvedAt: new Date(),
      approvedByUserId: user.id,
      updatedAt: new Date(),
    },
    include: includeActivity,
  });

  await promoteToStanding(updated, user.id);

  try {
    await notifications.notifyRateCardProposalDecision(row.programId, updated, "approved", user.name);
  } catch (err) {
    console.error("[rate-card-proposal] notify approve failed:", err?.message || err);
  }

  return serialize(updated);
};

exports.reject = async (user, id, comment) => {
  assertDecide(user);
  if (!String(comment || "").trim()) {
    throw new AppError(400, "VALIDATION_ERROR", "A reject comment is required");
  }
  const row = await getOrThrow(id);
  await loadFarmForUser(user, row.farmEstateId);
  if (row.status !== "submitted") {
    throw new AppError(409, "INVALID_STATE", "Only submitted rate cards can be rejected");
  }

  const updated = await prisma.rate_card_proposals.update({
    where: { id },
    data: {
      status: "returned",
      returnedComment: String(comment).trim(),
      updatedAt: new Date(),
    },
    include: includeActivity,
  });

  try {
    await notifications.notifyRateCardProposalDecision(row.programId, updated, "returned", user.name);
  } catch (err) {
    console.error("[rate-card-proposal] notify reject failed:", err?.message || err);
  }

  return serialize(updated);
};

exports.archive = async (user, id) => {
  assertDecide(user);
  const row = await getOrThrow(id);
  await loadFarmForUser(user, row.farmEstateId);
  if (row.archivedAt) return serialize(row);
  if (row.status !== "approved") {
    throw new AppError(409, "INVALID_STATE", "Only approved rate cards can be archived");
  }
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  const updated = await prisma.rate_card_proposals.update({
    where: { id },
    data: {
      archivedAt: new Date(),
      availableTo: row.availableTo && row.availableTo < day ? row.availableTo : day,
      updatedAt: new Date(),
    },
    include: includeActivity,
  });
  return serialize(updated);
};

exports.restore = async (user, id) => {
  assertCanEditFarmRates(user);
  const row = await getOrThrow(id);
  await loadFarmForUser(user, row.farmEstateId);
  if (!row.archivedAt) {
    throw new AppError(409, "INVALID_STATE", "Only archived rate cards can be restored");
  }
  const updated = await prisma.rate_card_proposals.update({
    where: { id },
    data: {
      archivedAt: null,
      status: "approved",
      availableTo: null,
      updatedAt: new Date(),
    },
    include: includeActivity,
  });
  await promoteToStanding(updated, user.id);
  return serialize(updated);
};

exports.listLockedSurveys = async (user, farmId, query = {}) => {
  const farm = await loadFarmForUser(user, farmId);
  const used = await prisma.rate_card_proposals.findMany({
    where: {
      farmEstateId: farm.id,
      sourceSurveyId: { not: null },
      archivedAt: null,
      status: { in: ["draft", "submitted", "approved"] },
    },
    select: { sourceSurveyId: true },
  });
  const usedIds = new Set(used.map((u) => u.sourceSurveyId).filter(Boolean));

  const where = {
    farmEstateId: farm.id,
    lockedAt: { not: null },
  };
  if (query.kind === "labor") where.activity = { tier: 1 };
  if (query.kind === "materials") where.activity = { tier: 2 };
  if (query.kind === "services") where.activity = { tier: 3 };

  const rows = await prisma.benchmark_surveys.findMany({
    where,
    include: includeActivity,
    orderBy: { updatedAt: "desc" },
  });
  return rows
    .filter((s) => !usedIds.has(s.id))
    .map((s) => ({
      id: s.id,
      farmEstateId: s.farmEstateId,
      activityId: s.activityId,
      activityName: s.activity?.name || null,
      kind: kindFromTier(s.activity?.tier),
      recommendedRate: num(s.recommendedRate),
      proposedRate: num(s.proposedRate),
      lockedAt: s.lockedAt ? s.lockedAt.toISOString() : null,
      neighbor1Name: s.neighbor1Name,
      neighbor2Name: s.neighbor2Name,
      neighbor1Rate: num(s.neighbor1Rate),
      neighbor2Rate: num(s.neighbor2Rate),
    }));
};