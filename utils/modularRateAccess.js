const AppError = require("../utils/AppError");
const { isSilvaRole, isSpxRole, isAssetOwnerApprover, canCreateOrEditPlans } = require("./roles");

function normalizeRole(role) {
  return String(role || "");
}

function canViewModularRates(role) {
  const r = normalizeRole(role);
  return (
    isSilvaRole(r) ||
    isSpxRole(r) ||
    r === "system_admin" ||
    r === "spx_validator" ||
    r === "spx_platform_admin" ||
    r === "farm_owner" ||
    r === "farm_owner_viewer"
  );
}

function canEditModularRates(role) {
  return canCreateOrEditPlans(role);
}

function canDecideModularRates(role) {
  return isAssetOwnerApprover(role);
}

function requireProgramId(user) {
  const programId = user.activeProgramId;
  if (!programId) {
    throw new AppError(400, "NO_ACTIVE_PROGRAM", "Select a workspace program first.");
  }
  return programId;
}

function assertView(user) {
  if (!canViewModularRates(user.role) && !(user.cropfortRoles || []).includes("farm_owner")) {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  }
}

function assertEdit(user) {
  if (!canCreateOrEditPlans(user)) {
    throw new AppError(403, "FORBIDDEN", "Only SPX can create or edit plans");
  }
}

function assertDecide(user) {
  if (!isAssetOwnerApprover(user)) {
    throw new AppError(403, "FORBIDDEN", "Only Silva / asset owners can approve");
  }
}

module.exports = {
  canViewModularRates,
  canEditModularRates,
  canDecideModularRates,
  requireProgramId,
  assertView,
  assertEdit,
  assertDecide,
};
