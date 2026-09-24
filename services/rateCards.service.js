const AppError = require("../utils/AppError");
const prisma = require("../config/database");
const { uuid } = require("../utils/ids");
const {
  assertView,
  assertEdit,
  assertDecide,
  requireProgramId,
} = require("../utils/modularRateAccess");

const EDITABLE = new Set(["draft", "rejected"]);
const lineInclude = {
  labor_activity: true,
  equipment_resource: true,
  material: true,
};

function dateOnly(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function serializeLine(row) {
  const ref =
    row.labor_activity || row.equipment_resource || row.material || null;
  return {
    id: row.id,
    rateCardId: row.rateCardId,
    category: row.category,
    laborActivityId: row.laborActivityId,
    equipmentResourceId: row.equipmentResourceId,
    materialId: row.materialId,
    resourceId: ref?.id || null,
    resourceName: ref?.name || null,
    unit: row.unit,
    rate: Number(row.rate),
    overtimeMultiplier: row.overtimeMultiplier != null ? Number(row.overtimeMultiplier) : null,
    minimumQty: row.minimumQty != null ? Number(row.minimumQty) : null,
    notes: row.notes || null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeCard(row) {
  return {
    id: row.id,
    programId: row.programId,
    name: row.name,
    status: row.status,
    effectiveDate: dateOnly(row.effectiveDate),
    endDate: dateOnly(row.endDate),
    currency: row.currency,
    createdByUserId: row.createdByUserId,
    approvedByUserId: row.approvedByUserId || null,
    lineItemCount: row._count?.line_items ?? row.line_items?.length ?? undefined,
    lineItems: row.line_items ? row.line_items.map(serializeLine) : undefined,
    approvalLog: row.approval_log
      ? row.approval_log.map((l) => ({
          id: l.id,
          action: l.action,
          actorUserId: l.actorUserId,
          actorName: l.actor?.name || null,
          comment: l.comment || null,
          createdAt: l.createdAt.toISOString(),
        }))
      : undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function assertEditable(card) {
  if (!EDITABLE.has(card.status)) {
    throw new AppError(409, "INVALID_STATE", `Cannot edit a rate card in status “${card.status}”.`);
  }
}

function resolveRefs(category, input) {
  const laborActivityId = input.laborActivityId || null;
  const equipmentResourceId = input.equipmentResourceId || null;
  const materialId = input.materialId || null;
  const set = [laborActivityId, equipmentResourceId, materialId].filter(Boolean);
  if (set.length !== 1) {
    throw new AppError(400, "VALIDATION_ERROR", "Exactly one catalog reference is required.");
  }
  if (category === "labor" && !laborActivityId) {
    throw new AppError(400, "VALIDATION_ERROR", "laborActivityId required for labor lines.");
  }
  if (category === "equipment" && !equipmentResourceId) {
    throw new AppError(400, "VALIDATION_ERROR", "equipmentResourceId required for equipment lines.");
  }
  if (category === "material" && !materialId) {
    throw new AppError(400, "VALIDATION_ERROR", "materialId required for material lines.");
  }
  return { laborActivityId, equipmentResourceId, materialId };
}

async function loadCard(programId, id, { withLines = false, withLog = false } = {}) {
  const card = await prisma.rate_cards.findFirst({
    where: { id, programId },
    include: {
      _count: { select: { line_items: true } },
      ...(withLines ? { line_items: { include: lineInclude, orderBy: { createdAt: "asc" } } } : {}),
      ...(withLog
        ? {
            approval_log: {
              include: { actor: { select: { id: true, name: true } } },
              orderBy: { createdAt: "desc" },
            },
          }
        : {}),
    },
  });
  if (!card) throw new AppError(404, "NOT_FOUND", "Rate card not found");
  return card;
}

async function logAction(tx, rateCardId, action, actorUserId, comment) {
  await tx.rate_card_approval_log.create({
    data: {
      id: uuid("rcal"),
      rateCardId,
      action,
      actorUserId,
      comment: comment || null,
    },
  });
}

exports.list = async (user, query = {}) => {
  assertView(user);
  const programId = requireProgramId(user);
  const where = { programId };
  if (query.status && query.status !== "all") where.status = String(query.status);

  const rows = await prisma.rate_cards.findMany({
    where,
    include: { _count: { select: { line_items: true } } },
    orderBy: [{ effectiveDate: "desc" }, { updatedAt: "desc" }],
  });
  return rows.map(serializeCard);
};

exports.get = async (user, id) => {
  assertView(user);
  const programId = requireProgramId(user);
  const card = await loadCard(programId, id, { withLines: true, withLog: true });
  return serializeCard(card);
};

exports.create = async (user, input) => {
  assertEdit(user);
  const programId = requireProgramId(user);
  const name = String(input.name || "").trim();
  if (!name) throw new AppError(400, "VALIDATION_ERROR", "Name is required");
  const effectiveDate = input.effectiveDate ? new Date(input.effectiveDate) : new Date();
  if (Number.isNaN(effectiveDate.getTime())) {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid effective date");
  }
  let endDate = null;
  if (input.endDate) {
    endDate = new Date(input.endDate);
    if (Number.isNaN(endDate.getTime())) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid end date");
    }
    if (endDate < effectiveDate) {
      throw new AppError(400, "VALIDATION_ERROR", "End date must be on or after the effective date");
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    const card = await tx.rate_cards.create({
      data: {
        id: uuid("rcd"),
        programId,
        name,
        status: "draft",
        effectiveDate,
        endDate,
        currency: input.currency || "ETB",
        createdByUserId: user.id,
      },
    });
    await logAction(tx, card.id, "created", user.id, null);
    return card;
  });

  return exports.get(user, created.id);
};

exports.update = async (user, id, input) => {
  assertEdit(user);
  const programId = requireProgramId(user);
  const existing = await loadCard(programId, id);
  assertEditable(existing);

  const nextEffective =
    input.effectiveDate != null ? new Date(input.effectiveDate) : existing.effectiveDate;
  if (Number.isNaN(nextEffective.getTime())) {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid effective date");
  }
  let nextEnd = existing.endDate;
  if (input.endDate === null) nextEnd = null;
  else if (input.endDate != null) {
    nextEnd = new Date(input.endDate);
    if (Number.isNaN(nextEnd.getTime())) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid end date");
    }
  }
  if (nextEnd && nextEnd < nextEffective) {
    throw new AppError(400, "VALIDATION_ERROR", "End date must be on or after the effective date");
  }

  await prisma.rate_cards.update({
    where: { id },
    data: {
      name: input.name != null ? String(input.name).trim() : undefined,
      effectiveDate: input.effectiveDate ? nextEffective : undefined,
      endDate:
        input.endDate === null ? null : input.endDate ? nextEnd : undefined,
      currency: input.currency != null ? String(input.currency) : undefined,
    },
  });
  return exports.get(user, id);
};

exports.addLineItem = async (user, cardId, input) => {
  assertEdit(user);
  const programId = requireProgramId(user);
  const card = await loadCard(programId, cardId);
  assertEditable(card);

  const category = input.category;
  if (!["labor", "equipment", "material"].includes(category)) {
    throw new AppError(400, "VALIDATION_ERROR", "Invalid category");
  }
  const refs = resolveRefs(category, input);
  const rate = Number(input.rate);
  if (!Number.isFinite(rate) || rate < 0) {
    throw new AppError(400, "VALIDATION_ERROR", "Rate must be a non-negative number");
  }

  let unit = String(input.unit || "").trim();
  if (category === "labor") {
    const ref = await prisma.labor_activities.findFirst({
      where: { id: refs.laborActivityId, programId, isActive: true },
    });
    if (!ref) throw new AppError(404, "NOT_FOUND", "Labor activity not found");
    if (!unit) unit = ref.defaultUnit;
  } else if (category === "equipment") {
    const ref = await prisma.equipment_resources.findFirst({
      where: { id: refs.equipmentResourceId, programId, isActive: true },
    });
    if (!ref) throw new AppError(404, "NOT_FOUND", "Equipment resource not found");
    if (!unit) unit = ref.defaultUnit;
  } else {
    const ref = await prisma.materials.findFirst({
      where: { id: refs.materialId, programId, isActive: true },
    });
    if (!ref) throw new AppError(404, "NOT_FOUND", "Material not found");
    if (!unit) unit = ref.defaultUnit;
  }

  const created = await prisma.rate_card_line_items.create({
    data: {
      id: uuid("rcli"),
      rateCardId: cardId,
      category,
      ...refs,
      unit,
      rate,
      overtimeMultiplier: input.overtimeMultiplier != null ? Number(input.overtimeMultiplier) : null,
      minimumQty: input.minimumQty != null ? Number(input.minimumQty) : null,
      notes: input.notes?.trim() || null,
    },
    include: lineInclude,
  });
  return serializeLine(created);
};

exports.updateLineItem = async (user, cardId, lineId, input) => {
  assertEdit(user);
  const programId = requireProgramId(user);
  const card = await loadCard(programId, cardId);
  assertEditable(card);

  const existing = await prisma.rate_card_line_items.findFirst({
    where: { id: lineId, rateCardId: cardId },
  });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Line item not found");

  const category = input.category || existing.category;
  const refs =
    input.laborActivityId || input.equipmentResourceId || input.materialId || input.category
      ? resolveRefs(category, {
          laborActivityId: input.laborActivityId ?? existing.laborActivityId,
          equipmentResourceId: input.equipmentResourceId ?? existing.equipmentResourceId,
          materialId: input.materialId ?? existing.materialId,
        })
      : {
          laborActivityId: existing.laborActivityId,
          equipmentResourceId: existing.equipmentResourceId,
          materialId: existing.materialId,
        };

  const updated = await prisma.rate_card_line_items.update({
    where: { id: lineId },
    data: {
      category,
      ...refs,
      unit: input.unit != null ? String(input.unit).trim() : undefined,
      rate: input.rate != null ? Number(input.rate) : undefined,
      overtimeMultiplier:
        input.overtimeMultiplier !== undefined
          ? input.overtimeMultiplier == null
            ? null
            : Number(input.overtimeMultiplier)
          : undefined,
      minimumQty:
        input.minimumQty !== undefined
          ? input.minimumQty == null
            ? null
            : Number(input.minimumQty)
          : undefined,
      notes: input.notes !== undefined ? input.notes?.trim() || null : undefined,
    },
    include: lineInclude,
  });
  return serializeLine(updated);
};

exports.deleteLineItem = async (user, cardId, lineId) => {
  assertEdit(user);
  const programId = requireProgramId(user);
  const card = await loadCard(programId, cardId);
  assertEditable(card);

  const existing = await prisma.rate_card_line_items.findFirst({
    where: { id: lineId, rateCardId: cardId },
  });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Line item not found");
  await prisma.rate_card_line_items.delete({ where: { id: lineId } });
  return { id: lineId, deleted: true };
};

async function transition(user, id, { from, to, action, comment, requireDecide, setApprover }) {
  if (requireDecide) assertDecide(user);
  else assertEdit(user);

  const programId = requireProgramId(user);
  const card = await loadCard(programId, id);
  const allowedFrom = Array.isArray(from) ? from : [from];
  if (!allowedFrom.includes(card.status)) {
    throw new AppError(
      409,
      "INVALID_STATE",
      `Cannot ${action} from status “${card.status}”.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.rate_cards.update({
      where: { id },
      data: {
        status: to,
        ...(setApprover ? { approvedByUserId: user.id } : {}),
        ...(to === "rejected" || to === "draft" ? { approvedByUserId: null } : {}),
      },
    });
    await logAction(tx, id, action, user.id, comment);
  });

  return exports.get(user, id);
}

exports.submit = (user, id) =>
  transition(user, id, { from: ["draft", "rejected"], to: "submitted", action: "submitted" });

exports.approve = (user, id) =>
  transition(user, id, {
    from: "submitted",
    to: "approved",
    action: "approved",
    requireDecide: true,
    setApprover: true,
  });

exports.reject = (user, id, input = {}) => {
  if (!input.comment?.trim()) {
    throw new AppError(400, "VALIDATION_ERROR", "Comment is required to reject");
  }
  return transition(user, id, {
    from: "submitted",
    to: "rejected",
    action: "rejected",
    comment: input.comment.trim(),
    requireDecide: true,
  });
};

exports.publish = (user, id) =>
  transition(user, id, {
    from: "approved",
    to: "published",
    action: "published",
    requireDecide: true,
  });

exports.archive = (user, id) =>
  transition(user, id, {
    from: ["published", "approved", "rejected", "draft"],
    to: "archived",
    action: "archived",
  });

exports.restore = (user, id) =>
  transition(user, id, {
    from: "archived",
    to: "draft",
    action: "restored",
  });

exports.summary = async (user) => {
  assertView(user);
  const programId = requireProgramId(user);
  const groups = await prisma.rate_cards.groupBy({
    by: ["status"],
    where: { programId },
    _count: { _all: true },
  });
  const byStatus = Object.fromEntries(groups.map((g) => [g.status, g._count._all]));
  return {
    total: groups.reduce((s, g) => s + g._count._all, 0),
    draft: byStatus.draft || 0,
    submitted: byStatus.submitted || 0,
    approved: byStatus.approved || 0,
    rejected: byStatus.rejected || 0,
    published: byStatus.published || 0,
    archived: byStatus.archived || 0,
    pendingApproval: byStatus.submitted || 0,
    active: (byStatus.published || 0) + (byStatus.approved || 0),
  };
};
