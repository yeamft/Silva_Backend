const AppError = require("../utils/AppError");
const prisma = require("../config/database");
const { permissionsFor, isSpxRole } = require("../utils/roles");

function requireProgramId(user) {
  if (!user.activeProgramId) {
    throw new AppError(400, "NO_ACTIVE_PROGRAM", "Select a workspace program first.");
  }
  return user.activeProgramId;
}

function assertRead(user) {
  if (
    isSpxRole(user.role) ||
    ["system_admin", "spx_platform_admin", "farm_owner", "field_supervisor", "vendor", "vendor_ops"].includes(
      user.role,
    )
  ) {
    return;
  }
  const perms = permissionsFor(user.role) || [];
  if (perms.includes("work_orders.read")) return;
  throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
}

function assertWrite(user) {
  if (
    isSpxRole(user.role) ||
    ["system_admin", "spx_platform_admin", "spx_principal", "farm_owner"].includes(user.role)
  ) {
    return;
  }
  throw new AppError(403, "FORBIDDEN", "Only SPX / farm owners can update agreement config");
}

const EMPTY = {
  schedule5: null,
  schedule7: null,
  processCalendar: null,
  reservedMatters: null,
  establishment: null,
  sixMonthReviews: [],
  directInstructionValueEtb: 50000,
};

function readConfig(program) {
  const branding =
    program.brandingJson && typeof program.brandingJson === "object" ? program.brandingJson : {};
  const raw = branding.agreementConfig;
  if (!raw || typeof raw !== "object") return { ...EMPTY };
  return { ...EMPTY, ...raw };
}

exports.getAgreementConfig = async (user) => {
  assertRead(user);
  const programId = requireProgramId(user);
  const program = await prisma.programs.findUnique({ where: { id: programId } });
  if (!program) throw new AppError(404, "NOT_FOUND", "Programme not found");
  return { ...readConfig(program), programId };
};

exports.putAgreementConfig = async (user, body) => {
  assertWrite(user);
  const programId = requireProgramId(user);
  const program = await prisma.programs.findUnique({ where: { id: programId } });
  if (!program) throw new AppError(404, "NOT_FOUND", "Programme not found");

  const next = {
    schedule5: body.schedule5 ?? null,
    schedule7: body.schedule7 ?? null,
    processCalendar: body.processCalendar ?? null,
    reservedMatters: body.reservedMatters ?? null,
    establishment: body.establishment ?? null,
    sixMonthReviews: Array.isArray(body.sixMonthReviews) ? body.sixMonthReviews : [],
    directInstructionValueEtb:
      body.directInstructionValueEtb != null
        ? Math.max(0, Math.round(Number(body.directInstructionValueEtb) || 0))
        : 50000,
  };

  const branding =
    program.brandingJson && typeof program.brandingJson === "object"
      ? { ...program.brandingJson }
      : {};
  branding.agreementConfig = next;

  await prisma.programs.update({
    where: { id: programId },
    data: { brandingJson: branding },
  });
  return { ...next, programId };
};
