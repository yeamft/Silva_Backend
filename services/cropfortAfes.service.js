const AppError = require("../utils/AppError");
const prisma = require("../config/database");
const { uuid } = require("../utils/ids");
const { permissionsFor, isSpxRole, isAssetOwnerApprover } = require("../utils/roles");
const { Prisma } = require("@prisma/client");

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
  if (key.startsWith("afe") && (cf.includes("spx_validator") || cf.includes("spx_platform_admin") || cf.includes("farm_owner"))) {
    return true;
  }
  return false;
}

function assertRead(user) {
  if (
    hasPerm(user, "afe.read") ||
    isSpxRole(user.role) ||
    isSilvaRole(user.role) ||
    user.role === "system_admin" ||
    user.role === "spx_platform_admin" ||
    user.role === "spx_validator" ||
    user.role === "farm_owner"
  ) {
    return;
  }
  throw new AppError(403, "FORBIDDEN", "Insufficient permissions to view AFEs");
}

function assertWrite(user) {
  if (
    hasPerm(user, "afe.create") ||
    hasPerm(user, "afe.validate") ||
    isSpxRole(user.role) ||
    user.role === "system_admin" ||
    user.role === "spx_platform_admin" ||
    user.role === "spx_validator"
  ) {
    return;
  }
  throw new AppError(403, "FORBIDDEN", "Insufficient permissions to mutate AFEs");
}

function assertDecide(user) {
  if (
    hasPerm(user, "afe.approve_band_a") ||
    hasPerm(user, "afe.approve_band_b") ||
    hasPerm(user, "afe.approve_band_c") ||
    hasPerm(user, "afe.approve_band_d") ||
    isAssetOwnerApprover(user)
  ) {
    return;
  }
  throw new AppError(403, "FORBIDDEN", "Only Silva / asset owners can decide AFEs");
}

function num(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function resolveBand(program, amountEtb) {
  const cost = Number(amountEtb) || 0;
  const aMax = num(program.cropfortAfeBandAMaxEtb) ?? 500000;
  const bMax = num(program.cropfortAfeBandBMaxEtb) ?? 2000000;
  const cMax = num(program.cropfortAfeBandCMaxEtb) ?? 5000000;
  if (cost <= aMax) return "A";
  if (cost <= bMax) return "B";
  if (cost <= cMax) return "C";
  return "D";
}

function serialize(row) {
  return {
    id: row.id,
    programId: row.programId,
    title: row.title,
    amountEtb: num(row.amountEtb) ?? 0,
    band: row.band,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    status: row.status,
    version: row.version,
    returnedComment: row.returnedComment,
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    createdByUserId: row.createdByUserId,
    createdByName: row.users?.name || null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function recordAudit({ actorId, programId, entityId, action, before, after }) {
  await prisma.audit_log.create({
    data: {
      id: uuid("aud"),
      programId: programId || null,
      userId: actorId || null,
      entityType: "cropfort_afe",
      entityId,
      action,
      oldValue: before ?? undefined,
      newValue: after ?? undefined,
    },
  });
}

exports.listAfes = async (user, { status } = {}) => {
  assertRead(user);
  const programId = requireProgramId(user);
  const where = { programId };
  if (status) where.status = status;
  const rows = await prisma.cropfort_afes.findMany({
    where,
    include: { users: { select: { id: true, name: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(serialize);
};

exports.getAfe = async (user, id) => {
  assertRead(user);
  const programId = requireProgramId(user);
  const row = await prisma.cropfort_afes.findFirst({
    where: { id, programId },
    include: { users: { select: { id: true, name: true } } },
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "AFE not found");
  return serialize(row);
};

exports.createAfe = async (user, body) => {
  assertWrite(user);
  const programId = requireProgramId(user);
  const title = String(body.title || "").trim();
  const amountEtb = Number(body.amountEtb);
  if (!title) throw new AppError(400, "VALIDATION_ERROR", "title is required");
  if (!Number.isFinite(amountEtb) || amountEtb < 0) {
    throw new AppError(400, "VALIDATION_ERROR", "amountEtb must be a non-negative number");
  }
  const program = await prisma.programs.findUnique({ where: { id: programId } });
  if (!program) throw new AppError(404, "NOT_FOUND", "Programme not found");
  const band = body.band || resolveBand(program, amountEtb);
  const created = await prisma.cropfort_afes.create({
    data: {
      id: uuid("cafe"),
      programId,
      title,
      amountEtb: new Prisma.Decimal(amountEtb.toFixed(2)),
      band,
      sourceType: body.sourceType || "manual",
      sourceId: body.sourceId || null,
      status: "draft",
      createdByUserId: user.id,
      updatedAt: new Date(),
    },
    include: { users: { select: { id: true, name: true } } },
  });
  await recordAudit({
    actorId: user.id,
    programId,
    entityId: created.id,
    action: "afe.create",
    after: { title, amountEtb, band },
  });
  return serialize(created);
};

exports.submitAfe = async (user, id) => {
  assertWrite(user);
  const programId = requireProgramId(user);
  const existing = await prisma.cropfort_afes.findFirst({ where: { id, programId } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "AFE not found");
  if (!["draft", "returned"].includes(existing.status)) {
    throw new AppError(409, "INVALID_STATE_TRANSITION", `Cannot submit from ${existing.status}`);
  }
  const updated = await prisma.cropfort_afes.update({
    where: { id },
    data: { status: "submitted", submittedAt: new Date(), updatedAt: new Date(), returnedComment: null },
    include: { users: { select: { id: true, name: true } } },
  });
  await recordAudit({
    actorId: user.id,
    programId,
    entityId: id,
    action: "afe.submit",
    before: { status: existing.status },
    after: { status: "submitted" },
  });
  return serialize(updated);
};

exports.decideAfe = async (user, id, { decision, comment } = {}) => {
  assertDecide(user);
  const programId = requireProgramId(user);
  const existing = await prisma.cropfort_afes.findFirst({ where: { id, programId } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "AFE not found");
  if (existing.status !== "submitted") {
    throw new AppError(409, "INVALID_STATE_TRANSITION", `Cannot decide from ${existing.status}`);
  }
  const d = String(decision || "").toLowerCase();
  if (d !== "approve" && d !== "return") {
    throw new AppError(400, "VALIDATION_ERROR", "decision must be approve or return");
  }
  if (d === "return" && !String(comment || "").trim()) {
    throw new AppError(400, "VALIDATION_ERROR", "Return reason is required");
  }
  const updated = await prisma.cropfort_afes.update({
    where: { id },
    data: {
      status: d === "approve" ? "approved" : "returned",
      approvedAt: d === "approve" ? new Date() : null,
      returnedComment: d === "return" ? String(comment).trim() : null,
      updatedAt: new Date(),
    },
    include: { users: { select: { id: true, name: true } } },
  });
  await recordAudit({
    actorId: user.id,
    programId,
    entityId: id,
    action: d === "approve" ? "afe.approve" : "afe.return",
    before: { status: existing.status },
    after: { status: updated.status, comment: comment || null },
  });
  return serialize(updated);
};
