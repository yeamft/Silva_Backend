const AppError = require("../utils/AppError");
const prisma = require("../config/database");
const { uuid } = require("../utils/ids");
const { permissionsFor, isSpxRole, isSilvaRole } = require("../utils/roles");
const { Prisma } = require("@prisma/client");
const notifications = require("./notifications.service");

function requireProgramId(user) {
  if (!user.activeProgramId) {
    throw new AppError(400, "NO_ACTIVE_PROGRAM", "Select a workspace program first.");
  }
  return user.activeProgramId;
}

function hasPerm(user, key) {
  const perms = permissionsFor(user.role) || [];
  if (perms.includes(key)) return true;
  const cf = user.cropfortRoles || [];
  if (
    (key.startsWith("payment_requests") || key.startsWith("settlements")) &&
    (cf.includes("spx_validator") ||
      cf.includes("spx_platform_admin") ||
      cf.includes("vendor_ops") ||
      cf.includes("farm_owner"))
  ) {
    return true;
  }
  return false;
}

function assertCreate(user) {
  if (
    hasPerm(user, "payment_requests.create") ||
    isSpxRole(user.role) ||
    user.role === "vendor" ||
    user.role === "vendor_ops" ||
    user.role === "system_admin" ||
    user.role === "spx_platform_admin" ||
    user.role === "spx_validator"
  ) {
    return;
  }
  throw new AppError(403, "FORBIDDEN", "Insufficient permissions to create payment requests");
}

function assertVerify(user) {
  if (
    hasPerm(user, "payment_requests.verify") ||
    isSpxRole(user.role) ||
    user.role === "system_admin" ||
    user.role === "spx_platform_admin" ||
    user.role === "spx_validator"
  ) {
    return;
  }
  throw new AppError(403, "FORBIDDEN", "Insufficient permissions to verify payment requests");
}

function assertAuthorize(user) {
  if (
    hasPerm(user, "settlements.authorize") ||
    isSpxRole(user.role) ||
    user.role === "system_admin" ||
    user.role === "spx_platform_admin" ||
    user.role === "spx_validator"
  ) {
    return;
  }
  throw new AppError(403, "FORBIDDEN", "Insufficient permissions to authorize settlements");
}

function assertReadPayments(user) {
  // Firewall: Silva never sees raw payment requests — settlements only.
  if (isSilvaRole(user.role) || user.role === "farm_owner") {
    throw new AppError(403, "FORBIDDEN", "Silva views settlements only — not raw payment requests");
  }
  if (
    hasPerm(user, "payment_requests.create") ||
    hasPerm(user, "payment_requests.verify") ||
    hasPerm(user, "payment_requests.read_verified") ||
    isSpxRole(user.role) ||
    user.role === "vendor" ||
    user.role === "vendor_ops" ||
    user.role === "system_admin"
  ) {
    return;
  }
  const cf = user.cropfortRoles || [];
  if (cf.includes("bagro_office") || cf.includes("field_supervisor") || cf.includes("spx_validator") || cf.includes("spx_platform_admin")) {
    return;
  }
  throw new AppError(403, "FORBIDDEN", "Insufficient permissions to view payment requests");
}

function assertReadSettlements(user) {
  if (
    hasPerm(user, "settlements.read") ||
    hasPerm(user, "settlements.authorize") ||
    hasPerm(user, "settlements.mark_settled") ||
    isSpxRole(user.role) ||
    isSilvaRole(user.role) ||
    user.role === "farm_owner" ||
    user.role === "system_admin"
  ) {
    return;
  }
  throw new AppError(403, "FORBIDDEN", "Insufficient permissions to view settlements");
}

function num(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function uiStatus(dbStatus) {
  if (dbStatus === "rejected") return "returned";
  return dbStatus;
}

function serializePr(row) {
  const ticket = row.field_tickets;
  const wo = row.work_orders;
  const requester = row.users_payment_requests_requestedByUserIdTousers;
  const verifier = row.users_payment_requests_spxVerifiedByUserIdTousers;
  const blocks = wo?.work_order_block_assignments || [];
  const primaryBlock = blocks[0]?.farm_blocks;
  return {
    id: row.id,
    code: `PR-${row.id.slice(0, 8).toUpperCase()}`,
    programId: row.programId,
    workOrderId: row.workOrderId,
    workOrderCode: wo?.code || row.workOrderId.slice(0, 8).toUpperCase(),
    fieldTicketId: row.fieldTicketId,
    fieldTicketCode: ticket ? ticket.id.slice(0, 8).toUpperCase() : row.fieldTicketId.slice(0, 8).toUpperCase(),
    ticketTitle: ticket?.activityRecorded || "Field ticket",
    block: primaryBlock?.label || primaryBlock?.code || "—",
    vendor: wo?.vendors?.name || requester?.name || "—",
    type: "field_ticket",
    amountEtb: num(row.amountRequestedEtb) ?? 0,
    status: uiStatus(row.status),
    requestedByUserId: row.requestedByUserId,
    requestedByName: requester?.name || null,
    submittedAt: row.dateSubmitted ? row.dateSubmitted.toISOString() : null,
    verifiedByUserId: row.spxVerifiedByUserId,
    verifiedByName: verifier?.name || null,
    verifiedAt: row.verifiedDate ? row.verifiedDate.toISOString() : null,
    returnComment: row.status === "rejected" ? "Returned for correction" : null,
    settlementId: row.settlementId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeSettlement(row, pr) {
  const authorized = row.users;
  const code = `STL-${row.id.slice(0, 8).toUpperCase()}`;
  const prCode = pr ? `PR-${pr.id.slice(0, 8).toUpperCase()}` : row.paymentRequestId.slice(0, 8).toUpperCase();
  const ticketSummary = pr?.field_tickets
    ? `${pr.field_tickets.id.slice(0, 8).toUpperCase()} · ${num(row.amountEtb) ?? 0} ETB`
    : `${num(row.amountEtb) ?? 0} ETB`;
  return {
    id: row.id,
    code,
    programId: row.programId,
    workOrderId: row.workOrderId,
    paymentRequestId: row.paymentRequestId,
    paymentRequestCode: prCode,
    type: "vendor_pay",
    payee: row.payee,
    amountEtb: num(row.amountEtb) ?? 0,
    status: row.status,
    narrative: `Settlement for ${prCode}`,
    ticketSummary,
    authorizedByUserId: row.authorizedByUserId,
    authorizedByName: authorized?.name || null,
    authorizedAt: row.dateAuthorized ? row.dateAuthorized.toISOString() : null,
    settledAt: row.status === "settled" ? row.updatedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const PR_INCLUDE = {
  field_tickets: true,
  work_orders: {
    include: {
      vendors: { select: { id: true, name: true } },
      work_order_block_assignments: {
        include: { farm_blocks: { select: { id: true, code: true, label: true } } },
      },
    },
  },
  users_payment_requests_requestedByUserIdTousers: { select: { id: true, name: true } },
  users_payment_requests_spxVerifiedByUserIdTousers: { select: { id: true, name: true } },
};

async function listPaymentRequests(user, { status } = {}) {
  assertReadPayments(user);
  const programId = requireProgramId(user);
  const where = { programId };
  if (status === "returned") where.status = "rejected";
  else if (status) where.status = status;

  const rows = await prisma.payment_requests.findMany({
    where,
    include: PR_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(serializePr);
}

async function createPaymentRequest(user, { fieldTicketId }) {
  assertCreate(user);
  const programId = requireProgramId(user);
  const ticket = await prisma.field_tickets.findFirst({
    where: { id: fieldTicketId, programId },
    include: { work_orders: true },
  });
  if (!ticket) throw new AppError(404, "NOT_FOUND", "Field ticket not found");
  if (ticket.status !== "validated") {
    throw new AppError(400, "INVALID_STATUS", "Only validated tickets can bill");
  }

  const existing = await prisma.payment_requests.findFirst({
    where: {
      fieldTicketId,
      programId,
      status: { not: "rejected" },
    },
  });
  if (existing) {
    throw new AppError(409, "ALREADY_EXISTS", "A payment request already exists for this ticket");
  }

  const now = new Date();
  const amount = num(ticket.actualCostEtb) ?? 0;
  const created = await prisma.payment_requests.create({
    data: {
      id: uuid("pr"),
      programId,
      workOrderId: ticket.workOrderId,
      fieldTicketId: ticket.id,
      requestedByUserId: user.id,
      type: "vendor_fee",
      amountRequestedEtb: new Prisma.Decimal(amount),
      dateSubmitted: now,
      status: "submitted",
      createdAt: now,
      updatedAt: now,
    },
    include: PR_INCLUDE,
  });
  const dto = serializePr(created);
  try {
    await notifications.notifyPaymentRequestCreated(programId, dto);
  } catch (err) {
    console.error("[payments] notifyPaymentRequestCreated failed:", err?.message || err);
  }
  return dto;
}

async function verifyPaymentRequest(user, id) {
  assertVerify(user);
  const programId = requireProgramId(user);
  const existing = await prisma.payment_requests.findFirst({
    where: { id, programId },
    include: PR_INCLUDE,
  });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Payment request not found");
  if (existing.status !== "submitted") {
    throw new AppError(400, "INVALID_STATUS", "PR not awaiting verification");
  }
  if (existing.requestedByUserId === user.id) {
    throw new AppError(400, "MAKER_CHECKER", "Cannot verify your own payment request");
  }

  const now = new Date();
  const updated = await prisma.payment_requests.update({
    where: { id },
    data: {
      status: "verified",
      spxVerified: true,
      spxVerifiedByUserId: user.id,
      verifiedDate: now,
      updatedAt: now,
    },
    include: PR_INCLUDE,
  });
  const dto = serializePr(updated);
  try {
    await notifications.notifyPaymentRequestVerified(programId, dto);
  } catch (err) {
    console.error("[payments] notifyPaymentRequestVerified failed:", err?.message || err);
  }
  return dto;
}

async function returnPaymentRequest(user, id, { comment } = {}) {
  assertVerify(user);
  const programId = requireProgramId(user);
  const existing = await prisma.payment_requests.findFirst({
    where: { id, programId },
  });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Payment request not found");
  if (existing.status !== "submitted" && existing.status !== "verified") {
    throw new AppError(400, "INVALID_STATUS", "PR cannot be returned in this status");
  }

  const updated = await prisma.payment_requests.update({
    where: { id },
    data: {
      status: "rejected",
      spxVerified: false,
      updatedAt: new Date(),
    },
    include: PR_INCLUDE,
  });
  const dto = serializePr(updated);
  dto.returnComment = (comment && String(comment).trim()) || "Returned for correction";
  try {
    await notifications.notifyPaymentRequestReturned(programId, dto, user.name);
  } catch (err) {
    console.error("[payments] notifyPaymentRequestReturned failed:", err?.message || err);
  }
  return dto;
}

async function authorizeSettlement(user, paymentRequestId, { narrative } = {}) {
  assertAuthorize(user);
  const programId = requireProgramId(user);
  const pr = await prisma.payment_requests.findFirst({
    where: { id: paymentRequestId, programId },
    include: { ...PR_INCLUDE, owner_settlements: true },
  });
  if (!pr) throw new AppError(404, "NOT_FOUND", "Payment request not found");
  if (pr.status !== "verified") {
    throw new AppError(400, "INVALID_STATUS", "PR must be verified before settlement");
  }
  if (pr.owner_settlements?.length) {
    throw new AppError(409, "ALREADY_EXISTS", "Settlement already exists for this PR");
  }

  const now = new Date();
  const settlementId = uuid("stl");
  const payee =
    pr.work_orders?.vendors?.name ||
    pr.users_payment_requests_requestedByUserIdTousers?.name ||
    "Vendor";

  const [settlement] = await prisma.$transaction([
    prisma.owner_settlements.create({
      data: {
        id: settlementId,
        programId,
        workOrderId: pr.workOrderId,
        paymentRequestId: pr.id,
        type: "vendor_payment",
        payee: narrative?.trim() ? `${payee}` : payee,
        amountEtb: pr.amountRequestedEtb,
        spxAuthorized: true,
        authorizedByUserId: user.id,
        dateAuthorized: now,
        status: "authorized",
        createdAt: now,
        updatedAt: now,
      },
      include: { users: { select: { id: true, name: true } } },
    }),
    prisma.payment_requests.update({
      where: { id: pr.id },
      data: {
        status: "settled",
        settlementId,
        updatedAt: now,
      },
    }),
  ]);

  const dto = serializeSettlement(settlement, pr);
  try {
    await notifications.notifySettlementAuthorized(programId, dto, pr);
  } catch (err) {
    console.error("[payments] notifySettlementAuthorized failed:", err?.message || err);
  }
  return dto;
}

async function listSettlements(user) {
  assertReadSettlements(user);
  const programId = requireProgramId(user);
  const rows = await prisma.owner_settlements.findMany({
    where: { programId },
    include: {
      users: { select: { id: true, name: true } },
      payment_requests: { include: { field_tickets: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const silva = isSilvaRole(user.role) || user.role === "farm_owner";
  return rows
    .filter((r) => !silva || r.status === "authorized" || r.status === "settled")
    .map((r) => {
      const dto = serializeSettlement(r, r.payment_requests);
      if (silva) {
        dto.ticketSummary = dto.ticketSummary.replace(/\b[A-F0-9]{8}\b/gi, "Ticket");
      }
      return dto;
    });
}

async function markSettlementSettled(user, id) {
  if (
    !(
      hasPerm(user, "settlements.mark_settled") ||
      hasPerm(user, "settlements.authorize") ||
      isSpxRole(user.role) ||
      isSilvaRole(user.role) ||
      user.role === "system_admin" ||
      user.role === "spx_platform_admin"
    )
  ) {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions to mark settlement settled");
  }
  const programId = requireProgramId(user);
  const existing = await prisma.owner_settlements.findFirst({
    where: { id, programId },
    include: {
      users: { select: { id: true, name: true } },
      payment_requests: { include: { field_tickets: true } },
    },
  });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Settlement not found");
  if (existing.status !== "authorized") {
    throw new AppError(400, "INVALID_STATUS", "Only authorized settlements can be marked settled");
  }

  const updated = await prisma.owner_settlements.update({
    where: { id },
    data: { status: "settled", updatedAt: new Date() },
    include: {
      users: { select: { id: true, name: true } },
      payment_requests: { include: { field_tickets: true } },
    },
  });
  const dto = serializeSettlement(updated, updated.payment_requests);
  try {
    await notifications.notifySettlementSettled(programId, dto);
  } catch (err) {
    console.error("[payments] notifySettlementSettled failed:", err?.message || err);
  }
  return dto;
}

module.exports = {
  listPaymentRequests,
  createPaymentRequest,
  verifyPaymentRequest,
  returnPaymentRequest,
  authorizeSettlement,
  listSettlements,
  markSettlementSettled,
};
