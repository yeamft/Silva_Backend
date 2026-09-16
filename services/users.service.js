const bcrypt = require("bcryptjs");
const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const { uuid, rawToken } = require("../utils/ids");

const CROPFORT_ROLES = [
  "field_supervisor",
  "bagro_office",
  "spx_validator",
  "farm_owner",
  "spx_platform_admin",
];

const ORG_KIND_TO_TYPE = {
  spx: "spx",
  silva: "silva",
  bagro: "vendor",
};

const PRIMARY_BACKEND_ROLE = {
  field_supervisor: "vendor_field_lead",
  bagro_office: "vendor_manager",
  spx_validator: "spx_principal",
  farm_owner: "silva_owner",
  spx_platform_admin: "system_admin",
};

function assertManage(user) {
  if (user.role !== "system_admin") {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  }
}

function orgKindFromType(type) {
  if (type === "silva") return "silva";
  if (type === "spx") return "spx";
  return "bagro";
}

function mapLegacyToCropfort(role) {
  if (role === "system_admin") return "spx_platform_admin";
  if (String(role).startsWith("silva_")) return "farm_owner";
  if (String(role).startsWith("vendor_")) return "field_supervisor";
  return "spx_validator";
}

function pickPrimaryBackendRole(roles) {
  const order = [
    "spx_platform_admin",
    "spx_validator",
    "farm_owner",
    "bagro_office",
    "field_supervisor",
  ];
  for (const r of order) {
    if (roles.includes(r)) return PRIMARY_BACKEND_ROLE[r];
  }
  return "spx_principal";
}

function serializeStatus(user) {
  if (user.accountStatus === "suspended" || !user.active) return "suspended";
  if (user.accountStatus === "invited") return "invited";
  return "active";
}

async function recordAudit({ actorId, programId, entityId, action, before, after }) {
  await prisma.audit_log.create({
    data: {
      id: uuid("aud"),
      programId: programId || null,
      userId: actorId || null,
      entityType: "user",
      entityId,
      action,
      oldValue: before ?? undefined,
      newValue: after ?? undefined,
    },
  });
}

function serializeUser(user) {
  const roleRows = user.cropfort_user_roles || [];
  const roles = [...new Set(roleRows.map((r) => r.role))];
  if (roles.length === 0 && user.role) {
    roles.push(mapLegacyToCropfort(user.role));
  }

  const byProgram = new Map();
  for (const row of roleRows) {
    const program = row.programs;
    if (!program) continue;
    const existing = byProgram.get(program.id) || {
      tenantId: program.id,
      tenantName: program.name,
      roles: [],
      blockIds: [],
    };
    if (!existing.roles.includes(row.role)) existing.roles.push(row.role);
    for (const bid of row.assignedBlockIds || []) {
      if (!existing.blockIds.includes(bid)) existing.blockIds.push(bid);
    }
    byProgram.set(program.id, existing);
  }

  let tenants = [...byProgram.values()];
  if (tenants.length === 0 && user.activeProgram) {
    tenants = [
      {
        tenantId: user.activeProgram.id,
        tenantName: user.activeProgram.name,
        roles,
        blockIds: [],
      },
    ];
  }

  const sessions = user.refreshSessions || [];
  const lastActive = sessions
    .map((s) => s.lastActiveAt || s.createdAt)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0];

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    organization: orgKindFromType(user.organization?.type),
    roles,
    tenants,
    status: serializeStatus(user),
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: lastActive ? new Date(lastActive).toISOString() : null,
    neverLoggedIn: sessions.length === 0,
  };
}

const userInclude = {
  organization: true,
  activeProgram: true,
  cropfort_user_roles: { include: { programs: true } },
  refreshSessions: {
    where: { revoked: false },
    select: { lastActiveAt: true, createdAt: true },
    orderBy: { lastActiveAt: "desc" },
    take: 5,
  },
};

async function resolveOrganizationId(kind) {
  const type = ORG_KIND_TO_TYPE[kind];
  if (!type) throw new AppError(400, "VALIDATION_ERROR", "Invalid organization");
  const org = await prisma.organizations.findFirst({
    where: { type, active: true },
    orderBy: { createdAt: "asc" },
  });
  if (!org) throw new AppError(400, "ORG_MISSING", `No ${kind} organization found in the database`);
  return org.id;
}

function normalizeInput(input) {
  const name = String(input.name || "").trim();
  const email = String(input.email || "").trim().toLowerCase();
  const organization = input.organization;
  const status = input.status || "invited";
  const roles = Array.isArray(input.roles) ? [...new Set(input.roles)] : [];
  const tenants = Array.isArray(input.tenants) ? input.tenants : [];

  if (!name) throw new AppError(400, "VALIDATION_ERROR", "Name is required");
  if (!email) throw new AppError(400, "VALIDATION_ERROR", "Email is required");
  if (!["spx", "bagro", "silva"].includes(organization)) {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid organization");
  }
  if (!["invited", "active", "suspended"].includes(status)) {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid status");
  }
  if (roles.length === 0) throw new AppError(400, "VALIDATION_ERROR", "Select at least one role");
  for (const r of roles) {
    if (!CROPFORT_ROLES.includes(r)) {
      throw new AppError(400, "VALIDATION_ERROR", `Unsupported role: ${r}`);
    }
  }
  if (tenants.length === 0) {
    throw new AppError(400, "VALIDATION_ERROR", "Select at least one tenant / program");
  }
  return { name, email, organization, status, roles, tenants };
}

async function replaceCropfortRoles(userId, roles, tenants) {
  await prisma.cropfort_user_roles.deleteMany({ where: { userId } });
  const now = new Date();
  const rows = [];
  for (const tenant of tenants) {
    const programId = tenant.tenantId;
    const program = await prisma.programs.findUnique({ where: { id: programId } });
    if (!program) throw new AppError(400, "VALIDATION_ERROR", `Unknown program: ${programId}`);
    for (const role of roles) {
      rows.push({
        id: uuid("cur"),
        programId,
        userId,
        role,
        assignedBlockIds:
          role === "field_supervisor" && Array.isArray(tenant.blockIds) ? tenant.blockIds : [],
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  if (rows.length) {
    await prisma.cropfort_user_roles.createMany({ data: rows });
  }
}

async function listUsers(actor) {
  assertManage(actor);
  const rows = await prisma.users.findMany({
    include: userInclude,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(serializeUser);
}

async function getMeta(actor) {
  assertManage(actor);
  const [programs, blocks] = await Promise.all([
    prisma.programs.findMany({
      where: { status: "active" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.farm_blocks.findMany({
      where: { status: "active" },
      orderBy: { code: "asc" },
      select: { id: true, code: true, label: true, programId: true },
    }),
  ]);
  return {
    programs: programs.map((p) => ({ tenantId: p.id, tenantName: p.name })),
    blocks: blocks.map((b) => ({
      id: b.id,
      code: b.code,
      name: b.label || b.code,
      programId: b.programId,
    })),
  };
}

async function createUser(actor, input) {
  assertManage(actor);
  const data = normalizeInput(input);
  const existing = await prisma.users.findUnique({ where: { email: data.email } });
  if (existing) throw new AppError(409, "CONFLICT", "That email is already registered");

  const organizationId = await resolveOrganizationId(data.organization);
  const temporaryPassword = rawToken(9);
  const passwordHash = await bcrypt.hash(temporaryPassword, 10);
  const activeProgramId = data.tenants[0].tenantId;

  const created = await prisma.users.create({
    data: {
      id: uuid("usr"),
      name: data.name,
      email: data.email,
      passwordHash,
      role: pickPrimaryBackendRole(data.roles),
      organizationId,
      activeProgramId,
      active: data.status !== "suspended",
      accountStatus: data.status,
    },
  });

  await replaceCropfortRoles(created.id, data.roles, data.tenants);

  const full = await prisma.users.findUnique({ where: { id: created.id }, include: userInclude });
  const serialized = serializeUser(full);
  await recordAudit({
    actorId: actor.id,
    programId: activeProgramId,
    entityId: created.id,
    action: "user.create",
    before: null,
    after: serialized,
  });
  return { user: serialized, temporaryPassword };
}

async function updateUser(actor, id, input) {
  assertManage(actor);
  const data = normalizeInput(input);
  const existing = await prisma.users.findUnique({ where: { id }, include: userInclude });
  if (!existing) throw new AppError(404, "NOT_FOUND", "User not found");

  const emailClash = await prisma.users.findFirst({
    where: { email: data.email, id: { not: id } },
  });
  if (emailClash) throw new AppError(409, "CONFLICT", "That email is already registered");

  const organizationId = await resolveOrganizationId(data.organization);
  const activeProgramId = data.tenants[0].tenantId;
  const before = serializeUser(existing);

  await prisma.users.update({
    where: { id },
    data: {
      name: data.name,
      email: data.email,
      role: pickPrimaryBackendRole(data.roles),
      organizationId,
      activeProgramId,
      active: data.status !== "suspended",
      accountStatus: data.status,
    },
  });

  await replaceCropfortRoles(id, data.roles, data.tenants);
  const full = await prisma.users.findUnique({ where: { id }, include: userInclude });
  const serialized = serializeUser(full);
  await recordAudit({
    actorId: actor.id,
    programId: activeProgramId,
    entityId: id,
    action: "user.update",
    before,
    after: serialized,
  });
  return serialized;
}

async function suspendUser(actor, id) {
  assertManage(actor);
  const existing = await prisma.users.findUnique({ where: { id }, include: userInclude });
  if (!existing) throw new AppError(404, "NOT_FOUND", "User not found");
  if (existing.id === actor.id) throw new AppError(400, "VALIDATION_ERROR", "You cannot suspend your own account");

  await prisma.users.update({
    where: { id },
    data: { active: false, accountStatus: "suspended" },
  });
  await prisma.refresh_sessions.updateMany({
    where: { userId: id, revoked: false },
    data: { revoked: true },
  });

  const full = await prisma.users.findUnique({ where: { id }, include: userInclude });
  const serialized = serializeUser(full);
  await recordAudit({
    actorId: actor.id,
    entityId: id,
    action: "user.suspend",
    before: { status: serializeStatus(existing) },
    after: { status: "suspended", sessionsRevoked: true },
  });
  return serialized;
}

async function activateUser(actor, id) {
  assertManage(actor);
  const existing = await prisma.users.findUnique({ where: { id }, include: userInclude });
  if (!existing) throw new AppError(404, "NOT_FOUND", "User not found");

  await prisma.users.update({
    where: { id },
    data: { active: true, accountStatus: "active" },
  });
  const full = await prisma.users.findUnique({ where: { id }, include: userInclude });
  const serialized = serializeUser(full);
  await recordAudit({
    actorId: actor.id,
    entityId: id,
    action: "user.activate",
    before: { status: serializeStatus(existing) },
    after: { status: "active" },
  });
  return serialized;
}

async function revokeUserSessions(actor, id) {
  assertManage(actor);
  const existing = await prisma.users.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "User not found");
  await prisma.refresh_sessions.updateMany({
    where: { userId: id, revoked: false },
    data: { revoked: true },
  });
  await recordAudit({
    actorId: actor.id,
    entityId: id,
    action: "user.revoke_sessions",
    before: null,
    after: { sessionsRevoked: true },
  });
  return { ok: true };
}

async function deleteUser(actor, id) {
  assertManage(actor);
  const existing = await prisma.users.findUnique({
    where: { id },
    include: { refreshSessions: { take: 1 } },
  });
  if (!existing) throw new AppError(404, "NOT_FOUND", "User not found");
  if (existing.id === actor.id) throw new AppError(400, "VALIDATION_ERROR", "You cannot delete your own account");
  if (existing.refreshSessions.length > 0) {
    throw new AppError(409, "INVALID_STATE", "Only users who have never logged in can be deleted");
  }

  await prisma.cropfort_user_roles.deleteMany({ where: { userId: id } });
  await prisma.users.delete({ where: { id } });
  await recordAudit({
    actorId: actor.id,
    entityId: id,
    action: "user.delete",
    before: { email: existing.email, name: existing.name },
    after: null,
  });
  return { ok: true };
}

async function getUserAuditTrail(actor, id) {
  assertManage(actor);
  const existing = await prisma.users.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "User not found");

  const rows = await prisma.audit_log.findMany({
    where: { entityType: "user", entityId: id },
    include: { users: { select: { id: true, name: true } } },
    orderBy: { timestamp: "desc" },
    take: 100,
  });

  return rows.map((row) => ({
    id: row.id,
    at: row.timestamp.toISOString(),
    actorId: row.userId || "",
    actorName: row.users?.name || "System",
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    before: row.oldValue && typeof row.oldValue === "object" ? row.oldValue : null,
    after: row.newValue && typeof row.newValue === "object" ? row.newValue : null,
  }));
}

module.exports = {
  listUsers,
  getMeta,
  createUser,
  updateUser,
  suspendUser,
  activateUser,
  revokeUserSessions,
  deleteUser,
  getUserAuditTrail,
};
