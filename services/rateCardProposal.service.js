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

/**
 * Rate scenarios, as in the annual plan template: the industry average from the benchmark,
 * that average +25% and +50%, and an expert input. The chosen one is the Chaka Buna plan rate.
 */
const PLAN_BASES = ["industry_average", "plus_25", "plus_50", "expert_input"];
const DEFAULT_BANDS = { band1Pct: 25, band2Pct: 50 };

// Band 1 / Band 2 come from the programme's settings (shared with the Annual Budget plan)
const bandCache = new Map();
const BAND_TTL_MS = 30_000;

async function loadBands(programId) {
  if (!programId) return DEFAULT_BANDS;
  const hit = bandCache.get(programId);
  if (hit && Date.now() - hit.at < BAND_TTL_MS) return hit.bands;
  const program = await prisma.programs.findUnique({
    where: { id: programId },
    select: { cropfortScenarioBand1Pct: true, cropfortScenarioBand2Pct: true },
  });
  const bands = {
    band1Pct: num(program?.cropfortScenarioBand1Pct) ?? DEFAULT_BANDS.band1Pct,
    band2Pct: num(program?.cropfortScenarioBand2Pct) ?? DEFAULT_BANDS.band2Pct,
  };
  bandCache.set(programId, { bands, at: Date.now() });
  return bands;
}

function cachedBands(programId) {
  return bandCache.get(programId)?.bands ?? DEFAULT_BANDS;
}

exports.clearBandCache = (programId) => bandCache.delete(programId);

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Bands raise the wage per man-day with man-days unchanged, so cost per unit rises by the same %. */
function scenarioRates(industryRate, expertRate, bands = DEFAULT_BANDS) {
  const industry = industryRate != null && industryRate > 0 ? industryRate : null;
  return {
    industry_average: industry,
    plus_25: industry != null ? round2(industry * (1 + bands.band1Pct / 100)) : null,
    plus_50: industry != null ? round2(industry * (1 + bands.band2Pct / 100)) : null,
    expert_input: expertRate != null ? expertRate : null,
  };
}

/** The plan rate for a basis; without an industry rate only the expert input can be used. */
function resolvePlanRate(basis, industryRate, expertRate, bands = DEFAULT_BANDS) {
  const scenarios = scenarioRates(industryRate, expertRate, bands);
  const chosen = PLAN_BASES.includes(basis) && scenarios[basis] != null ? basis : "expert_input";
  return { planBasis: chosen, rate: scenarios[chosen] };
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
    activityCode: row.activity?.code || null,
    activityName: row.activity?.name || null,
    activityUnit: row.activity?.unitOfMeasure || null,
    activityTier: row.activity?.tier ?? null,
    kind: row.kind,
    sourceSurveyId: row.sourceSurveyId || null,
    recommendedRate: recommended,
    proposedRate: proposed,
    planBasis: row.planBasis || "expert_input",
    expertRate: num(row.expertRate),
    scenarios: scenarioRates(recommended, num(row.expertRate), cachedBands(row.programId)),
    scenarioBands: cachedBands(row.programId),
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
  activity: { select: { id: true, code: true, name: true, tier: true, unitOfMeasure: true, category: true } },
  farm_estates: { select: { id: true, name: true } },
};

async function getOrThrow(id) {
  const row = await prisma.rate_card_proposals.findUnique({
    where: { id },
    include: includeActivity,
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Rate card not found");
  await loadBands(row.programId);
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
  await Promise.all([...new Set(rows.map((r) => r.programId))].map(loadBands));
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
  await Promise.all([...new Set(rows.map((r) => r.programId))].map(loadBands));
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

  const kind = KINDS.has(String(input.kind)) ? String(input.kind) : kindFromTier(survey.activity?.tier) || "labor";
  const recommended = num(survey.recommendedRate);
  const expertRate =
    input.expertRate != null && input.expertRate !== ""
      ? num(input.expertRate)
      : input.proposedRate != null && input.proposedRate !== ""
        ? num(input.proposedRate)
        : num(survey.proposedRate) ?? recommended;
  if (expertRate == null || expertRate < 0) {
    throw new AppError(400, "VALIDATION_ERROR", "Expert rate must be a non-negative number");
  }
  // Default to the industry average when the benchmark has one
  const { planBasis, rate: proposed } = resolvePlanRate(
    input.planBasis || (recommended ? "industry_average" : "expert_input"),
    recommended,
    expertRate,
    await loadBands(farm.programId),
  );

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
      planBasis,
      expertRate,
      norm: input.norm != null ? num(input.norm) : null,
      fallbackRate:
        input.fallbackRate != null
          ? num(input.fallbackRate)
          : survey.benchmarkData?.recommendedSource === "six_farm_fallback"
            ? num(survey.benchmarkData?.sixFarmAverage?.costPerUnit)
            : Math.round(proposed * 0.95 * 100) / 100,
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
  await loadBands(farm.programId);
  const activityId = String(input.activityId || "").trim();
  const activity = await prisma.activities.findFirst({ where: { id: activityId } });
  if (!activity) throw new AppError(404, "NOT_FOUND", "Activity not found");

  // One activity can be priced with labour, materials and services — each gets its own card
  const kind = String(input.kind || kindFromTier(activity.tier) || "").trim();
  if (!KINDS.has(kind)) throw new AppError(400, "VALIDATION_ERROR", "kind must be labor|materials|services");

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
      planBasis: "expert_input",
      expertRate: proposed,
      norm: input.norm != null ? num(input.norm) : null,
      fallbackRate:
        input.fallbackRate != null ? num(input.fallbackRate) : Math.round(proposed * 0.95 * 100) / 100,
      sourceBasis: String(input.sourceBasis || "Rate card import").trim(),
      availableFrom: input.availableFrom ? new Date(input.availableFrom) : day,
      availableTo: input.availableTo ? new Date(input.availableTo) : null,
      sourceEvidence: String(input.sourceEvidence || input.sourceBasis || "").trim() || null,
      justificationNote: String(input.justificationNote || "").trim() || null,
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
  let expertRate = num(row.expertRate);
  let basis = row.planBasis || "expert_input";
  let rateTouched = false;
  if (input.expertRate !== undefined) {
    const e = num(input.expertRate);
    if (e == null || e < 0) throw new AppError(400, "VALIDATION_ERROR", "Invalid expert rate");
    expertRate = e;
    rateTouched = true;
  }
  if (input.planBasis !== undefined) {
    if (!PLAN_BASES.includes(input.planBasis)) {
      throw new AppError(400, "VALIDATION_ERROR", "planBasis must be industry_average, plus_25, plus_50 or expert_input");
    }
    basis = input.planBasis;
    rateTouched = true;
  }
  if (input.proposedRate !== undefined && !rateTouched) {
    // Older screens send the rate directly; treat it as the expert input
    const p = num(input.proposedRate);
    if (p == null || p < 0) throw new AppError(400, "VALIDATION_ERROR", "Invalid proposedRate");
    expertRate = p;
    basis = "expert_input";
    rateTouched = true;
  }
  if (rateTouched) {
    const resolved = resolvePlanRate(basis, num(row.recommendedRate), expertRate, await loadBands(row.programId));
    if (resolved.rate == null) throw new AppError(400, "VALIDATION_ERROR", "Enter an expert rate");
    data.expertRate = expertRate;
    data.planBasis = resolved.planBasis;
    data.proposedRate = resolved.rate;
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

/**
 * Rate cards have no approval step: finishing a draft publishes it straight away, so plans can
 * use the rate. (The asset owner approves the plans that use these rates instead.)
 */
async function publish(user, row) {
  if (!row.availableFrom) {
    throw new AppError(400, "VALIDATION_ERROR", "Effective from date is required before publishing");
  }
  const now = new Date();
  const updated = await prisma.rate_card_proposals.update({
    where: { id: row.id },
    data: {
      status: "approved",
      submittedAt: row.submittedAt || now,
      approvedAt: now,
      approvedByUserId: user.id,
      returnedComment: null,
      updatedAt: now,
    },
    include: includeActivity,
  });
  await promoteToStanding(updated, user.id);
  return serialize(updated);
}

exports.submit = async (user, id) => {
  assertCanEditFarmRates(user);
  const row = await getOrThrow(id);
  await loadFarmForUser(user, row.farmEstateId);
  if (row.archivedAt) throw new AppError(409, "ARCHIVED", "Archived rate cards cannot be published");
  if (row.status !== "draft" && row.status !== "returned") {
    throw new AppError(409, "INVALID_STATE", "Only draft rate cards can be published");
  }
  return publish(user, row);
};

/** Publishes a card left in "submitted" from before approvals were removed. */
exports.approve = async (user, id) => {
  assertCanEditFarmRates(user);
  const row = await getOrThrow(id);
  await loadFarmForUser(user, row.farmEstateId);
  if (row.archivedAt) throw new AppError(409, "ARCHIVED", "Archived rate cards cannot be published");
  if (row.status !== "submitted") {
    throw new AppError(409, "INVALID_STATE", "Only submitted rate cards can be published this way");
  }
  return publish(user, row);
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

/** SPX (who publishes rate cards) or the asset owner can retire one. */
function assertCanArchive(user) {
  try {
    assertCanEditFarmRates(user);
  } catch {
    assertDecide(user);
  }
}

exports.archive = async (user, id) => {
  assertCanArchive(user);
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