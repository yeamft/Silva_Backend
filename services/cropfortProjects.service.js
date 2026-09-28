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
  throw new AppError(403, "FORBIDDEN", "Insufficient permissions to view projects");
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
  throw new AppError(403, "FORBIDDEN", "Insufficient permissions to mutate projects");
}

function assertDecide(user) {
  if (isAssetOwnerApprover(user)) return;
  throw new AppError(403, "FORBIDDEN", "Only Silva / asset owners can decide projects");
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

function serializeMilestone(row) {
  return { id: row.id, title: row.title, done: Boolean(row.done) };
}

function serialize(row) {
  const milestones = (row.milestones || []).map(serializeMilestone);
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    blockId: row.blockId || "",
    blockCode: row.blockCode || "",
    vendor: row.vendor || "",
    budgetEtb: num(row.budgetEtb),
    band: row.band,
    status: row.status,
    notes: row.notes || "",
    milestones,
    cropfortAfeId: row.cropfortAfeId || null,
    returnedComment: row.returnedComment || null,
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdByUserId: row.createdByUserId,
    createdByName: row.users?.name || null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const INCLUDE = {
  milestones: { orderBy: { sortOrder: "asc" } },
  users: { select: { id: true, name: true } },
};

async function load(user, id) {
  const programId = requireProgramId(user);
  const row = await prisma.cropfort_projects.findFirst({
    where: { id, programId },
    include: INCLUDE,
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Project not found");
  return row;
}

exports.listProjects = async (user, { status } = {}) => {
  assertRead(user);
  const programId = requireProgramId(user);
  const where = { programId };
  if (status) where.status = status;
  const rows = await prisma.cropfort_projects.findMany({
    where,
    include: INCLUDE,
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(serialize);
};

exports.getProject = async (user, id) => {
  assertRead(user);
  return serialize(await load(user, id));
};

exports.createProject = async (user, body) => {
  assertWrite(user);
  const programId = requireProgramId(user);
  const title = String(body.title || "").trim();
  if (!title) throw new AppError(400, "VALIDATION_ERROR", "title is required");
  const budgetEtb = num(body.budgetEtb);
  if (budgetEtb <= 0) throw new AppError(400, "VALIDATION_ERROR", "budgetEtb must be greater than zero");
  if (!body.blockId) throw new AppError(400, "VALIDATION_ERROR", "blockId is required");

  const program = await prisma.programs.findUnique({ where: { id: programId } });
  if (!program) throw new AppError(404, "NOT_FOUND", "Programme not found");
  const band = body.band || resolveBand(program, budgetEtb);

  const n = (await prisma.cropfort_projects.count({ where: { programId } })) + 1;
  const code =
    String(body.code || "").trim() ||
    `PRJ-${String(n).padStart(2, "0")}-${Date.now().toString(36).slice(-4).toUpperCase()}`;

  const existing = await prisma.cropfort_projects.findFirst({ where: { programId, code } });
  if (existing) throw new AppError(409, "ALREADY_EXISTS", `Code ${code} already exists`);

  const now = new Date();
  const created = await prisma.cropfort_projects.create({
    data: {
      id: uuid("prj"),
      programId,
      code,
      title,
      blockId: body.blockId || null,
      blockCode: String(body.blockCode || "").trim(),
      vendor: String(body.vendor || "").trim(),
      budgetEtb: new Prisma.Decimal(budgetEtb.toFixed(2)),
      band,
      status: "draft",
      notes: String(body.notes || "").trim(),
      createdByUserId: user.id,
      updatedAt: now,
      milestones: {
        create: [
          { id: uuid("pm"), title: "Scope locked", done: false, sortOrder: 0 },
          { id: uuid("pm"), title: "Works complete", done: false, sortOrder: 1 },
        ],
      },
    },
    include: INCLUDE,
  });
  return serialize(created);
};

exports.submitProject = async (user, id) => {
  assertWrite(user);
  const existing = await load(user, id);
  if (existing.status !== "draft" && existing.status !== "returned") {
    throw new AppError(400, "INVALID_STATUS", "Only draft or returned projects can be submitted");
  }
  const now = new Date();
  const updated = await prisma.cropfort_projects.update({
    where: { id },
    data: { status: "submitted", submittedAt: now, returnedComment: null, updatedAt: now },
    include: INCLUDE,
  });
  return serialize(updated);
};

exports.decideProject = async (user, id, body) => {
  assertDecide(user);
  const existing = await load(user, id);
  if (existing.status !== "submitted") {
    throw new AppError(400, "INVALID_STATUS", "Only submitted projects can be decided");
  }
  const decision = body.decision;
  if (decision !== "approve" && decision !== "return") {
    throw new AppError(400, "VALIDATION_ERROR", "decision must be approve or return");
  }
  if (decision === "return" && !String(body.comment || "").trim()) {
    throw new AppError(400, "VALIDATION_ERROR", "comment is required when returning");
  }
  const now = new Date();
  const updated = await prisma.cropfort_projects.update({
    where: { id },
    data:
      decision === "approve"
        ? { status: "approved", approvedAt: now, returnedComment: null, updatedAt: now }
        : {
            status: "returned",
            returnedComment: String(body.comment).trim(),
            notes: [existing.notes, String(body.comment).trim()].filter(Boolean).join("\n"),
            updatedAt: now,
          },
    include: INCLUDE,
  });
  return serialize(updated);
};

exports.startProject = async (user, id) => {
  assertWrite(user);
  const existing = await load(user, id);
  if (existing.status !== "approved") {
    throw new AppError(400, "INVALID_STATUS", "Approve the project before starting work");
  }
  const now = new Date();
  const updated = await prisma.cropfort_projects.update({
    where: { id },
    data: { status: "in_progress", startedAt: now, updatedAt: now },
    include: INCLUDE,
  });
  return serialize(updated);
};

exports.toggleMilestone = async (user, id, milestoneId) => {
  assertWrite(user);
  const existing = await load(user, id);
  if (existing.status !== "in_progress" && existing.status !== "approved") {
    throw new AppError(400, "INVALID_STATUS", "Milestones can only change while in progress");
  }
  const milestone = (existing.milestones || []).find((m) => m.id === milestoneId);
  if (!milestone) throw new AppError(404, "NOT_FOUND", "Milestone not found");

  await prisma.cropfort_project_milestones.update({
    where: { id: milestoneId },
    data: { done: !milestone.done },
  });

  const now = new Date();
  const refreshed = await prisma.cropfort_projects.findFirst({
    where: { id },
    include: INCLUDE,
  });
  const allDone = (refreshed.milestones || []).every((m) => m.done);
  const nextStatus =
    allDone && (refreshed.status === "in_progress" || refreshed.status === "approved")
      ? "complete"
      : refreshed.status === "approved"
        ? "in_progress"
        : refreshed.status;

  const updated = await prisma.cropfort_projects.update({
    where: { id },
    data: {
      status: nextStatus,
      completedAt: nextStatus === "complete" ? now : null,
      updatedAt: now,
    },
    include: INCLUDE,
  });
  return serialize(updated);
};

exports.linkAfe = async (user, id, cropfortAfeId) => {
  assertWrite(user);
  await load(user, id);
  const updated = await prisma.cropfort_projects.update({
    where: { id },
    data: { cropfortAfeId, updatedAt: new Date() },
    include: INCLUDE,
  });
  return serialize(updated);
};
