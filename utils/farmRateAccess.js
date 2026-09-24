const AppError = require("./AppError");
const prisma = require("../config/database");
const { assertView, assertEdit, requireProgramId } = require("./modularRateAccess");

async function loadFarmForUser(user, farmId) {
  assertView(user);
  const programId = requireProgramId(user);
  const farm = await prisma.farm_estates.findFirst({
    where: { id: farmId, programId },
  });
  if (!farm) throw new AppError(404, "NOT_FOUND", "Farm not found in active program");
  return farm;
}

function assertCanEditFarmRates(user) {
  assertEdit(user);
}

function assertIsFarmApprover(user, farm) {
  if (!farm.approverUserId || farm.approverUserId !== user.id) {
    throw new AppError(403, "FORBIDDEN", "Only the designated farm approver can approve this survey");
  }
}

function num(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

module.exports = {
  loadFarmForUser,
  assertCanEditFarmRates,
  assertIsFarmApprover,
  requireProgramId,
  assertView,
  num,
};
