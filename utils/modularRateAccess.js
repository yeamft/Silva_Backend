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

/** Assessment-specific edit gate: SPX roles + field roles (field_supervisor, bagro_office). */
function canEditAssessment(userOrRole) {
  if (userOrRole == null) return false;
  const role = typeof userOrRole === "string" ? userOrRole : userOrRole.role;
  if (canCreateOrEditPlans(userOrRole)) return true;
  const cf = typeof userOrRole === "object" ? (userOrRole.cropfortRoles || []) : [];
  return (
    role === "field_supervisor" ||
    role === "bagro_office" ||
    cf.includes("field_supervisor") ||
    cf.includes("bagro_office")
  );
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
  const role = String(user.role || "");
  const cf = user.cropfortRoles || [];
  if (
    canViewModularRates(role) ||
    cf.includes("farm_owner") ||
    cf.includes("farm_owner_viewer") ||
    role === "field_supervisor" ||
    role === "bagro_office" ||
    cf.includes("field_supervisor") ||
    cf.includes("bagro_office")
  ) {
    return;
  }
  throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
}

function assertEdit(user) {
  if (!canCreateOrEditPlans(user)) {
    throw new AppError(403, "FORBIDDEN", "Only SPX can create or edit plans");
  }
}

function assertEditAssessment(user) {
  if (!canEditAssessment(user)) {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions to create or edit assessments");
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
  canEditAssessment,
  canDecideModularRates,
  requireProgramId,
  assertView,
  assertEdit,
  assertEditAssessment,
  assertDecide,
};
