const AppError = require("../utils/AppError");
const { isSilvaRole, isSpxRole } = require("../utils/roles");

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
  const r = normalizeRole(role);
  return (
    isSpxRole(r) ||
    r === "system_admin" ||
    r === "spx_validator" ||
    r === "spx_platform_admin"
  );
}

function canDecideModularRates(role) {
  const r = normalizeRole(role);
  return isSilvaRole(r) || r === "farm_owner" || r === "system_admin" || r === "spx_platform_admin";
}

function requireProgramId(user) {
  const programId = user.activeProgramId;
  if (!programId) {
    throw new AppError(400, "NO_ACTIVE_PROGRAM", "Select a workspace program first.");
  }
  return programId;
}

function assertView(user) {
  if (!canViewModularRates(user.role)) throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
}

function assertEdit(user) {
  if (!canEditModularRates(user.role)) throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
}

function assertDecide(user) {
  if (!canDecideModularRates(user.role)) throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
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
