const AppError = require("../utils/AppError");
const prisma = require("../config/database");
const { uuid } = require("../utils/ids");
const { isSilvaRole, permissionsFor } = require("../utils/roles");

const SPX_VALIDATOR_ROLES = [
  "spx_principal",
  "spx_account_handler",
  "spx_field_supervisor",
  "spx_validator",
  "spx_platform_admin",
];

const APPROVER_ROLES = ["silva_owner", "silva_country_manager", "farm_owner", "farm_owner_viewer"];

const SPX_PAYMENT_ROLES = [
  "spx_principal",
  "spx_account_handler",
  "spx_validator",
  "spx_platform_admin",
];

function assertRead(user) {
  const perms = permissionsFor(user.role) || [];
  const role = String(user.role || "");
  const cf = user.cropfortRoles || [];
  if (
    perms.includes("notifications.read") ||
    isSilvaRole(role) ||
    role.startsWith("spx_") ||
    role.startsWith("vendor_") ||
    role === "system_admin" ||
    role === "farm_owner" ||
    role === "field_supervisor" ||
    role === "bagro_office" ||
    cf.length > 0
  ) {
    return;
  }
  throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
}

function recipientRolesFor(user) {
  return [...new Set([user.role, ...(user.cropfortRoles || [])].filter(Boolean))];
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
  if (row.entityType === "rate_card_proposal") {
    return `/cropfort/rate-cards/proposals/${row.entityId}`;
  }
  if (
    row.entityType === "rate_card_line" ||
    row.entityType === "rate_card_batch" ||
    row.entityType === "rate_card"
  ) {
    return "/cropfort/rate-cards/proposals";
  }
  if (row.entityType === "benchmark_survey") {
    return `/cropfort/rate-cards/benchmark-surveys/${row.entityId}`;
  }
  if (row.entityType === "work_order") {
    return "/cropfort/work-orders";
  }
  if (row.entityType === "field_ticket") {
    return "/cropfort/validation-queue";
  }
  if (row.entityType === "payment_request") {
    return "/cropfort/payment-requests";
  }
  if (row.entityType === "settlement") {
    return "/cropfort/settlements";
  }
  if (row.entityType === "afe") {
    return "/cropfort/afe";
  }
  if (row.entityType === "programme_plan") {
    return `/cropfort/planning/programmes/${row.entityId}`;
  }
  return null;
}

function scopedRecipientWhere(user) {
  const programId = user.activeProgramId || null;
  const roles = recipientRolesFor(user);
  return {
    OR: [
      { recipientUserId: user.id },
      {
        recipientUserId: null,
        recipientRole: { in: roles.length ? roles : [user.role || "user"] },
        ...(programId ? { programId } : {}),
      },
    ],
  };
}

async function listForUser(user) {
  assertRead(user);
  const rows = await prisma.notifications.findMany({
    where: scopedRecipientWhere(user),
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
      ...scopedRecipientWhere(user),
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
      ...scopedRecipientWhere(user),
    },
    data: { acknowledged: true },
  });
  return { ok: true };
}

const CROPFORT_ROLE_ENUM = new Set([
  "field_supervisor",
  "field_manager",
  "bagro_office",
  "spx_validator",
  "farm_owner",
  "farm_owner_viewer",
  "spx_platform_admin",
]);

async function findUsersByRoles(programId, roles) {
  const roleList = [...new Set((roles || []).filter(Boolean))];
  if (!roleList.length) return [];
  const cropfortRoles = roleList.filter((r) => CROPFORT_ROLE_ENUM.has(r));

  const [byGlobalRole, byCropfortRole] = await Promise.all([
    prisma.users.findMany({
      where: {
        active: true,
        accountStatus: { not: "suspended" },
        role: { in: roleList },
        OR: [
          { activeProgramId: programId },
          { cropfort_user_roles: { some: { programId } } },
        ],
      },
      select: { id: true, role: true },
    }),
    cropfortRoles.length
      ? prisma.cropfort_user_roles.findMany({
          where: { programId, role: { in: cropfortRoles } },
          select: {
            role: true,
            users: { select: { id: true, role: true, active: true, accountStatus: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const map = new Map();
  for (const u of byGlobalRole) map.set(u.id, u.role);
  for (const row of byCropfortRole) {
    if (row.users?.active && row.users.accountStatus !== "suspended") {
      map.set(row.users.id, row.role || row.users.role || "user");
    }
  }
  return [...map.entries()].map(([id, role]) => ({ id, role }));
}

async function findVendorUsers(vendorId) {
  if (!vendorId) return [];
  return prisma.users.findMany({
    where: {
      vendorId,
      active: true,
      accountStatus: { not: "suspended" },
    },
    select: { id: true, role: true },
  });
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
  const seen = new Set();
  const data = [];
  for (const r of recipients) {
    if (!r?.id || seen.has(r.id)) continue;
    seen.add(r.id);
    data.push({
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
    });
  }
  if (!data.length) return [];
  await prisma.notifications.createMany({ data });
  return data.map((d) => d.id);
}

async function notifyRoleBroadcast({
  programId,
  triggerType,
  entityType,
  entityId,
  message,
  roles,
}) {
  const roleList = [...new Set((roles || []).filter(Boolean))];
  if (!roleList.length) return [];
  const roleRows = roleList.map((role) => ({
    id: uuid("ntf"),
    programId: programId || null,
    triggerType,
    entityType,
    entityId,
    recipientRole: role,
    recipientUserId: null,
    message,
    sentAt: new Date(),
    acknowledged: false,
  }));
  await prisma.notifications.createMany({ data: roleRows });
  return roleRows.map((r) => r.id);
}

/** Prefer named users; fall back to role broadcasts so desks still see alerts. */
async function notifyRolesOrUsers({
  programId,
  triggerType,
  entityType,
  entityId,
  message,
  roles,
  extraRecipients = [],
}) {
  const byRole = await findUsersByRoles(programId, roles);
  const map = new Map();
  for (const r of [...byRole, ...extraRecipients]) {
    if (r?.id) map.set(r.id, r);
  }
  const recipients = [...map.values()];
  if (recipients.length > 0) {
    return notifyUsers({
      programId,
      triggerType,
      entityType,
      entityId,
      message,
      recipients,
    });
  }
  return notifyRoleBroadcast({
    programId,
    triggerType,
    entityType,
    entityId,
    message,
    roles,
  });
}

async function notifyUserById(programId, userId, payload) {
  if (!userId) return [];
  const user = await prisma.users.findFirst({
    where: { id: userId, active: true, accountStatus: { not: "suspended" } },
    select: { id: true, role: true },
  });
  if (!user) return [];
  return notifyUsers({
    programId,
    ...payload,
    recipients: [user],
  });
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

  if (recipients.length > 0) return userIds;

  return notifyRoleBroadcast({
    programId,
    triggerType: "rate_card.submitted",
    entityType: "rate_card_batch",
    entityId: batchKey,
    message,
    roles: ["silva_owner", "silva_country_manager"],
  });
}

async function notifyRateCardDecision(programId, line, decision, actorName) {
  const creatorId = line.createdByUserId;
  if (!creatorId) return [];
  const code = line.resourceCode || "rate";
  const message =
    decision === "approved"
      ? `${actorName || "Farm owner"} approved rate ${code}`
      : `${actorName || "Farm owner"} returned rate ${code} for revision`;
  return notifyUserById(programId, creatorId, {
    triggerType: decision === "approved" ? "rate_card.approved" : "rate_card.returned",
    entityType: "rate_card_line",
    entityId: line.id,
    message,
  });
}

async function notifyRateCardProposalSubmitted(programId, proposal) {
  const recipients = await findAssetOwnerRecipients(programId);
  const label = proposal.activityName || proposal.activityId || proposal.id;
  const message = `Rate card “${label}” is awaiting your approval`;

  const userIds = await notifyUsers({
    programId,
    triggerType: "rate_card_proposal.submitted",
    entityType: "rate_card_proposal",
    entityId: proposal.id,
    message,
    recipients,
  });
  if (recipients.length > 0) return userIds;

  return notifyRoleBroadcast({
    programId,
    triggerType: "rate_card_proposal.submitted",
    entityType: "rate_card_proposal",
    entityId: proposal.id,
    message,
    roles: ["farm_owner", "silva_owner", "silva_country_manager"],
  });
}

async function notifyRateCardProposalDecision(programId, proposal, decision, actorName) {
  const creatorId = proposal.createdByUserId;
  if (!creatorId) return [];
  const label = proposal.activityName || proposal.activityId || proposal.id;
  const message =
    decision === "approved"
      ? `${actorName || "Silva"} approved rate card “${label}”`
      : `${actorName || "Silva"} rejected rate card “${label}” — returned for revision`;
  return notifyUserById(programId, creatorId, {
    triggerType:
      decision === "approved" ? "rate_card_proposal.approved" : "rate_card_proposal.returned",
    entityType: "rate_card_proposal",
    entityId: proposal.id,
    message,
  });
}

async function notifyBenchmarkSurveySubmitted(programId, survey) {
  const recipients = await findAssetOwnerRecipients(programId);
  const label = survey.activityName || survey.activityId || survey.id;
  const message = `Benchmark survey “${label}” was submitted (evidence packet)`;
  const userIds = await notifyUsers({
    programId,
    triggerType: "benchmark_survey.submitted",
    entityType: "benchmark_survey",
    entityId: survey.id,
    message,
    recipients,
  });
  if (recipients.length > 0) return userIds;
  return notifyRoleBroadcast({
    programId,
    triggerType: "benchmark_survey.submitted",
    entityType: "benchmark_survey",
    entityId: survey.id,
    message,
    roles: ["farm_owner", "silva_owner"],
  });
}

async function notifyWorkOrderIssued(programId, wo) {
  const label = wo.code || wo.title || wo.activity || wo.id;
  const message = `Work order ${label} was issued`;
  const vendors = await findVendorUsers(wo.assignedVendorId);
  return notifyRolesOrUsers({
    programId,
    triggerType: "work_order.issued",
    entityType: "work_order",
    entityId: wo.id,
    message,
    roles: ["vendor_admin", "vendor_manager", "vendor_supervisor", "vendor_field_lead", "field_supervisor"],
    extraRecipients: vendors,
  });
}

async function notifyFieldTicketStatus(programId, ticket, nextStatus, actorName) {
  const shortId = String(ticket.id || "").slice(0, 10).toUpperCase();
  const activity = ticket.activityRecorded || "field ticket";

  if (nextStatus === "submitted") {
    return notifyRolesOrUsers({
      programId,
      triggerType: "field_ticket.submitted",
      entityType: "field_ticket",
      entityId: ticket.id,
      message: `Field ticket ${shortId} submitted — ${activity} (validation queue)`,
      roles: [...SPX_VALIDATOR_ROLES, "field_supervisor", "bagro_office"],
    });
  }

  if (nextStatus === "rejected") {
    return notifyUserById(programId, ticket.submittedByUserId, {
      triggerType: "field_ticket.returned",
      entityType: "field_ticket",
      entityId: ticket.id,
      message: `${actorName || "Reviewer"} returned field ticket ${shortId} for correction`,
    });
  }

  if (nextStatus === "validated") {
    const ids = await notifyUserById(programId, ticket.submittedByUserId, {
      triggerType: "field_ticket.validated",
      entityType: "field_ticket",
      entityId: ticket.id,
      message: `${actorName || "SPX"} validated field ticket ${shortId}`,
    });
    // Also alert payment desks that a ticket is ready to bill.
    await notifyRolesOrUsers({
      programId,
      triggerType: "field_ticket.validated",
      entityType: "field_ticket",
      entityId: ticket.id,
      message: `Validated ticket ${shortId} is ready for payment request`,
      roles: ["vendor_manager", "vendor_field_lead", "vendor_admin", ...SPX_PAYMENT_ROLES],
    });
    return ids;
  }

  if (nextStatus === "vendor_reviewed") {
    return notifyRolesOrUsers({
      programId,
      triggerType: "field_ticket.vendor_reviewed",
      entityType: "field_ticket",
      entityId: ticket.id,
      message: `Field ticket ${shortId} is ready for SPX validation`,
      roles: SPX_VALIDATOR_ROLES,
    });
  }

  return [];
}

async function notifyAfeSubmitted(programId, afe) {
  const label = afe.title || afe.id;
  return notifyRolesOrUsers({
    programId,
    triggerType: "afe.submitted",
    entityType: "afe",
    entityId: afe.id,
    message: `AFE “${label}” is awaiting approval`,
    roles: APPROVER_ROLES,
    extraRecipients: await findAssetOwnerRecipients(programId),
  });
}

async function notifyAfeDecision(programId, afe, decision, actorName) {
  const label = afe.title || afe.id;
  const message =
    decision === "approve" || decision === "approved"
      ? `${actorName || "Approver"} approved AFE “${label}”`
      : `${actorName || "Approver"} returned AFE “${label}” for revision`;
  return notifyUserById(programId, afe.createdByUserId, {
    triggerType:
      decision === "approve" || decision === "approved" ? "afe.approved" : "afe.returned",
    entityType: "afe",
    entityId: afe.id,
    message,
  });
}

async function notifyPaymentRequestCreated(programId, pr) {
  return notifyRolesOrUsers({
    programId,
    triggerType: "payment_request.submitted",
    entityType: "payment_request",
    entityId: pr.id,
    message: `Payment request awaiting SPX verification (${pr.id.slice(0, 10).toUpperCase()})`,
    roles: SPX_PAYMENT_ROLES,
  });
}

async function notifyPaymentRequestVerified(programId, pr) {
  const ids = await notifyUserById(programId, pr.requestedByUserId, {
    triggerType: "payment_request.verified",
    entityType: "payment_request",
    entityId: pr.id,
    message: `Payment request ${pr.id.slice(0, 10).toUpperCase()} was verified`,
  });
  await notifyRolesOrUsers({
    programId,
    triggerType: "payment_request.verified",
    entityType: "payment_request",
    entityId: pr.id,
    message: `Verified PR ${pr.id.slice(0, 10).toUpperCase()} is ready for settlement authorization`,
    roles: [...SPX_PAYMENT_ROLES, ...APPROVER_ROLES],
  });
  return ids;
}

async function notifyPaymentRequestReturned(programId, pr, actorName) {
  return notifyUserById(programId, pr.requestedByUserId, {
    triggerType: "payment_request.returned",
    entityType: "payment_request",
    entityId: pr.id,
    message: `${actorName || "SPX"} returned payment request ${pr.id.slice(0, 10).toUpperCase()}`,
  });
}

async function notifySettlementAuthorized(programId, settlement, pr) {
  const payee = settlement.payee || "payee";
  const ids = [];
  if (pr?.requestedByUserId) {
    ids.push(
      ...(await notifyUserById(programId, pr.requestedByUserId, {
        triggerType: "settlement.authorized",
        entityType: "settlement",
        entityId: settlement.id,
        message: `Settlement authorized for ${payee}`,
      })),
    );
  }
  await notifyRolesOrUsers({
    programId,
    triggerType: "settlement.authorized",
    entityType: "settlement",
    entityId: settlement.id,
    message: `Settlement authorized for ${payee} — awaiting mark settled`,
    roles: [...APPROVER_ROLES, "silva_finance"],
  });
  return ids;
}

async function notifySettlementSettled(programId, settlement) {
  return notifyRolesOrUsers({
    programId,
    triggerType: "settlement.settled",
    entityType: "settlement",
    entityId: settlement.id,
    message: `Settlement for ${settlement.payee || "payee"} marked settled`,
    roles: [...SPX_PAYMENT_ROLES, "vendor_admin", "vendor_manager"],
  });
}

async function notifyProgrammePlanSubmitted(programId, plan) {
  const label = plan.name || plan.code || plan.id;
  return notifyRolesOrUsers({
    programId,
    triggerType: "programme_plan.submitted",
    entityType: "programme_plan",
    entityId: plan.id,
    message: `Programme plan “${label}” is awaiting your decision`,
    roles: APPROVER_ROLES,
    extraRecipients: await findAssetOwnerRecipients(programId),
  });
}

async function notifyProgrammePlanDecision(programId, plan, decision, actorName) {
  const label = plan.name || plan.code || plan.id;
  const targetUserId = plan.submittedByUserId || plan.createdByUserId;
  const message =
    decision === "approve" || decision === "approved"
      ? `${actorName || "Approver"} approved programme plan “${label}”`
      : `${actorName || "Approver"} returned programme plan “${label}”`;
  return notifyUserById(programId, targetUserId, {
    triggerType:
      decision === "approve" || decision === "approved"
        ? "programme_plan.approved"
        : "programme_plan.returned",
    entityType: "programme_plan",
    entityId: plan.id,
    message,
  });
}

module.exports = {
  listForUser,
  acknowledge,
  acknowledgeAll,
  notifyUsers,
  notifyRateCardSubmitted,
  notifyRateCardDecision,
  notifyRateCardProposalSubmitted,
  notifyRateCardProposalDecision,
  notifyBenchmarkSurveySubmitted,
  notifyWorkOrderIssued,
  notifyFieldTicketStatus,
  notifyAfeSubmitted,
  notifyAfeDecision,
  notifyPaymentRequestCreated,
  notifyPaymentRequestVerified,
  notifyPaymentRequestReturned,
  notifySettlementAuthorized,
  notifySettlementSettled,
  notifyProgrammePlanSubmitted,
  notifyProgrammePlanDecision,
};
