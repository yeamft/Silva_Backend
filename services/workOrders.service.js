const AppError = require("../utils/AppError");
const prisma = require("../config/database");
const { uuid } = require("../utils/ids");
const { permissionsFor, isSpxRole, isVendorRole, isSilvaRole } = require("../utils/roles");
const { Prisma } = require("@prisma/client");
const notifications = require("./notifications.service");

const WO_TRANSITIONS = {
  draft: ["issued"],
  issued: ["in_progress", "draft"],
  in_progress: ["complete", "issued"],
  complete: ["closed"],
  closed: [],
};

const TICKET_TRANSITIONS = {
  draft: ["submitted"],
  submitted: ["vendor_reviewed", "rejected"],
  vendor_reviewed: ["validated", "rejected"],
  validated: [],
  rejected: ["draft"],
};

function requireProgramId(user) {
  if (!user.activeProgramId) {
    throw new AppError(400, "NO_ACTIVE_PROGRAM", "Select a workspace program first.");
  }
  return user.activeProgramId;
}

function hasPerm(user, key) {
  const perms = permissionsFor(user.role) || [];
  if (perms.includes(key) || perms.includes("work_orders.full")) return true;
  const cf = user.cropfortRoles || [];
  if (key.startsWith("work_orders") && (cf.includes("spx_validator") || cf.includes("spx_platform_admin") || cf.includes("field_supervisor"))) {
    return true;
  }
  if (key.startsWith("field_tickets") && (cf.includes("spx_validator") || cf.includes("field_supervisor") || cf.includes("bagro_office"))) {
    return true;
  }
  return false;
}

function assertWoRead(user) {
  if (
    hasPerm(user, "work_orders.read") ||
    hasPerm(user, "work_orders.read_own") ||
    hasPerm(user, "work_orders.create") ||
    hasPerm(user, "work_orders.issue") ||
    isSpxRole(user.role) ||
    isSilvaRole(user.role) ||
    user.role === "system_admin" ||
    isVendorRole(user.role)
  ) {
    return;
  }
  throw new AppError(403, "FORBIDDEN", "Insufficient permissions to view work orders");
}

function assertWoWrite(user) {
  if (
    hasPerm(user, "work_orders.create") ||
    hasPerm(user, "work_orders.issue") ||
    hasPerm(user, "work_orders.full") ||
    isSpxRole(user.role) ||
    user.role === "system_admin" ||
    user.role === "spx_platform_admin" ||
    user.role === "spx_validator"
  ) {
    return;
  }
  throw new AppError(403, "FORBIDDEN", "Insufficient permissions to mutate work orders");
}

function assertTicketWrite(user) {
  if (
    hasPerm(user, "field_tickets.create") ||
    hasPerm(user, "field_tickets.validate") ||
    hasPerm(user, "field_tickets.review") ||
    isSpxRole(user.role) ||
    isVendorRole(user.role) ||
    user.role === "system_admin"
  ) {
    return;
  }
  throw new AppError(403, "FORBIDDEN", "Insufficient permissions for field tickets");
}

function dec(n, scale = 2) {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return new Prisma.Decimal(v.toFixed(scale));
}

function num(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function recordAudit({ actorId, programId, entityType, entityId, action, before, after }) {
  await prisma.audit_log.create({
    data: {
      id: uuid("aud"),
      programId: programId || null,
      userId: actorId || null,
      entityType,
      entityId,
      action,
      oldValue: before ?? undefined,
      newValue: after ?? undefined,
    },
  });
}

async function nextWoCode(programId) {
  const year = new Date().getFullYear().toString().slice(-2);
  const count = await prisma.work_orders.count({ where: { programId } });
  return `WO-${year}${String(count + 1).padStart(4, "0")}`;
}

function serializeTicket(row) {
  return {
    id: row.id,
    programId: row.programId,
    workOrderId: row.workOrderId,
    submittedByUserId: row.submittedByUserId,
    submittedByName: row.users_field_tickets_submittedByUserIdTousers?.name || null,
    activityRecorded: row.activityRecorded,
    areaHa: num(row.areaHa) ?? 0,
    laborCount: row.laborCount,
    materialsUsed: row.materialsUsed || "",
    actualQuantity: num(row.actualQuantity),
    actualMandays: num(row.actualMandays),
    actualCostEtb: num(row.actualCostEtb),
    ticketDate: row.ticketDate.toISOString(),
    status: row.status,
    signedOff: Boolean(row.signedOff),
    signedOffAt: row.signedOffAt ? row.signedOffAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeWo(row) {
  const tickets = row.field_tickets || [];
  const blocks = (row.work_order_block_assignments || []).map((b) => ({
    blockId: b.blockId,
    blockCode: b.farm_blocks?.code || null,
    blockName: b.farm_blocks?.label || b.farm_blocks?.code || null,
  }));
  const primaryBlock = blocks[0];
  const vendor = row.vendors;
  const insuranceOnFile = Boolean(vendor?.insuranceOnFile);
  const insuranceExpiry = vendor?.insuranceExpiry
    ? vendor.insuranceExpiry.toISOString().slice(0, 10)
    : null;
  const insuranceExpired =
    insuranceExpiry != null && insuranceExpiry < new Date().toISOString().slice(0, 10);
  const insuranceGatePassed = !vendor
    ? true
    : insuranceOnFile && !insuranceExpired;
  let attention = null;
  if (vendor && !insuranceGatePassed && (row.status === "draft" || row.status === "issued")) {
    attention = "insurance";
  }
  return {
    id: row.id,
    programId: row.programId,
    afeId: row.afeId,
    cropfortAfeId: row.cropfortAfeId || null,
    code: row.code || row.id.slice(0, 10).toUpperCase(),
    title: row.title || row.activity,
    category: row.category,
    activity: row.activity,
    tier: row.tier,
    weekStart: row.weekStart,
    weekEnd: row.weekEnd,
    week: row.weekStart === row.weekEnd ? `W${row.weekStart}` : `W${row.weekStart}–${row.weekEnd}`,
    plannedCostEtb: num(row.plannedCostEtb) ?? 0,
    farmEstateId: row.farmEstateId,
    farmName: row.farm_estates?.name || null,
    instructions: row.instructions || "",
    assignedVendorId: row.assignedVendorId,
    vendorName: vendor?.name || null,
    insuranceOnFile: vendor ? insuranceOnFile : null,
    insuranceExpiry,
    insuranceGatePassed,
    attention,
    status: row.status === "closed" ? "complete" : row.status,
    statusRaw: row.status,
    blocks,
    block: primaryBlock?.blockName || primaryBlock?.blockCode || null,
    ticketsDone: tickets.filter((t) => t.status === "validated").length,
    ticketsTotal: tickets.length,
    tickets: tickets.map(serializeTicket),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const woInclude = {
  field_tickets: {
    include: {
      users_field_tickets_submittedByUserIdTousers: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  },
  work_order_block_assignments: {
    include: { farm_blocks: { select: { id: true, code: true, label: true } } },
  },
  vendors: {
    select: {
      id: true,
      name: true,
      insuranceOnFile: true,
      insuranceExpiry: true,
    },
  },
  farm_estates: { select: { id: true, name: true } },
};

async function loadWo(user, id) {
  const programId = requireProgramId(user);
  const row = await prisma.work_orders.findFirst({
    where: { id, programId },
    include: woInclude,
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Work order not found");
  return row;
}

exports.listWorkOrders = async (user, { status, farmEstateId } = {}) => {
  assertWoRead(user);
  const programId = requireProgramId(user);
  const where = { programId };
  if (status) where.status = status === "complete" ? { in: ["complete", "closed"] } : status;
  if (farmEstateId) where.farmEstateId = farmEstateId;

  if (isVendorRole(user.role) && hasPerm(user, "work_orders.read_own")) {
    const vendor = await prisma.vendors.findFirst({
      where: { organizationId: user.organizationId },
      select: { id: true },
    });
    if (vendor) {
      // Own WOs plus open (unassigned) WOs so field leads can pick up work.
      where.OR = [{ assignedVendorId: vendor.id }, { assignedVendorId: null }];
    }
    // If no vendor master record exists yet, do not collapse to an empty list.
  }

  const rows = await prisma.work_orders.findMany({
    where,
    include: woInclude,
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });
  return rows.map(serializeWo);
};

exports.getWorkOrder = async (user, id) => {
  assertWoRead(user);
  return serializeWo(await loadWo(user, id));
};

exports.createWorkOrder = async (user, body) => {
  assertWoWrite(user);
  const programId = requireProgramId(user);
  const activity = String(body.activity || body.title || "").trim();
  const category = String(body.category || "Core Operations").trim();
  if (!activity) throw new AppError(400, "VALIDATION_ERROR", "activity/title is required");

  const weekStart = Number(body.weekStart ?? body.week ?? 1);
  const weekEnd = Number(body.weekEnd ?? weekStart);
  if (!Number.isInteger(weekStart) || weekStart < 1 || weekStart > 53) {
    throw new AppError(400, "VALIDATION_ERROR", "weekStart must be 1–53");
  }

  let farmEstateId = body.farmEstateId || null;
  if (farmEstateId) {
    const farm = await prisma.farm_estates.findFirst({ where: { id: farmEstateId, programId } });
    if (!farm) throw new AppError(400, "VALIDATION_ERROR", "Farm estate not in active programme");
  }

  let assignedVendorId = body.assignedVendorId || null;
  if (assignedVendorId) {
    const vendor = await prisma.vendors.findFirst({
      where: {
        id: assignedVendorId,
        farm_estate_vendors: { some: { farm_estates: { programId } } },
      },
    });
    if (!vendor) throw new AppError(400, "VALIDATION_ERROR", "Vendor not linked to this programme");
  }

  if (body.afeId) {
    const afe = await prisma.afes.findFirst({ where: { id: body.afeId, programId } });
    if (!afe) throw new AppError(400, "VALIDATION_ERROR", "Legacy AFE not found in active programme");
  }

  let cropfortAfeId = body.cropfortAfeId || null;
  if (cropfortAfeId) {
    const cafe = await prisma.cropfort_afes.findFirst({
      where: { id: cropfortAfeId, programId, status: "approved" },
    });
    if (!cafe) {
      throw new AppError(400, "VALIDATION_ERROR", "Cropfort AFE must be approved and in this programme");
    }
  }

  const blockIds = Array.isArray(body.blockIds) ? body.blockIds : body.blockId ? [body.blockId] : [];
  if (blockIds.length) {
    const blocks = await prisma.farm_blocks.findMany({
      where: { id: { in: blockIds }, programId },
      select: { id: true },
    });
    if (blocks.length !== blockIds.length) {
      throw new AppError(400, "VALIDATION_ERROR", "One or more blocks are outside the active programme");
    }
  }

  const code = body.code ? String(body.code).trim() : await nextWoCode(programId);
  const created = await prisma.$transaction(async (tx) => {
    const wo = await tx.work_orders.create({
      data: {
        id: uuid("wo"),
        programId,
        afeId: body.afeId || null,
        cropfortAfeId,
        code,
        title: String(body.title || activity),
        category,
        activity,
        tier: body.tier || "retainer",
        weekStart,
        weekEnd: Number.isInteger(weekEnd) ? weekEnd : weekStart,
        plannedCostEtb: dec(body.plannedCostEtb ?? body.etb),
        farmEstateId,
        instructions: body.instructions != null ? String(body.instructions) : null,
        assignedVendorId,
        status: "draft",
        updatedAt: new Date(),
      },
    });
    if (blockIds.length) {
      await tx.work_order_block_assignments.createMany({
        data: blockIds.map((blockId) => ({
          id: uuid("wob"),
          workOrderId: wo.id,
          blockId,
        })),
      });
    }
    return tx.work_orders.findUnique({ where: { id: wo.id }, include: woInclude });
  });

  await recordAudit({
    actorId: user.id,
    programId,
    entityType: "work_order",
    entityId: created.id,
    action: "work_order.create",
    after: { code: created.code, status: created.status },
  });
  return serializeWo(created);
};

exports.updateWorkOrder = async (user, id, body) => {
  assertWoWrite(user);
  const existing = await loadWo(user, id);
  if (existing.status === "closed" || existing.status === "complete") {
    throw new AppError(409, "INVALID_STATE_TRANSITION", "Completed work orders cannot be edited");
  }

  const data = { updatedAt: new Date() };
  if (body.title != null) data.title = String(body.title);
  if (body.activity != null) data.activity = String(body.activity);
  if (body.category != null) data.category = String(body.category);
  if (body.instructions != null) data.instructions = String(body.instructions);
  if (body.plannedCostEtb != null || body.etb != null) data.plannedCostEtb = dec(body.plannedCostEtb ?? body.etb);
  if (body.weekStart != null) data.weekStart = Number(body.weekStart);
  if (body.weekEnd != null) data.weekEnd = Number(body.weekEnd);
  if (body.assignedVendorId !== undefined) {
    if (body.assignedVendorId) {
      const vendor = await prisma.vendors.findFirst({
        where: {
          id: body.assignedVendorId,
          farm_estate_vendors: { some: { farm_estates: { programId: existing.programId } } },
        },
      });
      if (!vendor) throw new AppError(400, "VALIDATION_ERROR", "Vendor not linked to this programme");
    }
    data.assignedVendorId = body.assignedVendorId || null;
  }

  const updated = await prisma.work_orders.update({
    where: { id },
    data,
    include: woInclude,
  });
  await recordAudit({
    actorId: user.id,
    programId: existing.programId,
    entityType: "work_order",
    entityId: id,
    action: "work_order.update",
    before: { status: existing.status },
    after: { status: updated.status },
  });
  return serializeWo(updated);
};

async function assertSchedule4Insurance(wo) {
  const vendorId = wo.assignedVendorId;
  if (!vendorId) return;
  const vendor =
    wo.vendors && wo.vendors.id === vendorId
      ? wo.vendors
      : await prisma.vendors.findUnique({
          where: { id: vendorId },
          select: { id: true, name: true, insuranceOnFile: true, insuranceExpiry: true },
        });
  if (!vendor) {
    throw new AppError(400, "VALIDATION_ERROR", "Assigned vendor not found for Schedule 4 check");
  }
  if (!vendor.insuranceOnFile) {
    throw new AppError(
      409,
      "SCHEDULE4_INSURANCE",
      `Schedule 4: ${vendor.name || "Vendor"} insurance is not on file — cannot issue work order`,
    );
  }
  if (vendor.insuranceExpiry) {
    const exp = vendor.insuranceExpiry.toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    if (exp < today) {
      throw new AppError(
        409,
        "SCHEDULE4_INSURANCE",
        `Schedule 4: ${vendor.name || "Vendor"} insurance expired on ${exp} — cannot issue work order`,
      );
    }
  }
}

exports.transitionWorkOrder = async (user, id, { status }) => {
  assertWoWrite(user);
  const existing = await loadWo(user, id);
  const next = String(status || "");
  const allowed = WO_TRANSITIONS[existing.status] || [];
  if (!allowed.includes(next)) {
    throw new AppError(
      409,
      "INVALID_STATE_TRANSITION",
      `Cannot move work order from ${existing.status} to ${next}`,
    );
  }
  if (next === "issued" && !hasPerm(user, "work_orders.issue") && !hasPerm(user, "work_orders.full") && !isSpxRole(user.role) && user.role !== "system_admin" && user.role !== "spx_platform_admin") {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions to issue work orders");
  }
  if (next === "issued") {
    await assertSchedule4Insurance(existing);
  }

  const updated = await prisma.work_orders.update({
    where: { id },
    data: { status: next, updatedAt: new Date() },
    include: woInclude,
  });
  await recordAudit({
    actorId: user.id,
    programId: existing.programId,
    entityType: "work_order",
    entityId: id,
    action: `work_order.${next}`,
    before: { status: existing.status },
    after: { status: next },
  });

  if (next === "issued") {
    try {
      await notifications.notifyWorkOrderIssued(existing.programId, serializeWo(updated));
    } catch (err) {
      console.error("[work-orders] notifyWorkOrderIssued failed:", err?.message || err);
    }
  }

  return serializeWo(updated);
};

exports.createFieldTicket = async (user, workOrderId, body) => {
  assertTicketWrite(user);
  let wo = await loadWo(user, workOrderId);
  if (wo.status === "closed") {
    throw new AppError(409, "INVALID_STATE_TRANSITION", "Cannot record execution against a closed work order");
  }
  if (wo.status === "draft") {
    await assertSchedule4Insurance(wo);
    await prisma.work_orders.update({
      where: { id: wo.id },
      data: { status: "issued", updatedAt: new Date() },
    });
    wo = { ...wo, status: "issued" };
  }

  const activityRecorded = String(body.activityRecorded || wo.activity).trim();
  const areaHa = Number(body.areaHa ?? 0);
  const laborCount = Number(body.laborCount ?? 0);
  const actualQuantity = body.actualQuantity != null ? Number(body.actualQuantity) : null;
  // Cost is server-derived when quantity present and WO has planned rate proxy.
  let actualCostEtb = null;
  if (actualQuantity != null && Number.isFinite(actualQuantity) && num(wo.plannedCostEtb) != null && wo.plannedCostEtb > 0) {
    // Without a unit rate on WO, leave null unless client sends nothing — never trust client cost.
    actualCostEtb = null;
  }
  if (body.unitRateEtb != null && actualQuantity != null) {
    const rate = Number(body.unitRateEtb);
    if (Number.isFinite(rate) && rate >= 0) {
      actualCostEtb = Math.round(actualQuantity * rate * 100) / 100;
    }
  }

  const created = await prisma.field_tickets.create({
    data: {
      id: uuid("ft"),
      programId: wo.programId,
      workOrderId: wo.id,
      submittedByUserId: user.id,
      activityRecorded,
      areaHa: dec(areaHa, 2) ?? new Prisma.Decimal(0),
      laborCount: Number.isInteger(laborCount) ? laborCount : 0,
      materialsUsed: String(body.materialsUsed || ""),
      actualQuantity: actualQuantity != null ? dec(actualQuantity, 2) : null,
      actualMandays: body.actualMandays != null ? dec(body.actualMandays, 2) : null,
      actualCostEtb: actualCostEtb != null ? dec(actualCostEtb, 2) : null,
      ticketDate: body.ticketDate ? new Date(body.ticketDate) : new Date(),
      status: "draft",
      updatedAt: new Date(),
    },
    include: {
      users_field_tickets_submittedByUserIdTousers: { select: { id: true, name: true } },
    },
  });

  if (wo.status === "issued") {
    await prisma.work_orders.update({
      where: { id: wo.id },
      data: { status: "in_progress", updatedAt: new Date() },
    });
  }

  // Link WO to vendor org when a vendor user is named on assign.
  const vendorUserId = body.vendorUserId ? String(body.vendorUserId) : null;
  if (vendorUserId) {
    const vendorUser = await prisma.users.findFirst({
      where: { id: vendorUserId },
      select: { organizationId: true },
    });
    if (vendorUser?.organizationId) {
      const vendor = await prisma.vendors.findFirst({
        where: { organizationId: vendorUser.organizationId },
        select: { id: true },
      });
      if (vendor) {
        await prisma.work_orders.update({
          where: { id: wo.id },
          data: { assignedVendorId: vendor.id, updatedAt: new Date() },
        });
      }
    }
  }

  await recordAudit({
    actorId: user.id,
    programId: wo.programId,
    entityType: "field_ticket",
    entityId: created.id,
    action: "field_ticket.create",
    after: { workOrderId: wo.id, status: created.status },
  });
  return serializeTicket(created);
};

exports.transitionFieldTicket = async (user, ticketId, { status, comment } = {}) => {
  assertTicketWrite(user);
  const programId = requireProgramId(user);
  const existing = await prisma.field_tickets.findFirst({
    where: { id: ticketId, programId },
    include: {
      users_field_tickets_submittedByUserIdTousers: { select: { id: true, name: true } },
      work_orders: true,
    },
  });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Field ticket not found");

  const next = String(status || "");
  const allowed = TICKET_TRANSITIONS[existing.status] || [];
  if (!allowed.includes(next)) {
    throw new AppError(
      409,
      "INVALID_STATE_TRANSITION",
      `Cannot move ticket from ${existing.status} to ${next}`,
    );
  }

  if (next === "validated" && !hasPerm(user, "field_tickets.validate") && !isSpxRole(user.role) && user.role !== "system_admin" && user.role !== "spx_platform_admin") {
    throw new AppError(403, "FORBIDDEN", "Only SPX validators can validate tickets");
  }

  const data = {
    status: next,
    updatedAt: new Date(),
  };
  if (next === "validated") {
    data.signedOff = true;
    data.signedOffByUserId = user.id;
    data.signedOffAt = new Date();
  }
  if (next === "rejected" && comment) {
    data.materialsUsed = `${existing.materialsUsed || ""}\nReturn: ${String(comment).trim()}`.trim();
  }

  const updated = await prisma.field_tickets.update({
    where: { id: ticketId },
    data,
    include: {
      users_field_tickets_submittedByUserIdTousers: { select: { id: true, name: true } },
    },
  });

  await recordAudit({
    actorId: user.id,
    programId,
    entityType: "field_ticket",
    entityId: ticketId,
    action: `field_ticket.${next}`,
    before: { status: existing.status },
    after: { status: next, comment: comment || null },
  });

  try {
    await notifications.notifyFieldTicketStatus(
      programId,
      { ...updated, submittedByUserId: existing.submittedByUserId },
      next,
      user.name,
    );
  } catch (err) {
    console.error("[work-orders] notifyFieldTicketStatus failed:", err?.message || err);
  }

  return serializeTicket(updated);
};

exports.listFieldTickets = async (user, { workOrderId, status } = {}) => {
  assertWoRead(user);
  const programId = requireProgramId(user);
  const where = { programId };
  if (workOrderId) where.workOrderId = workOrderId;
  if (status) where.status = status;
  const rows = await prisma.field_tickets.findMany({
    where,
    include: {
      users_field_tickets_submittedByUserIdTousers: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(serializeTicket);
};
