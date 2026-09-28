const AppError = require("../utils/AppError");
const prisma = require("../config/database");
const { isSilvaRole, isSpxRole } = require("../utils/roles");

function requireProgramId(user) {
  if (!user.activeProgramId) {
    throw new AppError(400, "NO_ACTIVE_PROGRAM", "Select a workspace program first.");
  }
  return user.activeProgramId;
}

function assertRead(user) {
  if (
    isSpxRole(user.role) ||
    isSilvaRole(user.role) ||
    ["system_admin", "spx_platform_admin", "spx_validator", "farm_owner", "field_supervisor", "bagro_office"].includes(
      user.role,
    )
  ) {
    return;
  }
  throw new AppError(403, "FORBIDDEN", "Insufficient permissions to view audit log");
}

function serialize(row) {
  return {
    id: row.id,
    programId: row.programId,
    at: row.timestamp.toISOString(),
    actorUserId: row.userId,
    actorName: row.users?.name || null,
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    oldValue: row.oldValue ?? null,
    newValue: row.newValue ?? null,
    detail:
      typeof row.newValue === "object" && row.newValue && "message" in row.newValue
        ? String(row.newValue.message)
        : row.action,
  };
}

exports.listAuditLog = async (user, { entityType, entityId, limit = 100 } = {}) => {
  assertRead(user);
  const programId = requireProgramId(user);
  const take = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const where = { programId };
  if (entityType) where.entityType = String(entityType);
  if (entityId) where.entityId = String(entityId);
  const rows = await prisma.audit_log.findMany({
    where,
    include: { users: { select: { id: true, name: true } } },
    orderBy: { timestamp: "desc" },
    take,
  });
  return rows.map(serialize);
};
