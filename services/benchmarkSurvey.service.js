const AppError = require("../utils/AppError");
const prisma = require("../config/database");
const { uuid } = require("../utils/ids");
const {
  loadFarmForUser,
  assertCanEditFarmRates,
  assertIsFarmApprover,
  assertView,
  requireProgramId,
  num,
} = require("../utils/farmRateAccess");
const { canDecideModularRates } = require("../utils/modularRateAccess");
const notifications = require("./notifications.service");

const EDITABLE = new Set(["draft", "returned"]);
const SURVEY_STATUSES = new Set(["draft", "submitted", "approved", "returned"]);
function normalizeBenchmarkData(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AppError(400, "VALIDATION_ERROR", "benchmarkData is required");
  }
  const rawFarms = Array.isArray(input.farms)
    ? input.farms
    : Object.entries(input.farms || {}).map(([name, values]) => ({
        name,
        ...values,
        includeInIndustryAverage: ["Telli", "Gawi", "Chetu"].includes(name),
      }));
  const seenFarmNames = new Set();
  const farms = rawFarms.map((rawValues) => {
    const values = rawValues && typeof rawValues === "object" ? rawValues : {};
    const name = String(values?.name || "").trim();
    if (!name) {
      throw new AppError(400, "VALIDATION_ERROR", "Every source farm must have a name");
    }
    const normalizedName = name.toLocaleLowerCase();
    if (seenFarmNames.has(normalizedName)) {
      throw new AppError(400, "VALIDATION_ERROR", `Source farm ${name} is listed more than once`);
    }
    seenFarmNames.add(normalizedName);
    const entry = { name, includeInIndustryAverage: Boolean(values.includeInIndustryAverage) };
    for (const field of ["costPerUnit", "manDaysPerUnit", "frequency"]) {
      const raw = values[field];
      if (raw == null || raw === "") {
        entry[field] = null;
        continue;
      }
      const value = num(raw);
      if (value == null || value < 0) {
        throw new AppError(400, "VALIDATION_ERROR", `${name} ${field} must be a non-negative number`);
      }
      entry[field] = value;
    }
    return entry;
  });

  const average = (entries, field) => {
    const values = entries.map((entry) => entry[field]).filter((value) => value != null);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  };
  const summarize = (entries) => {
    const rated = entries.filter((entry) => entry.costPerUnit != null);
    const costPerUnit = average(rated, "costPerUnit");
    const manDaysPerUnit = average(rated, "manDaysPerUnit");
    return {
      farmsWithRate: rated.length,
      costPerUnit,
      manDaysPerUnit,
      wagePerManDay:
        costPerUnit != null && manDaysPerUnit != null && manDaysPerUnit > 0
          ? costPerUnit / manDaysPerUnit
          : null,
      frequency: average(rated, "frequency"),
    };
  };
  const industryAverage = summarize(farms.filter((farm) => farm.includeInIndustryAverage));
  const sixFarmAverage = summarize(farms);
  const recommendedSource = industryAverage.costPerUnit == null ? "six_farm_fallback" : "industry_average";
  const recommendedRate = industryAverage.costPerUnit ?? sixFarmAverage.costPerUnit;
  if (recommendedRate == null) {
    throw new AppError(400, "VALIDATION_ERROR", "Enter a cost per unit for at least one farm");
  }

  return {
    farms,
    industryAverage,
    sixFarmAverage,
    recommendedSource,
    dataNotes: String(input.dataNotes || "").trim(),
  };
}

function avgRecommended(n1, n2) {
  const a = num(n1);
  const b = num(n2);
  if (a == null || b == null) return null;
  return (a + b) / 2;
}

function kindFromTier(tier) {
  if (tier === 1) return "labor";
  if (tier === 2) return "materials";
  if (tier === 3) return "services";
  return null;
}

function serialize(row) {
  return {
    id: row.id,
    programId: row.programId,
    farmId: row.farmEstateId,
    farmEstateId: row.farmEstateId,
    farmAreaId: row.farmEstateId,
    farmEstateName: row.farm_estates?.name || null,
    activityId: row.activityId,
    activityCode: row.activity?.code || row.activity?.id || null,
    activityName: row.activity?.name || null,
    activityUnit: row.activity?.unitOfMeasure || null,
    activitySubgroup: row.activity?.subgroup || "",
    activityTier: row.activity?.tier ?? null,
    kind: kindFromTier(row.activity?.tier),
    neighbor1Name: row.neighbor1Name || null,
    neighbor2Name: row.neighbor2Name || null,
    neighbor1Rate: num(row.neighbor1Rate),
    neighbor2Rate: num(row.neighbor2Rate),
    benchmarkData: row.benchmarkData || null,
    lockedAt: row.lockedAt ? row.lockedAt.toISOString() : null,
    recommendedRate: num(row.recommendedRate),
    proposedRate: num(row.proposedRate),
    sourceEvidence: row.sourceEvidence || "",
    notes: row.notes || "",
    status: row.status,
    returnComment: row.returnedComment || null,
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    validUntil: row.validUntil ? row.validUntil.toISOString() : null,
    availableTo: row.validUntil ? row.validUntil.toISOString().slice(0, 10) : null,
    approverUserId: row.approverUserId || null,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const includeActivity = {
  activity: {
    select: {
      id: true,
      code: true,
      name: true,
      tier: true,
      unitOfMeasure: true,
      category: true,
      subgroup: true,
    },
  },
  farm_estates: { select: { id: true, name: true } },
};

async function getSurveyOrThrow(id) {
  const row = await prisma.benchmark_surveys.findUnique({
    where: { id },
    include: includeActivity,
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Benchmark survey not found");
  return row;
}

function assertNotApproved(row) {
  if (row.status === "approved") {
    throw new AppError(409, "IMMUTABLE", "Approved surveys cannot be changed. Create a new survey to correct.");
  }
}

function assertCanApproveSurvey(user, farm) {
  if (canDecideModularRates(user.role)) return;
  assertIsFarmApprover(user, farm);
}

exports.list = async (user, farmId, query = {}) => {
  const farm = await loadFarmForUser(user, farmId);
  const where = { farmEstateId: farm.id, programId: farm.programId };
  if (query.activityId) where.activityId = String(query.activityId);
  if (query.status && SURVEY_STATUSES.has(String(query.status))) where.status = String(query.status);
  if (query.kind === "labor") where.activity = { tier: 1 };
  if (query.kind === "materials") where.activity = { tier: 2 };
  if (query.kind === "services") where.activity = { tier: 3 };

  const rows = await prisma.benchmark_surveys.findMany({
    where,
    include: includeActivity,
    orderBy: [{ createdAt: "desc" }],
  });
  return rows.map(serialize);
};

/**
 * Single-query list for the user's active program (all farms).
 * Prefer this over N farm-scoped calls from the client.
 */
exports.listProgram = async (user, query = {}) => {
  assertView(user);
  const programId = requireProgramId(user);
  const programWide =
    query.programWide === "1" ||
    query.programWide === "true" ||
    query.programWide === true ||
    !query.farmEstateId;

  const where = { programId };
  if (!programWide && query.farmEstateId) {
    where.farmEstateId = String(query.farmEstateId);
  }
  if (query.activityId) where.activityId = String(query.activityId);
  if (query.status && SURVEY_STATUSES.has(String(query.status))) {
    where.status = String(query.status);
  }
  if (query.kind === "labor") where.activity = { tier: 1 };
  if (query.kind === "materials") where.activity = { tier: 2 };
  if (query.kind === "services") where.activity = { tier: 3 };

  const rows = await prisma.benchmark_surveys.findMany({
    where,
    include: includeActivity,
    orderBy: [{ createdAt: "desc" }],
  });
  return rows.map(serialize);
};

exports.get = async (user, id) => {
  assertView(user);
  const row = await getSurveyOrThrow(id);
  await loadFarmForUser(user, row.farmEstateId);
  return serialize(row);
};

exports.create = async (user, farmId, input) => {
  assertCanEditFarmRates(user);
  const farm = await loadFarmForUser(user, farmId);
  const activityId = String(input.activityId || "").trim();
  if (!activityId) throw new AppError(400, "VALIDATION_ERROR", "activityId is required");

  const activity = await prisma.activities.findFirst({ where: { id: activityId } });
  if (!activity) throw new AppError(404, "NOT_FOUND", "Activity not found");

  const benchmarkData = normalizeBenchmarkData(input.benchmarkData);
  const recommended = benchmarkData.industryAverage.costPerUnit ?? benchmarkData.sixFarmAverage.costPerUnit;
  const proposed =
    input.proposedRate != null && input.proposedRate !== ""
      ? num(input.proposedRate)
      : recommended;

  const created = await prisma.benchmark_surveys.create({
    data: {
      id: uuid("bs"),
      programId: farm.programId,
      farmEstateId: farm.id,
      activityId,
      neighbor1Name: null,
      neighbor2Name: null,
      neighbor1Rate: null,
      neighbor2Rate: null,
      benchmarkData,
      recommendedRate: recommended,
      proposedRate: proposed,
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

exports.update = async (user, id, input) => {
  assertCanEditFarmRates(user);
  const row = await getSurveyOrThrow(id);
  await loadFarmForUser(user, row.farmEstateId);
  assertNotApproved(row);
  if (!EDITABLE.has(row.status)) {
    throw new AppError(409, "INVALID_STATE", `Cannot edit survey in status “${row.status}”`);
  }

  const data = {};
  const locked = Boolean(row.lockedAt);
  const prevRecommended = num(row.recommendedRate);
  const prevProposed = num(row.proposedRate);

  if (!locked) {
    if (input.benchmarkData !== undefined) {
      const benchmarkData = normalizeBenchmarkData(input.benchmarkData);
      data.benchmarkData = benchmarkData;
      data.recommendedRate =
        benchmarkData.industryAverage.costPerUnit ?? benchmarkData.sixFarmAverage.costPerUnit;
      if (prevProposed == null || (prevRecommended != null && prevProposed === prevRecommended)) {
        data.proposedRate = data.recommendedRate;
      }
    }
    if (input.neighbor1Name !== undefined) data.neighbor1Name = String(input.neighbor1Name || "").trim();
    if (input.neighbor2Name !== undefined) data.neighbor2Name = String(input.neighbor2Name || "").trim();
    if (input.neighbor1Rate !== undefined) {
      const n = num(input.neighbor1Rate);
      if (n == null || n < 0) throw new AppError(400, "VALIDATION_ERROR", "Invalid neighbor1Rate");
      data.neighbor1Rate = n;
    }
    if (input.neighbor2Rate !== undefined) {
      const n = num(input.neighbor2Rate);
      if (n == null || n < 0) throw new AppError(400, "VALIDATION_ERROR", "Invalid neighbor2Rate");
      data.neighbor2Rate = n;
    }
  } else if (
    input.neighbor1Name !== undefined ||
    input.neighbor2Name !== undefined ||
    input.neighbor1Rate !== undefined ||
    input.neighbor2Rate !== undefined
  ) {
    throw new AppError(409, "LOCKED", "Neighbor rates are locked and cannot be changed");
  }

  const nextN1 = data.neighbor1Rate !== undefined ? data.neighbor1Rate : num(row.neighbor1Rate);
  const nextN2 = data.neighbor2Rate !== undefined ? data.neighbor2Rate : num(row.neighbor2Rate);
  if (!locked && (data.neighbor1Rate !== undefined || data.neighbor2Rate !== undefined)) {
    const recommended = avgRecommended(nextN1, nextN2);
    data.recommendedRate = recommended;
    if (prevProposed == null || (prevRecommended != null && prevProposed === prevRecommended)) {
      data.proposedRate = recommended;
    }
  }

  if (input.proposedRate !== undefined) {
    const p = num(input.proposedRate);
    if (p == null || p < 0) throw new AppError(400, "VALIDATION_ERROR", "Invalid proposedRate");
    data.proposedRate = p;
  }
  if (input.sourceEvidence !== undefined) {
    data.sourceEvidence = String(input.sourceEvidence || "").trim() || null;
  }
  if (input.notes !== undefined) data.notes = String(input.notes || "").trim() || null;
  if (input.validUntil !== undefined) {
    data.validUntil = input.validUntil ? new Date(input.validUntil) : null;
  }
  if (row.status === "returned") {
    data.status = "draft";
    data.returnedComment = null;
  }

  data.updatedAt = new Date();
  const updated = await prisma.benchmark_surveys.update({
    where: { id },
    data,
    include: includeActivity,
  });
  return serialize(updated);
};

exports.lock = async (user, id) => {
  assertCanEditFarmRates(user);
  const row = await getSurveyOrThrow(id);
  await loadFarmForUser(user, row.farmEstateId);
  assertNotApproved(row);
  if (row.lockedAt) return serialize(row);

  const updated = await prisma.benchmark_surveys.update({
    where: { id },
    data: { lockedAt: new Date(), updatedAt: new Date() },
    include: includeActivity,
  });
  return serialize(updated);
};

exports.submit = async (user, id) => {
  assertCanEditFarmRates(user);
  const row = await getSurveyOrThrow(id);
  await loadFarmForUser(user, row.farmEstateId);
  if (row.status !== "draft" && row.status !== "returned") {
    throw new AppError(409, "INVALID_STATE", "Only draft or returned surveys can be submitted");
  }
  if (!row.lockedAt) {
    throw new AppError(409, "NOT_LOCKED", "Lock benchmark data before submitting");
  }
  const updated = await prisma.benchmark_surveys.update({
    where: { id },
    data: { status: "submitted", submittedAt: new Date(), updatedAt: new Date() },
    include: includeActivity,
  });
  try {
    await notifications.notifyBenchmarkSurveySubmitted(row.programId, serialize(updated));
  } catch (err) {
    console.error("[benchmark-survey] notify submit failed:", err?.message || err);
  }
  return serialize(updated);
};

exports.approve = async (user, id) => {
  const row = await getSurveyOrThrow(id);
  const farm = await loadFarmForUser(user, row.farmEstateId);
  assertCanApproveSurvey(user, farm);
  if (row.status !== "submitted") {
    throw new AppError(409, "INVALID_STATE", "Only submitted surveys can be approved");
  }
  const approvedAt = new Date();
  const validUntil = new Date(approvedAt);
  validUntil.setFullYear(validUntil.getFullYear() + 1);

  const updated = await prisma.benchmark_surveys.update({
    where: { id },
    data: {
      status: "approved",
      approvedAt,
      validUntil,
      approverUserId: user.id,
      updatedAt: new Date(),
    },
    include: includeActivity,
  });
  return serialize(updated);
};

exports.reject = async (user, id, comment) => {
  if (!String(comment || "").trim()) {
    throw new AppError(400, "VALIDATION_ERROR", "A reject comment is required");
  }
  const row = await getSurveyOrThrow(id);
  const farm = await loadFarmForUser(user, row.farmEstateId);
  assertCanApproveSurvey(user, farm);
  if (row.status !== "submitted") {
    throw new AppError(409, "INVALID_STATE", "Only submitted surveys can be rejected");
  }
  const updated = await prisma.benchmark_surveys.update({
    where: { id },
    data: {
      status: "returned",
      returnedComment: String(comment).trim(),
      updatedAt: new Date(),
    },
    include: includeActivity,
  });
  return serialize(updated);
};
