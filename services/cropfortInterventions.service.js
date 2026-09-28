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

function hasCf(user) {
  const cf = user.cropfortRoles || [];
  return (
    cf.includes("spx_validator") ||
    cf.includes("spx_platform_admin") ||
    cf.includes("farm_owner") ||
    cf.includes("field_supervisor")
  );
}

function assertRead(user) {
  const perms = permissionsFor(user.role) || [];
  if (
    perms.includes("work_orders.read") ||
    hasCf(user) ||
    isSpxRole(user.role) ||
    ["system_admin", "spx_platform_admin", "spx_validator", "farm_owner", "field_supervisor", "vendor", "vendor_ops"].includes(
      user.role,
    )
  ) {
    return;
  }
  throw new AppError(403, "FORBIDDEN", "Insufficient permissions to view interventions");
}

function assertWrite(user) {
  const perms = permissionsFor(user.role) || [];
  if (
    perms.includes("work_orders.write") ||
    hasCf(user) ||
    isSpxRole(user.role) ||
    ["system_admin", "spx_platform_admin", "spx_validator", "field_supervisor"].includes(user.role)
  ) {
    return;
  }
  throw new AppError(403, "FORBIDDEN", "Insufficient permissions to mutate interventions");
}

function assertDecide(user) {
  if (isAssetOwnerApprover(user)) return;
  throw new AppError(403, "FORBIDDEN", "Only Silva / asset owners can decide interventions");
}

function num(v) {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function resolveBand(program, amountEtb) {
  const cost = Number(amountEtb) || 0;
  const aMax = Number(program.cropfortAfeBandAMaxEtb) || 500000;
  const bMax = Number(program.cropfortAfeBandBMaxEtb) || 2000000;
  const cMax = Number(program.cropfortAfeBandCMaxEtb) || 5000000;
  if (cost <= aMax) return "A";
  if (cost <= bMax) return "B";
  if (cost <= cMax) return "C";
  return "D";
}

function serializeStep(row) {
  return { id: row.id, title: row.title, done: Boolean(row.done) };
}

function serialize(row) {
  const steps = (row.steps || []).map(serializeStep);
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    blockId: row.blockId || "",
    blockCode: row.blockCode || "",
    vendor: row.vendor || "",
    costEtb: num(row.costEtb),
    band: row.band,
    status: row.status,
    steps,
    cropfortAfeId: row.cropfortAfeId || null,
    returnedComment: row.returnedComment || null,
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdByUserId: row.createdByUserId,
    createdByName: row.users?.name || null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const INCLUDE = {
  steps: { orderBy: { sortOrder: "asc" } },
  users: { select: { id: true, name: true } },
};

async function load(user, id) {
  const programId = requireProgramId(user);
  const row = await prisma.cropfort_interventions.findFirst({
    where: { id, programId },
    include: INCLUDE,
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Intervention not found");
  return row;
}

exports.listInterventions = async (user, { status } = {}) => {
  assertRead(user);
  const programId = requireProgramId(user);
  const where = { programId };
  if (status) where.status = status;
  const rows = await prisma.cropfort_interventions.findMany({
    where,
    include: INCLUDE,
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(serialize);
};

exports.getIntervention = async (user, id) => {
  assertRead(user);
  return serialize(await load(user, id));
};

exports.createIntervention = async (user, body) => {
  assertWrite(user);
  const programId = requireProgramId(user);
  const title = String(body.title || "").trim();
  if (!title) throw new AppError(400, "VALIDATION_ERROR", "title is required");
  const costEtb = num(body.costEtb);
  if (costEtb <= 0) throw new AppError(400, "VALIDATION_ERROR", "costEtb must be greater than zero");
  if (!body.blockId) throw new AppError(400, "VALIDATION_ERROR", "blockId is required");

  const program = await prisma.programs.findUnique({ where: { id: programId } });
  if (!program) throw new AppError(404, "NOT_FOUND", "Programme not found");
  const band = body.band || resolveBand(program, costEtb);

  const n = (await prisma.cropfort_interventions.count({ where: { programId } })) + 1;
  const code =
    String(body.code || "").trim() ||
    `INT-${String(n).padStart(2, "0")}-${Date.now().toString(36).slice(-4).toUpperCase()}`;

  const existing = await prisma.cropfort_interventions.findFirst({ where: { programId, code } });
  if (existing) throw new AppError(409, "ALREADY_EXISTS", `Code ${code} already exists`);

  const now = new Date();
  const created = await prisma.cropfort_interventions.create({
    data: {
      id: uuid("int"),
      programId,
      code,
      title,
      blockId: body.blockId || null,
      blockCode: String(body.blockCode || "").trim(),
      vendor: String(body.vendor || "").trim(),
      costEtb: new Prisma.Decimal(costEtb.toFixed(2)),
      band,
      status: "draft",
      createdByUserId: user.id,
      updatedAt: now,
      steps: {
        create: [
          { id: uuid("is"), title: "Prepare", done: false, sortOrder: 0 },
          { id: uuid("is"), title: "Execute", done: false, sortOrder: 1 },
          { id: uuid("is"), title: "Sign off", done: false, sortOrder: 2 },
        ],
      },
    },
    include: INCLUDE,
  });
  return serialize(created);
};

exports.startIntervention = async (user, id) => {
  assertWrite(user);
  const existing = await load(user, id);
  if (existing.status !== "draft" && existing.status !== "returned") {
    throw new AppError(400, "INVALID_STATUS", "Only draft or returned interventions can be started");
  }
  const updated = await prisma.cropfort_interventions.update({
    where: { id },
    data: { status: "active", updatedAt: new Date() },
    include: INCLUDE,
  });
  return serialize(updated);
};

exports.submitIntervention = async (user, id) => {
  assertWrite(user);
  const existing = await load(user, id);
  if (existing.status !== "active" && existing.status !== "returned") {
    throw new AppError(400, "INVALID_STATUS", "Only active or returned interventions can be submitted");
  }
  const now = new Date();
  const updated = await prisma.cropfort_interventions.update({
    where: { id },
    data: { status: "submitted", submittedAt: now, returnedComment: null, updatedAt: now },
    include: INCLUDE,
  });
  return serialize(updated);
};

exports.decideIntervention = async (user, id, body) => {
  assertDecide(user);
  const existing = await load(user, id);
  if (existing.status !== "submitted") {
    throw new AppError(400, "INVALID_STATUS", "Only submitted interventions can be decided");
  }
  const decision = body.decision;
  if (decision !== "approve" && decision !== "return") {
    throw new AppError(400, "VALIDATION_ERROR", "decision must be approve or return");
  }
  if (decision === "return" && !String(body.comment || "").trim()) {
    throw new AppError(400, "VALIDATION_ERROR", "comment is required when returning");
  }
  const now = new Date();
  const updated = await prisma.cropfort_interventions.update({
    where: { id },
    data:
      decision === "approve"
        ? { status: "approved", approvedAt: now, returnedComment: null, updatedAt: now }
        : { status: "returned", returnedComment: String(body.comment).trim(), updatedAt: now },
    include: INCLUDE,
  });
  return serialize(updated);
};

exports.completeIntervention = async (user, id) => {
  assertWrite(user);
  const existing = await load(user, id);
  if (existing.status !== "approved") {
    throw new AppError(400, "INVALID_STATUS", "Approve the intervention before completing");
  }
  if (!(existing.steps || []).every((s) => s.done)) {
    throw new AppError(400, "VALIDATION_ERROR", "All steps must be done before completing");
  }
  const now = new Date();
  const updated = await prisma.cropfort_interventions.update({
    where: { id },
    data: { status: "complete", completedAt: now, updatedAt: now },
    include: INCLUDE,
  });
  return serialize(updated);
};

exports.toggleStep = async (user, id, stepId) => {
  assertWrite(user);
  const existing = await load(user, id);
  if (!["draft", "active", "approved", "returned"].includes(existing.status)) {
    throw new AppError(400, "INVALID_STATUS", "Steps cannot change in this status");
  }
  const step = (existing.steps || []).find((s) => s.id === stepId);
  if (!step) throw new AppError(404, "NOT_FOUND", "Step not found");

  await prisma.cropfort_intervention_steps.update({
    where: { id: stepId },
    data: { done: !step.done },
  });

  const updated = await prisma.cropfort_interventions.findFirst({
    where: { id },
    include: INCLUDE,
  });
  return serialize({ ...updated, updatedAt: new Date() });
};

exports.linkAfe = async (user, id, cropfortAfeId) => {
  assertWrite(user);
  await load(user, id);
  const updated = await prisma.cropfort_interventions.update({
    where: { id },
    data: { cropfortAfeId, updatedAt: new Date() },
    include: INCLUDE,
  });
  return serialize(updated);
};
