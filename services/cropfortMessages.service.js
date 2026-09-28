const AppError = require("../utils/AppError");
const prisma = require("../config/database");
const { uuid } = require("../utils/ids");
const { permissionsFor, isSpxRole } = require("../utils/roles");

function requireProgramId(user) {
  if (!user.activeProgramId) {
    throw new AppError(400, "NO_ACTIVE_PROGRAM", "Select a workspace program first.");
  }
  return user.activeProgramId;
}

function assertAccess(user) {
  const perms = permissionsFor(user.role) || [];
  if (
    perms.includes("work_orders.read") ||
    isSpxRole(user.role) ||
    ["system_admin", "spx_platform_admin", "spx_validator", "farm_owner", "field_supervisor", "vendor", "vendor_ops"].includes(
      user.role,
    )
  ) {
    return;
  }
  throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
}

function partyFromRole(role) {
  const r = String(role || "").toLowerCase();
  if (r.includes("vendor") || r === "bagro_office" || r === "vendor_ops") return "vendor";
  if (r === "field_supervisor" || r.includes("site")) return "site_owner";
  if (r.includes("farm_owner") || r.includes("silva") || r === "asset_owner") return "asset_owner";
  return "spx";
}

function mapCounterparty(type) {
  // Prisma enum is vendor | asset_owner; site_owner stored via entityType desk tag.
  if (type === "vendor" || type === "asset_owner" || type === "site_owner") return type;
  throw new AppError(400, "VALIDATION_ERROR", "Invalid counterparty");
}

function dbCounterpartyType(type) {
  if (type === "site_owner") return "vendor";
  return type === "asset_owner" ? "asset_owner" : "vendor";
}

function serializeThread(row, messages = []) {
  const desk =
    typeof row.entityType === "string" && row.entityType.startsWith("desk:")
      ? row.entityType.slice(5)
      : row.counterpartyType;
  const counterparty =
    desk === "site_owner" || desk === "vendor" || desk === "asset_owner"
      ? desk
      : row.counterpartyType;
  const relatedType =
    typeof row.entityType === "string" && row.entityType.startsWith("desk:")
      ? "general"
      : row.entityType || "general";
  return {
    id: row.id,
    subject: row.subject,
    counterparty,
    relatedType,
    relatedCode: row.entityId || null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdByParty: partyFromRole(row.users?.role),
    createdByName: row.users?.name || "User",
    closed: row.status === "archived",
    messages: messages.map((m) => ({
      id: m.id,
      threadId: m.threadId,
      at: m.createdAt.toISOString(),
      authorId: m.senderUserId,
      authorName: m.users?.name || "User",
      authorParty: partyFromRole(m.users?.role),
      body: m.body,
    })),
  };
}

exports.listThreads = async (user) => {
  assertAccess(user);
  const programId = requireProgramId(user);
  const party = partyFromRole(user.role);
  const where = { programId };
  if (party === "vendor") {
    where.OR = [
      { counterpartyType: "vendor", entityType: { not: { startsWith: "desk:" } } },
      { entityType: "desk:vendor" },
    ];
  } else if (party === "site_owner") {
    where.entityType = "desk:site_owner";
  } else if (party === "asset_owner") {
    where.counterpartyType = "asset_owner";
  }
  const rows = await prisma.message_threads.findMany({
    where,
    include: {
      users: { select: { id: true, name: true, role: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { users: { select: { id: true, name: true, role: true } } },
      },
    },
    orderBy: { lastMessageAt: "desc" },
  });
  return rows.map((r) => serializeThread(r, r.messages));
};

exports.createThread = async (user, body) => {
  assertAccess(user);
  const programId = requireProgramId(user);
  const subject = String(body.subject || "").trim();
  if (!subject) throw new AppError(400, "VALIDATION_ERROR", "subject is required");
  const counterparty = mapCounterparty(body.counterparty);
  const firstBody = String(body.body || "").trim();
  if (!firstBody) throw new AppError(400, "VALIDATION_ERROR", "body is required");

  const program = await prisma.programs.findUnique({ where: { id: programId } });
  if (!program) throw new AppError(404, "NOT_FOUND", "Programme not found");

  const orgId = user.organizationId;
  const now = new Date();
  const threadId = uuid("cth");
  const relatedType = body.relatedType || "general";
  const entityType =
    counterparty === "site_owner" ? "desk:site_owner" : relatedType === "general" ? null : relatedType;

  const created = await prisma.$transaction(async (tx) => {
    const thread = await tx.message_threads.create({
      data: {
        id: threadId,
        programId,
        spxOrganizationId: program.createdByOrgId || orgId,
        counterpartyOrganizationId: orgId,
        counterpartyType: dbCounterpartyType(counterparty),
        subject,
        status: "open",
        entityType,
        entityId: body.relatedCode || null,
        createdByUserId: user.id,
        lastMessageAt: now,
        updatedAt: now,
      },
      include: { users: { select: { id: true, name: true, role: true } } },
    });
    const msg = await tx.messages.create({
      data: {
        id: uuid("cmsg"),
        threadId,
        senderUserId: user.id,
        senderOrganizationId: orgId,
        body: firstBody,
      },
      include: { users: { select: { id: true, name: true, role: true } } },
    });
    return { thread, msg };
  });

  return serializeThread(created.thread, [created.msg]);
};

exports.postMessage = async (user, threadId, body) => {
  assertAccess(user);
  const programId = requireProgramId(user);
  const text = String(body.body || "").trim();
  if (!text) throw new AppError(400, "VALIDATION_ERROR", "body is required");

  const thread = await prisma.message_threads.findFirst({
    where: { id: threadId, programId },
  });
  if (!thread) throw new AppError(404, "NOT_FOUND", "Thread not found");
  if (thread.status === "archived") {
    throw new AppError(400, "INVALID_STATUS", "Thread is closed");
  }

  const now = new Date();
  const msg = await prisma.messages.create({
    data: {
      id: uuid("cmsg"),
      threadId,
      senderUserId: user.id,
      senderOrganizationId: user.organizationId,
      body: text,
    },
    include: { users: { select: { id: true, name: true, role: true } } },
  });
  await prisma.message_threads.update({
    where: { id: threadId },
    data: { lastMessageAt: now, updatedAt: now },
  });

  return {
    id: msg.id,
    threadId: msg.threadId,
    at: msg.createdAt.toISOString(),
    authorId: msg.senderUserId,
    authorName: msg.users?.name || "User",
    authorParty: partyFromRole(msg.users?.role),
    body: msg.body,
  };
};

exports.setThreadStatus = async (user, threadId, closed) => {
  assertAccess(user);
  const programId = requireProgramId(user);
  const thread = await prisma.message_threads.findFirst({
    where: { id: threadId, programId },
    include: {
      users: { select: { id: true, name: true, role: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { users: { select: { id: true, name: true, role: true } } },
      },
    },
  });
  if (!thread) throw new AppError(404, "NOT_FOUND", "Thread not found");
  const updated = await prisma.message_threads.update({
    where: { id: threadId },
    data: {
      status: closed ? "archived" : "open",
      updatedAt: new Date(),
    },
    include: {
      users: { select: { id: true, name: true, role: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: { users: { select: { id: true, name: true, role: true } } },
      },
    },
  });
  return serializeThread(updated, updated.messages);
};
