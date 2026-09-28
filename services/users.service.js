const bcrypt = require("bcryptjs");
const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const { uuid, rawToken, hashToken } = require("../utils/ids");
const mail = require("./mail.service");
const { resolveAppBaseUrl } = require("../utils/appBaseUrl");

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

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

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

async function ensureOrgProgramMemberships(organizationId, tenants) {
  for (const tenant of tenants) {
    const programId = tenant.tenantId;
    const existing = await prisma.program_memberships.findUnique({
      where: { programId_organizationId: { programId, organizationId } },
    });
    if (!existing) {
      await prisma.program_memberships.create({
        data: {
          id: uuid("pm"),
          programId,
          organizationId,
          roleInProgram: "manager",
        },
      });
    }
  }
}

async function sendUserInviteEmail({ actor, user, organizationId, roles, appBaseUrl }) {
  const org = await prisma.organizations.findUnique({ where: { id: organizationId } });
  const token = rawToken(24);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  await prisma.invites.create({
    data: {
      id: uuid("inv"),
      organizationId,
      email: user.email,
      role: pickPrimaryBackendRole(roles),
      status: "pending",
      tokenHash: hashToken(token),
      invitedByUserId: actor.id,
      expiresAt,
    },
  });

  const inviteUrl = mail.buildAbsoluteUrl(`/invite?token=${encodeURIComponent(token)}`, appBaseUrl);
  const mailResult = await mail.sendOrganizationInviteEmail({
    to: user.email,
    inviteeEmail: user.email,
    orgName: org?.name || "Cropfort",
    role: pickPrimaryBackendRole(roles),
    invitedByName: actor.name,
    inviteUrl,
    appBaseUrl,
  });

  return {
    inviteUrl,
    inviteSent: Boolean(mailResult?.sent),
    expiresAt: expiresAt.toISOString(),
  };
}

async function listUsers(actor) {
  assertManage(actor);
  const rows = await prisma.users.findMany({
    include: userInclude,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(serializeUser);
}

/**
 * Active programme user directory for assignee pickers (field tickets, etc.).
 * Any authenticated user with an active programme can read — not admin-only.
 */
async function listDirectory(actor) {
  const programId = actor.activeProgramId;
  if (!programId) {
    throw new AppError(400, "NO_ACTIVE_PROGRAM", "Select an active programme first");
  }

  const memberships = await prisma.program_memberships.findMany({
    where: { programId },
    select: { organizationId: true },
  });
  const orgIds = [...new Set(memberships.map((m) => m.organizationId).filter(Boolean))];

  const rows = await prisma.users.findMany({
    where: {
      active: true,
      accountStatus: "active",
      OR: [
        { activeProgramId: programId },
        ...(orgIds.length ? [{ organizationId: { in: orgIds } }] : []),
      ],
    },
    include: userInclude,
    orderBy: { name: "asc" },
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

async function createUser(actor, input, options = {}) {
  assertManage(actor);
  const data = normalizeInput(input);
  const existing = await prisma.users.findUnique({ where: { email: data.email } });
  if (existing) throw new AppError(409, "CONFLICT", "That email is already registered");

  const organizationId = await resolveOrganizationId(data.organization);
  const isInvite = data.status === "invited";
  const temporaryPassword = isInvite ? null : rawToken(9);
  const passwordHash = await bcrypt.hash(temporaryPassword || rawToken(24), 10);
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
      // Invited users must accept the email link before they can sign in.
      active: data.status === "active",
      accountStatus: data.status,
    },
  });

  await ensureOrgProgramMemberships(organizationId, data.tenants);
  await replaceCropfortRoles(created.id, data.roles, data.tenants);

  const full = await prisma.users.findUnique({ where: { id: created.id }, include: userInclude });
  const serialized = serializeUser(full);

  let invite = null;
  if (isInvite) {
    const appBaseUrl = resolveAppBaseUrl(options.req);
    invite = await sendUserInviteEmail({
      actor,
      user: created,
      organizationId,
      roles: data.roles,
      appBaseUrl,
    });
  }

  await recordAudit({
    actorId: actor.id,
    programId: activeProgramId,
    entityId: created.id,
    action: isInvite ? "user.invite" : "user.create",
    before: null,
    after: { ...serialized, inviteSent: invite?.inviteSent ?? false },
  });

  return {
    user: serialized,
    temporaryPassword: temporaryPassword || undefined,
    inviteSent: invite?.inviteSent ?? false,
    inviteUrl: invite?.inviteUrl,
    inviteExpiresAt: invite?.expiresAt,
  };
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
      active: data.status === "active",
      accountStatus: data.status,
    },
  });

  await ensureOrgProgramMemberships(organizationId, data.tenants);
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

async function getInvitePreview(token) {
  if (!token) throw new AppError(400, "VALIDATION_ERROR", "Invite token is required");
  const invite = await prisma.invites.findFirst({
    where: { tokenHash: hashToken(token) },
    include: {
      organizations: { select: { id: true, name: true } },
      users: { select: { id: true, name: true } },
    },
  });
  if (!invite) throw new AppError(404, "NOT_FOUND", "Invitation not found");
  if (invite.status === "accepted") {
    throw new AppError(409, "ALREADY_ACCEPTED", "This invitation has already been accepted");
  }
  if (invite.status === "revoked") {
    throw new AppError(410, "REVOKED", "This invitation was revoked");
  }
  if (invite.expiresAt.getTime() < Date.now() || invite.status === "expired") {
    if (invite.status === "pending") {
      await prisma.invites.update({ where: { id: invite.id }, data: { status: "expired" } });
    }
    throw new AppError(410, "EXPIRED", "This invitation has expired");
  }

  const user = await prisma.users.findUnique({
    where: { email: invite.email.toLowerCase() },
    select: { id: true, name: true, email: true, accountStatus: true },
  });

  return {
    email: invite.email,
    name: user?.name || "",
    orgName: invite.organizations?.name || "Cropfort",
    role: invite.role,
    invitedByName: invite.users?.name || null,
    expiresAt: invite.expiresAt.toISOString(),
  };
}

async function acceptInvite({ token, name, password }) {
  if (!token) throw new AppError(400, "VALIDATION_ERROR", "Invite token is required");
  if (!password || String(password).length < 8) {
    throw new AppError(400, "VALIDATION_ERROR", "Password must be at least 8 characters");
  }

  const invite = await prisma.invites.findFirst({
    where: { tokenHash: hashToken(token) },
    include: { organizations: true },
  });
  if (!invite) throw new AppError(404, "NOT_FOUND", "Invitation not found");
  if (invite.status === "accepted") {
    throw new AppError(409, "ALREADY_ACCEPTED", "This invitation has already been accepted");
  }
  if (invite.status === "revoked") {
    throw new AppError(410, "REVOKED", "This invitation was revoked");
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    await prisma.invites.update({ where: { id: invite.id }, data: { status: "expired" } });
    throw new AppError(410, "EXPIRED", "This invitation has expired");
  }

  const user = await prisma.users.findUnique({ where: { email: invite.email.toLowerCase() } });
  if (!user) throw new AppError(404, "NOT_FOUND", "Invited user account was not found");

  const nextName = String(name || user.name || "").trim();
  if (!nextName) throw new AppError(400, "VALIDATION_ERROR", "Name is required");

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.$transaction([
    prisma.users.update({
      where: { id: user.id },
      data: {
        name: nextName,
        passwordHash,
        active: true,
        accountStatus: "active",
      },
    }),
    prisma.invites.update({
      where: { id: invite.id },
      data: { status: "accepted" },
    }),
  ]);

  return {
    ok: true,
    email: user.email,
    name: nextName,
  };
}

module.exports = {
  listUsers,
  listDirectory,
  getMeta,
  createUser,
  updateUser,
  suspendUser,
  activateUser,
  revokeUserSessions,
  deleteUser,
  getUserAuditTrail,
  getInvitePreview,
  acceptInvite,
};
