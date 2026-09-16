const AppError = require("../utils/AppError");
const prisma = require("../config/database");
const { uuid } = require("../utils/ids");
const { isSilvaRole, isSpxRole } = require("../utils/roles");
const notifications = require("./notifications.service");

const VARIANCE_FLAG_THRESHOLD_PCT = 10;

const DEFAULT_CATEGORIES = [
  { value: "labour", label: "Labour" },
  { value: "material", label: "Material" },
  { value: "machinery", label: "Machinery" },
  { value: "transport", label: "Transport" },
  { value: "other", label: "Other" },
];

function canView(role) {
  return isSilvaRole(role) || isSpxRole(role) || role === "system_admin";
}

function canEdit(role) {
  return isSpxRole(role) || role === "system_admin";
}

function canDecide(role) {
  return isSilvaRole(role);
}

function assertView(user) {
  if (!canView(user.role)) throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
}

function assertEdit(user) {
  if (!canEdit(user.role)) throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
}

function assertDecide(user) {
  if (!canDecide(user.role)) throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
}

function requireProgramId(user) {
  const programId = user.activeProgramId;
  if (!programId) {
    throw new AppError(400, "NO_ACTIVE_PROGRAM", "Select a workspace program before managing the rate card.");
  }
  return programId;
}

function num(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function computeVariance(input) {
  const rateBirr = num(input.rateBirr);
  const benches = [num(input.benchmarkFarmARate), num(input.benchmarkFarmBRate)].filter(
    (n) => typeof n === "number" && n > 0,
  );
  if (benches.length === 0 || !rateBirr) {
    return { variancePct: null, flagged: false };
  }
  const avg = benches.reduce((s, n) => s + n, 0) / benches.length;
  const variancePct = ((rateBirr - avg) / avg) * 100;
  return {
    variancePct,
    flagged: Math.abs(variancePct) > VARIANCE_FLAG_THRESHOLD_PCT,
  };
}

function slugifyCategory(label) {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function toDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function parseOptionalDate(value) {
  if (value == null || value === "") return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid date value.");
  }
  return d;
}

function serializeCategory(row) {
  return {
    id: row.id,
    value: row.value,
    label: row.label,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeLine(row) {
  const rateBirr = num(row.rateEtb) ?? 0;
  const benchmarkFarmARate = num(row.benchmarkFarmARate);
  const benchmarkFarmBRate = num(row.benchmarkFarmBRate);
  const variance = computeVariance({ rateBirr, benchmarkFarmARate, benchmarkFarmBRate });
  return {
    id: row.id,
    resourceCode: row.resourceCode,
    resourceName: row.resourceName,
    category: row.resourceType || "other",
    unitOfMeasure: row.unitOfMeasure,
    rateBirr,
    benchmarkFarmARate,
    benchmarkFarmBRate,
    variancePct: variance.variancePct,
    flagged: variance.flagged,
    justificationNote: row.spxJustificationNote || "",
    status: row.status,
    effectiveFrom: toDateOnly(row.effectiveFrom),
    effectiveTo: toDateOnly(row.effectiveTo),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function ensureDefaultCategories(programId) {
  const count = await prisma.rate_card_categories.count({ where: { programId } });
  if (count > 0) return;
  await prisma.rate_card_categories.createMany({
    data: DEFAULT_CATEGORIES.map((c) => ({
      id: uuid("rcc"),
      programId,
      value: c.value,
      label: c.label,
      active: true,
    })),
  });
}

async function assertActiveCategory(programId, category) {
  const found = await prisma.rate_card_categories.findFirst({
    where: { programId, value: category, active: true },
  });
  if (!found) {
    throw new AppError(
      400,
      "INVALID_CATEGORY",
      "Select an active rate category. Configure categories before creating a rate.",
    );
  }
}

async function listCategories(user) {
  assertView(user);
  const programId = requireProgramId(user);
  await ensureDefaultCategories(programId);
  const rows = await prisma.rate_card_categories.findMany({
    where: { programId },
    orderBy: { label: "asc" },
  });
  return rows.map(serializeCategory);
}

async function createCategory(user, input) {
  assertEdit(user);
  const programId = requireProgramId(user);
  await ensureDefaultCategories(programId);

  const label = String(input.label || "").trim();
  if (!label) throw new AppError(400, "VALIDATION_ERROR", "Category name is required");
  const value = (input.value?.trim() || slugifyCategory(label)).toLowerCase();
  if (!value) throw new AppError(400, "VALIDATION_ERROR", "Category code is required");

  const clash = await prisma.rate_card_categories.findFirst({
    where: {
      programId,
      OR: [{ value }, { label: { equals: label, mode: "insensitive" } }],
    },
  });
  if (clash) {
    throw new AppError(409, "CONFLICT", "A category with this code or name already exists");
  }

  const created = await prisma.rate_card_categories.create({
    data: {
      id: uuid("rcc"),
      programId,
      value,
      label,
      active: input.active ?? true,
    },
  });
  return serializeCategory(created);
}

async function updateCategory(user, id, input) {
  assertEdit(user);
  const programId = requireProgramId(user);
  const existing = await prisma.rate_card_categories.findFirst({ where: { id, programId } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Category not found");

  const label = String(input.label || "").trim();
  if (!label) throw new AppError(400, "VALIDATION_ERROR", "Category name is required");

  const clash = await prisma.rate_card_categories.findFirst({
    where: {
      programId,
      id: { not: id },
      label: { equals: label, mode: "insensitive" },
    },
  });
  if (clash) throw new AppError(409, "CONFLICT", "A category with this name already exists");

  const updated = await prisma.rate_card_categories.update({
    where: { id },
    data: {
      label,
      active: input.active ?? existing.active,
    },
  });
  return serializeCategory(updated);
}

async function deleteCategory(user, id) {
  assertEdit(user);
  const programId = requireProgramId(user);
  const existing = await prisma.rate_card_categories.findFirst({ where: { id, programId } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Category not found");

  const inUse = await prisma.rate_card_lines.count({
    where: { programId, resourceType: existing.value },
  });
  if (inUse > 0) {
    throw new AppError(409, "IN_USE", "Category is used by rate lines. Deactivate it instead of deleting.");
  }

  await prisma.rate_card_categories.delete({ where: { id } });
  return { ok: true };
}

async function listLines(user) {
  assertView(user);
  const programId = requireProgramId(user);
  await ensureDefaultCategories(programId);

  const where = { programId };
  if (isSilvaRole(user.role)) {
    where.status = { in: ["submitted", "approved"] };
  }

  const rows = await prisma.rate_card_lines.findMany({
    where,
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(serializeLine);
}

function lineWriteData(input) {
  const rateBirr = Number(input.rateBirr);
  if (!Number.isFinite(rateBirr) || rateBirr < 0) {
    throw new AppError(400, "VALIDATION_ERROR", "Rate must be a valid number");
  }
  return {
    resourceCode: String(input.resourceCode || "").trim(),
    resourceName: String(input.resourceName || "").trim(),
    resourceType: String(input.category || "").trim(),
    unitOfMeasure: String(input.unitOfMeasure || "").trim(),
    rateEtb: rateBirr,
    benchmarkFarmARate:
      input.benchmarkFarmARate == null || input.benchmarkFarmARate === ""
        ? null
        : Number(input.benchmarkFarmARate),
    benchmarkFarmBRate:
      input.benchmarkFarmBRate == null || input.benchmarkFarmBRate === ""
        ? null
        : Number(input.benchmarkFarmBRate),
    spxJustificationNote: String(input.justificationNote || ""),
    effectiveFrom: parseOptionalDate(input.effectiveFrom),
    effectiveTo: parseOptionalDate(input.effectiveTo),
  };
}

async function createLine(user, input) {
  assertEdit(user);
  const programId = requireProgramId(user);
  const data = lineWriteData(input);
  if (!data.resourceCode || !data.resourceName || !data.unitOfMeasure) {
    throw new AppError(400, "VALIDATION_ERROR", "Resource code, name, and unit are required");
  }
  await assertActiveCategory(programId, data.resourceType);

  const created = await prisma.rate_card_lines.create({
    data: {
      id: uuid("rc"),
      programId,
      ...data,
      status: "draft",
      createdByUserId: user.id,
    },
  });
  return serializeLine(created);
}

async function updateLine(user, id, input) {
  assertEdit(user);
  const programId = requireProgramId(user);
  const existing = await prisma.rate_card_lines.findFirst({ where: { id, programId } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Rate card line not found");
  if (existing.status === "approved" || existing.status === "submitted") {
    throw new AppError(409, "INVALID_STATE", "Only draft or returned lines can be edited");
  }

  const data = lineWriteData(input);
  await assertActiveCategory(programId, data.resourceType);

  const updated = await prisma.rate_card_lines.update({
    where: { id },
    data: {
      ...data,
      status: existing.status === "returned" ? "draft" : existing.status,
      returnedComment: existing.status === "returned" ? null : existing.returnedComment,
    },
  });
  return serializeLine(updated);
}

async function deleteLine(user, id) {
  assertEdit(user);
  const programId = requireProgramId(user);
  const existing = await prisma.rate_card_lines.findFirst({ where: { id, programId } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Rate card line not found");
  if (existing.status !== "draft") {
    throw new AppError(409, "INVALID_STATE", "Only draft lines can be deleted");
  }
  await prisma.rate_card_lines.delete({ where: { id } });
  return { ok: true };
}

async function submitLines(user, input = {}) {
  assertEdit(user);
  const programId = requireProgramId(user);
  const ids = Array.isArray(input.ids) ? input.ids.filter(Boolean) : [];

  const where = { programId, status: "draft" };
  if (ids.length > 0) {
    where.id = { in: ids };
  }

  const drafts = await prisma.rate_card_lines.findMany({ where });
  if (drafts.length === 0) {
    throw new AppError(400, "NO_DRAFTS", ids.length ? "No matching draft lines to submit" : "No draft lines to submit");
  }

  if (ids.length > 0 && drafts.length !== ids.length) {
    throw new AppError(400, "INVALID_SELECTION", "Some selected lines are missing or not in draft status");
  }

  const missing = drafts.filter((row) => {
    const serialized = serializeLine(row);
    return serialized.flagged && !String(row.spxJustificationNote || "").trim();
  });
  if (missing.length > 0) {
    throw new AppError(400, "JUSTIFICATION_REQUIRED", "Flagged draft lines require an SPX justification note");
  }

  await prisma.rate_card_lines.updateMany({
    where: {
      programId,
      status: "draft",
      id: { in: drafts.map((d) => d.id) },
    },
    data: { status: "submitted", submittedAt: new Date() },
  });

  try {
    await notifications.notifyRateCardSubmitted(
      programId,
      drafts.length,
      `batch_${Date.now()}`,
    );
  } catch {
    // Notification failure must not block submit.
  }

  return { submitted: drafts.length };
}

async function approveLine(user, id) {
  assertDecide(user);
  const programId = requireProgramId(user);
  const existing = await prisma.rate_card_lines.findFirst({ where: { id, programId } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Rate card line not found");
  if (existing.status !== "submitted") {
    throw new AppError(409, "INVALID_STATE", "Only submitted lines can be approved");
  }
  const updated = await prisma.rate_card_lines.update({
    where: { id },
    data: { status: "approved", approvedAt: new Date() },
  });
  try {
    await notifications.notifyRateCardDecision(programId, existing, "approved", user.name);
  } catch {
    // ignore
  }
  return serializeLine(updated);
}

async function returnLine(user, id, comment) {
  assertDecide(user);
  if (!String(comment || "").trim()) {
    throw new AppError(400, "VALIDATION_ERROR", "A decision comment is required to return a line");
  }
  const programId = requireProgramId(user);
  const existing = await prisma.rate_card_lines.findFirst({ where: { id, programId } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Rate card line not found");
  if (existing.status !== "submitted") {
    throw new AppError(409, "INVALID_STATE", "Only submitted lines can be returned");
  }
  const updated = await prisma.rate_card_lines.update({
    where: { id },
    data: { status: "returned", returnedComment: String(comment).trim() },
  });
  try {
    await notifications.notifyRateCardDecision(programId, existing, "returned", user.name);
  } catch {
    // ignore
  }
  return serializeLine(updated);
}

module.exports = {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listLines,
  createLine,
  updateLine,
  deleteLine,
  submitLines,
  approveLine,
  returnLine,
  DEFAULT_CATEGORIES,
  computeVariance,
};
