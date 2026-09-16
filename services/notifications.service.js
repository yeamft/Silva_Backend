const AppError = require("../utils/AppError");
const prisma = require("../config/database");
const { uuid } = require("../utils/ids");
const { isSilvaRole, permissionsFor } = require("../utils/roles");

function assertRead(user) {
  const perms = permissionsFor(user.role) || [];
  const role = String(user.role || "");
  if (
    !perms.includes("notifications.read") &&
    !isSilvaRole(role) &&
    !role.startsWith("spx_") &&
    role !== "system_admin"
  ) {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  }
}

function serialize(row) {
  return {
    id: row.id,
    programId: row.programId || null,
    triggerType: row.triggerType,
    entityType: row.entityType,
    entityId: row.entityId,
    message: row.message,
    acknowledged: Boolean(row.acknowledged),
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    href: hrefFor(row),
  };
}

function hrefFor(row) {
  if (row.entityType === "rate_card_line" || row.entityType === "rate_card_batch") {
    return "/cropfort/rate-card";
  }
  return null;
}

async function listForUser(user) {
  assertRead(user);
  const programId = user.activeProgramId || null;
  const rows = await prisma.notifications.findMany({
    where: {
      OR: [
        { recipientUserId: user.id },
        {
          recipientUserId: null,
          recipientRole: user.role,
          ...(programId ? { programId } : {}),
        },
      ],
    },
    orderBy: { sentAt: "desc" },
    take: 50,
  });
  return rows.map(serialize);
}

async function acknowledge(user, id) {
  assertRead(user);
  const existing = await prisma.notifications.findFirst({
    where: {
      id,
      OR: [{ recipientUserId: user.id }, { recipientUserId: null, recipientRole: user.role }],
    },
  });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Notification not found");
  const updated = await prisma.notifications.update({
    where: { id },
    data: { acknowledged: true },
  });
  return serialize(updated);
}

async function acknowledgeAll(user) {
  assertRead(user);
  await prisma.notifications.updateMany({
    where: {
      acknowledged: false,
      OR: [
        { recipientUserId: user.id },
        { recipientUserId: null, recipientRole: user.role, programId: user.activeProgramId || undefined },
      ],
    },
    data: { acknowledged: true },
  });
  return { ok: true };
}

async function findAssetOwnerRecipients(programId) {
  const silvaRoles = ["silva_owner", "silva_country_manager", "silva_finance"];
  const cropfortOwnerRoles = ["farm_owner", "farm_owner_viewer"];

  const [byActiveProgram, byCropfortRole, estateOwnerOrgs, assetOwners] = await Promise.all([
    prisma.users.findMany({
      where: {
        active: true,
        accountStatus: { not: "suspended" },
        activeProgramId: programId,
        role: { in: silvaRoles },
      },
      select: { id: true, role: true, email: true },
    }),
    prisma.cropfort_user_roles.findMany({
      where: { programId, role: { in: cropfortOwnerRoles } },
      select: {
        userId: true,
        users: { select: { id: true, role: true, active: true, accountStatus: true, email: true } },
      },
    }),
    prisma.farm_estates.findMany({
      where: { programId, status: "active", ownerOrganizationId: { not: null } },
      select: { ownerOrganizationId: true },
    }),
    prisma.asset_owners.findMany({
      where: {
        contactEmail: { not: null },
        farm_estate_asset_owners: { some: { farm_estates: { programId } } },
      },
      select: { contactEmail: true },
    }),
  ]);

  const ownerOrgIds = [
    ...new Set(estateOwnerOrgs.map((e) => e.ownerOrganizationId).filter(Boolean)),
  ];
  const ownerEmails = [
    ...new Set(
      assetOwners
        .map((a) => String(a.contactEmail || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  ];

  const [byOwnerOrg, byAssetEmail] = await Promise.all([
    ownerOrgIds.length
      ? prisma.users.findMany({
          where: {
            active: true,
            accountStatus: { not: "suspended" },
            organizationId: { in: ownerOrgIds },
            OR: [
              { role: { in: silvaRoles } },
              { cropfort_user_roles: { some: { programId, role: { in: cropfortOwnerRoles } } } },
            ],
          },
          select: { id: true, role: true },
        })
      : Promise.resolve([]),
    ownerEmails.length
      ? prisma.users.findMany({
          where: {
            active: true,
            accountStatus: { not: "suspended" },
            email: { in: ownerEmails },
          },
          select: { id: true, role: true },
        })
      : Promise.resolve([]),
  ]);

  const map = new Map();
  for (const u of byActiveProgram) map.set(u.id, u.role);
  for (const row of byCropfortRole) {
    if (row.users?.active && row.users.accountStatus !== "suspended") {
      map.set(row.users.id, row.users.role || "silva_owner");
    }
  }
  for (const u of byOwnerOrg) map.set(u.id, u.role || "silva_owner");
  for (const u of byAssetEmail) map.set(u.id, u.role || "silva_owner");

  return [...map.entries()].map(([id, role]) => ({ id, role }));
}

async function notifyUsers({ programId, triggerType, entityType, entityId, message, recipients }) {
  if (!recipients?.length) return [];
  const data = recipients.map((r) => ({
    id: uuid("ntf"),
    programId: programId || null,
    triggerType,
    entityType,
    entityId,
    recipientRole: r.role || "user",
    recipientUserId: r.id,
    message,
    sentAt: new Date(),
    acknowledged: false,
  }));
  await prisma.notifications.createMany({ data });
  return data.map((d) => d.id);
}

async function notifyRateCardSubmitted(programId, count, batchKey) {
  const recipients = await findAssetOwnerRecipients(programId);
  const message =
    count === 1
      ? "1 rate card line is awaiting your approval"
      : `${count} rate card lines are awaiting your approval`;

  const userIds = await notifyUsers({
    programId,
    triggerType: "rate_card.submitted",
    entityType: "rate_card_batch",
    entityId: batchKey,
    message,
    recipients,
  });

  // If no named asset-owner users were found, fall back to role broadcasts.
  if (recipients.length > 0) return userIds;

  const roleRows = ["silva_owner", "silva_country_manager"].map((role) => ({
    id: uuid("ntf"),
    programId: programId || null,
    triggerType: "rate_card.submitted",
    entityType: "rate_card_batch",
    entityId: batchKey,
    recipientRole: role,
    recipientUserId: null,
    message,
    sentAt: new Date(),
    acknowledged: false,
  }));
  await prisma.notifications.createMany({ data: roleRows });
  return roleRows.map((r) => r.id);
}

async function notifyRateCardDecision(programId, line, decision, actorName) {
  const creatorId = line.createdByUserId;
  if (!creatorId) return [];
  const creator = await prisma.users.findFirst({
    where: { id: creatorId, active: true },
    select: { id: true, role: true },
  });
  if (!creator) return [];
  const code = line.resourceCode || "rate";
  const message =
    decision === "approved"
      ? `${actorName || "Farm owner"} approved rate ${code}`
      : `${actorName || "Farm owner"} returned rate ${code} for revision`;
  return notifyUsers({
    programId,
    triggerType: decision === "approved" ? "rate_card.approved" : "rate_card.returned",
    entityType: "rate_card_line",
    entityId: line.id,
    message,
    recipients: [creator],
  });
}

module.exports = {
  listForUser,
  acknowledge,
  acknowledgeAll,
  notifyRateCardSubmitted,
  notifyRateCardDecision,
};
