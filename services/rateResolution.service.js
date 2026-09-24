const AppError = require("../utils/AppError");
const prisma = require("../config/database");
const { loadFarmForUser, num } = require("../utils/farmRateAccess");

/**
 * Resolve labor rate for a farm activity:
 * 1) latest approved benchmark survey → proposedRate
 * 2) else labor_rate_cards norm × wage
 * 3) else NO_RATE_RESOLVABLE
 */
exports.resolveLaborRate = async (user, farmId, activityId) => {
  const farm = await loadFarmForUser(user, farmId);
  const aid = String(activityId || "").trim();
  if (!aid) throw new AppError(400, "VALIDATION_ERROR", "activityId is required");

  const survey = await prisma.benchmark_surveys.findFirst({
    where: {
      farmEstateId: farm.id,
      activityId: aid,
      status: "approved",
    },
    orderBy: { approvedAt: "desc" },
  });

  if (survey && num(survey.proposedRate) != null) {
    return {
      rate: num(survey.proposedRate),
      source: "benchmark",
      surveyId: survey.id,
      validUntil: survey.validUntil ? survey.validUntil.toISOString() : null,
    };
  }

  const labor = await prisma.labor_rate_cards.findFirst({
    where: { farmEstateId: farm.id, activityId: aid },
    orderBy: { updatedAt: "desc" },
  });

  const norm = num(labor?.normMandayPerUnit);
  const wage = num(labor?.wageRatePerManday);
  if (labor && norm != null && wage != null) {
    return {
      rate: norm * wage,
      source: "norm_wage",
      laborRateCardId: labor.id,
      normMandayPerUnit: norm,
      wageRatePerManday: wage,
    };
  }

  throw new AppError(
    404,
    "NO_RATE_RESOLVABLE",
    "No approved benchmark survey or labor rate card for this farm activity",
  );
};
