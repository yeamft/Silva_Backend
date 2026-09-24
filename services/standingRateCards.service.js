const AppError = require("../utils/AppError");
const prisma = require("../config/database");
const { uuid } = require("../utils/ids");
const { loadFarmForUser, assertCanEditFarmRates, assertView, num } = require("../utils/farmRateAccess");

async function assertPlatformActivity(activityId, { tier } = {}) {
  const where = { id: String(activityId || "").trim() };
  if (tier != null) where.tier = tier;
  const activity = await prisma.activities.findFirst({ where });
  if (!activity) {
    throw new AppError(
      404,
      "NOT_FOUND",
      tier != null ? `Activity not found (tier ${tier} required)` : "Activity not found",
    );
  }
  return activity;
}

function serializeLabor(row) {
  const norm = num(row.normMandayPerUnit);
  const wage = num(row.wageRatePerManday);
  return {
    id: row.id,
    farmId: row.farmEstateId,
    farmEstateId: row.farmEstateId,
    programId: row.programId,
    activityId: row.activityId,
    activityCode: row.activity?.id || null,
    activityName: row.activity?.name || null,
    activityTier: row.activity?.tier ?? null,
    activityUnit: row.activity?.unitOfMeasure || null,
    normMandayPerUnit: norm,
    wageRatePerManday: wage,
    effectiveRate: norm != null && wage != null ? norm * wage : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeStanding(row) {
  return {
    id: row.id,
    farmId: row.farmEstateId,
    farmEstateId: row.farmEstateId,
    programId: row.programId,
    activityId: row.activityId,
    activityCode: row.activity?.id || null,
    activityName: row.activity?.name || null,
    activityTier: row.activity?.tier ?? null,
    activityUnit: row.activity?.unitOfMeasure || null,
    unit: row.unit,
    rate: num(row.rate),
    currency: row.currency || "ETB",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const activityInclude = {
  activity: { select: { id: true, name: true, tier: true, unitOfMeasure: true, category: true } },
};

exports.listLabor = async (user, farmId) => {
  const farm = await loadFarmForUser(user, farmId);
  const rows = await prisma.labor_rate_cards.findMany({
    where: { farmEstateId: farm.id },
    include: activityInclude,
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(serializeLabor);
};

exports.createLabor = async (user, farmId, input) => {
  assertCanEditFarmRates(user);
  const farm = await loadFarmForUser(user, farmId);
  const activityId = String(input.activityId || "").trim();
  await assertPlatformActivity(activityId, { tier: 1 });
  const norm = num(input.normMandayPerUnit);
  const wage = num(input.wageRatePerManday);
  if (norm == null || wage == null || norm < 0 || wage < 0) {
    throw new AppError(400, "VALIDATION_ERROR", "normMandayPerUnit and wageRatePerManday are required");
  }
  const created = await prisma.labor_rate_cards.create({
    data: {
      id: uuid("lrc"),
      programId: farm.programId,
      farmEstateId: farm.id,
      activityId,
      normMandayPerUnit: norm,
      wageRatePerManday: wage,
      status: "approved",
      createdByUserId: user.id,
      updatedAt: new Date(),
    },
    include: activityInclude,
  });
  return serializeLabor(created);
};

exports.updateLabor = async (user, farmId, id, input) => {
  assertCanEditFarmRates(user);
  const farm = await loadFarmForUser(user, farmId);
  const existing = await prisma.labor_rate_cards.findFirst({
    where: { id, farmEstateId: farm.id },
    include: activityInclude,
  });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Labor rate card not found");

  const updated = await prisma.labor_rate_cards.update({
    where: { id },
    data: {
      normMandayPerUnit:
        input.normMandayPerUnit !== undefined ? num(input.normMandayPerUnit) : undefined,
      wageRatePerManday:
        input.wageRatePerManday !== undefined ? num(input.wageRatePerManday) : undefined,
      updatedAt: new Date(),
    },
    include: activityInclude,
  });
  return serializeLabor(updated);
};

function makeStandingHandlers(modelName, idPrefix) {
  return {
    list: async (user, farmId) => {
      const farm = await loadFarmForUser(user, farmId);
      const rows = await prisma[modelName].findMany({
        where: { farmEstateId: farm.id },
        include: activityInclude,
        orderBy: { updatedAt: "desc" },
      });
      return rows.map(serializeStanding);
    },
    create: async (user, farmId, input) => {
      assertCanEditFarmRates(user);
      const farm = await loadFarmForUser(user, farmId);
      const activityId = String(input.activityId || "").trim();
      await assertPlatformActivity(activityId);
      const unit = String(input.unit || "").trim();
      const rate = num(input.rate);
      if (!unit || rate == null || rate < 0) {
        throw new AppError(400, "VALIDATION_ERROR", "unit and non-negative rate are required");
      }
      const created = await prisma[modelName].create({
        data: {
          id: uuid(idPrefix),
          programId: farm.programId,
          farmEstateId: farm.id,
          activityId,
          unit,
          rate,
          currency: input.currency || "ETB",
        },
        include: activityInclude,
      });
      return serializeStanding(created);
    },
    update: async (user, farmId, id, input) => {
      assertCanEditFarmRates(user);
      const farm = await loadFarmForUser(user, farmId);
      const existing = await prisma[modelName].findFirst({ where: { id, farmEstateId: farm.id } });
      if (!existing) throw new AppError(404, "NOT_FOUND", "Rate card not found");
      const updated = await prisma[modelName].update({
        where: { id },
        data: {
          unit: input.unit !== undefined ? String(input.unit).trim() : undefined,
          rate: input.rate !== undefined ? num(input.rate) : undefined,
          currency: input.currency !== undefined ? String(input.currency) : undefined,
        },
        include: activityInclude,
      });
      return serializeStanding(updated);
    },
  };
}

exports.material = makeStandingHandlers("material_rate_cards", "mrc");
exports.service = makeStandingHandlers("service_rate_cards", "src");

/** Farm-context list of platform activities (default tier 1 for labor/benchmark pickers). */
exports.listActivities = async (user, farmId, query = {}) => {
  await loadFarmForUser(user, farmId);
  assertView(user);
  const where = {};
  if (query.tier === "all" || query.all === "1" || query.all === "true") {
    // no tier filter
  } else if (query.tier != null && query.tier !== "") {
    where.tier = Number(query.tier);
  } else {
    where.tier = 1;
  }
  const rows = await prisma.activities.findMany({
    where,
    orderBy: [{ category: "asc" }, { id: "asc" }],
    select: { id: true, name: true, tier: true, category: true, unitOfMeasure: true },
  });
  return rows.map((r) => ({
    id: r.id,
    code: r.id,
    name: r.name,
    tier: r.tier,
    category: r.category,
    unitOfMeasure: r.unitOfMeasure,
  }));
};

exports.listFarms = async (user) => {
  assertView(user);
  const { requireProgramId } = require("../utils/farmRateAccess");
  const programId = requireProgramId(user);
  const rows = await prisma.farm_estates.findMany({
    where: { programId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      approverUserId: true,
      status: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    approverUserId: r.approverUserId,
    status: r.status,
    isApprover: r.approverUserId === user.id,
  }));
};
