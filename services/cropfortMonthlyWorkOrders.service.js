const AppError = require("../utils/AppError");
const prisma = require("../config/database");
const { uuid } = require("../utils/ids");
const { permissionsFor, isSpxRole, isSilvaRole, isVendorRole, isAssetOwnerApprover } = require("../utils/roles");
const { Prisma } = require("@prisma/client");
const workOrders = require("./workOrders.service");

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
    cf.includes("field_supervisor") ||
    cf.includes("bagro_office")
  );
}

function assertRead(user) {
  const perms = permissionsFor(user.role) || [];
  if (
    perms.includes("work_orders.read") ||
    hasCf(user) ||
    isSpxRole(user.role) ||
    isSilvaRole(user.role) ||
    isVendorRole(user.role) ||
    ["system_admin", "spx_platform_admin", "spx_validator", "farm_owner", "field_supervisor", "vendor", "vendor_ops"].includes(
      user.role,
    )
  ) {
    return;
  }
  throw new AppError(403, "FORBIDDEN", "Insufficient permissions to view monthly work orders");
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
  throw new AppError(403, "FORBIDDEN", "Insufficient permissions to mutate monthly work orders");
}

function assertDecide(user) {
  if (isAssetOwnerApprover(user)) return;
  throw new AppError(403, "FORBIDDEN", "Only Silva / asset owners can decide monthly work orders");
}

function num(v) {
  if (v == null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function serializeLine(row) {
  return {
    id: row.id,
    activityId: row.activityId || "",
    activityCode: row.activityCode || "",
    activityName: row.activityName,
    blockId: row.blockId || "",
    blockCode: row.blockCode || "",
    plannedQty: num(row.plannedQty),
    unit: row.unit || "",
    etb: num(row.etb),
    manualsRef: row.manualsRef || "",
    inPlan: Boolean(row.inPlan),
  };
}

function serialize(row) {
  const lines = (row.lines || []).map(serializeLine);
  return {
    id: row.id,
    code: row.code,
    farmId: row.farmId || "",
    farmName: row.farmName || "",
    programId: row.programId,
    ethiopianMonth: row.ethiopianMonth,
    yearGc: row.yearGc,
    status: row.status,
    lines,
    sourcePlanId: row.sourcePlanId,
    outOfPlanReason: row.outOfPlanReason || "",
    loop: row.loop || "none",
    totalEtb: num(row.totalEtb) || lines.reduce((s, l) => s + l.etb, 0),
    lastMonthInsights: row.lastMonthInsights || "",
    structuredInsights: row.structuredInsightsJson || null,
    recommendedAdjustments: Array.isArray(row.recommendedAdjustmentsJson)
      ? row.recommendedAdjustmentsJson
      : [],
    note: row.note || "",
    returnedComment: row.returnedComment || null,
    submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    activatedAt: row.activatedAt ? row.activatedAt.toISOString() : null,
    createdByUserId: row.createdByUserId,
    createdByName: row.users?.name || null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const INCLUDE = {
  lines: { orderBy: { sortOrder: "asc" } },
  users: { select: { id: true, name: true } },
};

async function load(user, id) {
  const programId = requireProgramId(user);
  const row = await prisma.cropfort_monthly_work_orders.findFirst({
    where: { id, programId },
    include: INCLUDE,
  });
  if (!row) throw new AppError(404, "NOT_FOUND", "Monthly work order not found");
  return row;
}

function normalizeLines(lines) {
  if (!Array.isArray(lines) || !lines.length) {
    throw new AppError(400, "VALIDATION_ERROR", "At least one line is required");
  }
  return lines.map((l, i) => {
    const activityName = String(l.activityName || "").trim();
    if (!activityName) {
      throw new AppError(400, "VALIDATION_ERROR", `Line ${i + 1}: activityName is required`);
    }
    return {
      id: uuid("ml"),
      activityId: l.activityId || null,
      activityCode: String(l.activityCode || "").trim(),
      activityName,
      blockId: l.blockId || null,
      blockCode: String(l.blockCode || "").trim(),
      plannedQty: new Prisma.Decimal(num(l.plannedQty).toFixed(2)),
      unit: String(l.unit || "").trim(),
      etb: new Prisma.Decimal(num(l.etb).toFixed(2)),
      manualsRef: String(l.manualsRef || "").trim(),
      inPlan: l.inPlan !== false,
      sortOrder: i,
      updatedAt: new Date(),
    };
  });
}

exports.listMonthlyWorkOrders = async (user, { status } = {}) => {
  assertRead(user);
  const programId = requireProgramId(user);
  const where = { programId };
  if (status) where.status = status;
  const rows = await prisma.cropfort_monthly_work_orders.findMany({
    where,
    include: INCLUDE,
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(serialize);
};

exports.getMonthlyWorkOrder = async (user, id) => {
  assertRead(user);
  return serialize(await load(user, id));
};

exports.createMonthlyWorkOrder = async (user, body) => {
  assertWrite(user);
  const programId = requireProgramId(user);
  const ethiopianMonth = String(body.ethiopianMonth || "").trim();
  const yearGc = Number(body.yearGc);
  if (!ethiopianMonth) throw new AppError(400, "VALIDATION_ERROR", "ethiopianMonth is required");
  if (!Number.isInteger(yearGc) || yearGc < 2000) {
    throw new AppError(400, "VALIDATION_ERROR", "yearGc must be a valid year");
  }

  const lineData = normalizeLines(body.lines || []);
  const totalEtb = lineData.reduce((s, l) => s + num(l.etb), 0);
  const code =
    String(body.code || "").trim() ||
    `MWO-${String(yearGc).slice(2)}${ethiopianMonth.slice(0, 3).toUpperCase()}-${Date.now().toString(36).slice(-4).toUpperCase()}`;

  const existing = await prisma.cropfort_monthly_work_orders.findFirst({
    where: { programId, code },
  });
  if (existing) throw new AppError(409, "ALREADY_EXISTS", `Code ${code} already exists`);

  const now = new Date();
  const created = await prisma.cropfort_monthly_work_orders.create({
    data: {
      id: uuid("mwo"),
      programId,
      code,
      farmId: body.farmId || null,
      farmName: String(body.farmName || "").trim(),
      ethiopianMonth,
      yearGc,
      status: "draft",
      sourcePlanId: body.sourcePlanId || null,
      outOfPlanReason: String(body.outOfPlanReason || "").trim(),
      loop: body.loop || "none",
      totalEtb: new Prisma.Decimal(totalEtb.toFixed(2)),
      lastMonthInsights: String(body.lastMonthInsights || "").trim(),
      structuredInsightsJson: body.structuredInsights || null,
      recommendedAdjustmentsJson: body.recommendedAdjustments || [],
      note: String(body.note || "").trim(),
      createdByUserId: user.id,
      updatedAt: now,
      lines: { create: lineData },
    },
    include: INCLUDE,
  });
  return serialize(created);
};

exports.submitMonthlyWorkOrder = async (user, id) => {
  assertWrite(user);
  const existing = await load(user, id);
  if (existing.status !== "draft" && existing.status !== "returned") {
    throw new AppError(400, "INVALID_STATUS", "Only draft or returned monthly WOs can be submitted");
  }
  const now = new Date();
  const updated = await prisma.cropfort_monthly_work_orders.update({
    where: { id },
    data: {
      status: "submitted",
      submittedAt: now,
      returnedComment: null,
      updatedAt: now,
    },
    include: INCLUDE,
  });
  return serialize(updated);
};

exports.decideMonthlyWorkOrder = async (user, id, body) => {
  assertDecide(user);
  const existing = await load(user, id);
  if (existing.status !== "submitted") {
    throw new AppError(400, "INVALID_STATUS", "Only submitted monthly WOs can be decided");
  }
  const decision = body.decision;
  if (decision !== "approve" && decision !== "return") {
    throw new AppError(400, "VALIDATION_ERROR", "decision must be approve or return");
  }
  if (decision === "return" && !String(body.comment || "").trim()) {
    throw new AppError(400, "VALIDATION_ERROR", "comment is required when returning");
  }
  const now = new Date();
  const updated = await prisma.cropfort_monthly_work_orders.update({
    where: { id },
    data:
      decision === "approve"
        ? {
            status: "approved",
            approvedAt: now,
            returnedComment: null,
            note: body.comment ? String(body.comment).trim() : existing.note,
            updatedAt: now,
          }
        : {
            status: "returned",
            returnedComment: String(body.comment).trim(),
            note: String(body.comment).trim(),
            updatedAt: now,
          },
    include: INCLUDE,
  });
  return serialize(updated);
};

/** First day of each Ethiopian month in the GC calendar (Meskerem 1 = 11 Sep; months are 30 days). */
const EC_MONTH_START = {
  oct: [10, 11], nov: [11, 10], dec: [12, 10], jan: [1, 9], feb: [2, 8], mar: [3, 10],
  apr: [4, 9], may: [5, 9], jun: [6, 8], jul: [7, 8], aug: [8, 7], sep: [9, 11],
};
const EC_MONTH_NAME = {
  oct: "Tikimt", nov: "Hidar", dec: "Tahsas", jan: "Tir", feb: "Yekatit", mar: "Megabit",
  apr: "Miyazya", may: "Ginbot", jun: "Sene", jul: "Hamle", aug: "Nehase", sep: "Meskerem",
};

function weekOfYear(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.min(53, Math.max(1, Math.ceil(((date.getTime() - start) / 86400000 + 1) / 7)));
}

/** Week numbers the Ethiopian month covers, for the work order's week range. */
function monthWeeks(month, yearGc) {
  const [m, d] = EC_MONTH_START[month] || [1, 1];
  const first = new Date(Date.UTC(yearGc, m - 1, d));
  const last = new Date(first.getTime() + 29 * 86400000);
  const weekStart = weekOfYear(first);
  // Tahsas runs into January; keep the range inside the starting year
  const weekEnd = last.getUTCFullYear() === first.getUTCFullYear() ? weekOfYear(last) : 53;
  return { weekStart, weekEnd };
}

/**
 * Activating a monthly work order issues its work: one work order per line, with the farm area,
 * block, vendor and the month's weeks filled in. Lines already turned into work orders are skipped,
 * so a retry after a partial failure doesn't duplicate them.
 */
exports.activateMonthlyWorkOrder = async (user, id) => {
  assertWrite(user);
  const existing = await load(user, id);
  if (existing.status !== "approved" && existing.status !== "submitted") {
    throw new AppError(400, "INVALID_STATUS", "Approve the monthly WO before activating");
  }

  const programId = existing.programId;
  const vendorLink = existing.farmId
    ? await prisma.farm_estate_vendors.findFirst({
        where: { farmEstateId: existing.farmId },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        select: { vendorId: true },
      })
    : null;
  const { weekStart, weekEnd } = monthWeeks(existing.ethiopianMonth, existing.yearGc);
  const monthLabel = `${EC_MONTH_NAME[existing.ethiopianMonth] || existing.ethiopianMonth} ${existing.yearGc}`;

  const lines = (existing.lines || []).filter((l) => num(l.etb) > 0 || num(l.plannedQty) > 0);
  const titleFor = (l) => [l.activityName, l.blockCode, monthLabel].filter(Boolean).join(" · ");
  const already = await prisma.work_orders.findMany({
    where: { programId, title: { in: lines.map(titleFor) } },
    select: { title: true },
  });
  const done = new Set(already.map((w) => w.title));

  let issued = 0;
  const heldBack = [];
  for (const line of lines) {
    const title = titleFor(line);
    if (done.has(title)) continue;
    const payload = {
      title,
      activity: line.activityName,
      plannedCostEtb: num(line.etb),
      weekStart,
      weekEnd,
      farmEstateId: existing.farmId || undefined,
      assignedVendorId: vendorLink?.vendorId || undefined,
      instructions:
        [`${num(line.plannedQty)} ${line.unit || ""}`.trim(), line.manualsRef, `From ${existing.code}`]
          .filter(Boolean)
          .join(" · "),
      blockId: line.blockId || undefined,
    };
    let wo;
    try {
      wo = await workOrders.createWorkOrder(user, payload);
    } catch (err) {
      // Lines can carry a block that has since left the programme map
      if (!payload.blockId) throw err;
      wo = await workOrders.createWorkOrder(user, { ...payload, blockId: undefined });
    }
    try {
      await workOrders.transitionWorkOrder(user, wo.id, { status: "issued" });
      issued += 1;
    } catch (err) {
      // e.g. the vendor's insurance isn't on file — the order waits as a draft
      heldBack.push(`${wo.code}: ${err?.message || "could not issue"}`);
    }
  }

  const now = new Date();
  const summary = `Issued ${issued} work order${issued === 1 ? "" : "s"}${
    heldBack.length ? `; ${heldBack.length} kept as draft (${heldBack.join("; ")})` : ""
  }`;
  const updated = await prisma.cropfort_monthly_work_orders.update({
    where: { id },
    data: {
      status: "active",
      activatedAt: now,
      note: existing.note ? `${existing.note}\n${summary}` : summary,
      updatedAt: now,
    },
    include: INCLUDE,
  });
  return { ...serialize(updated), issuedCount: issued, heldBack };
};

exports.setMonthlyWorkOrderLoop = async (user, id, loop) => {
  assertWrite(user);
  await load(user, id);
  const updated = await prisma.cropfort_monthly_work_orders.update({
    where: { id },
    data: { loop: String(loop || "none"), updatedAt: new Date() },
    include: INCLUDE,
  });
  return serialize(updated);
};

exports.addOutOfPlanLine = async (user, id, body) => {
  assertWrite(user);
  const existing = await load(user, id);
  if (existing.status !== "draft" && existing.status !== "returned") {
    throw new AppError(400, "INVALID_STATUS", "Out-of-plan lines can only be added in draft or returned");
  }
  const activityName = String(body.activityName || "").trim();
  if (!activityName) {
    throw new AppError(400, "VALIDATION_ERROR", "activityName is required");
  }
  const reason = String(body.reason || "").trim();
  if (!reason) {
    throw new AppError(400, "VALIDATION_ERROR", "reason is required for out-of-plan lines");
  }

  const sortOrder = (existing.lines || []).length;
  const etb = num(body.etb);
  const now = new Date();
  const reasonNote = existing.outOfPlanReason
    ? `${existing.outOfPlanReason}\n• ${activityName}: ${reason}`
    : `• ${activityName}: ${reason}`;

  await prisma.cropfort_monthly_wo_lines.create({
    data: {
      id: uuid("ml"),
      monthlyWoId: id,
      activityId: body.activityId || null,
      activityCode: String(body.activityCode || "").trim(),
      activityName,
      blockId: body.blockId || null,
      blockCode: String(body.blockCode || "").trim(),
      plannedQty: new Prisma.Decimal(num(body.plannedQty).toFixed(2)),
      unit: String(body.unit || "").trim(),
      etb: new Prisma.Decimal(etb.toFixed(2)),
      manualsRef: String(body.manualsRef || "").trim(),
      inPlan: false,
      sortOrder,
      updatedAt: now,
    },
  });

  const updated = await prisma.cropfort_monthly_work_orders.update({
    where: { id },
    data: {
      outOfPlanReason: reasonNote,
      totalEtb: new Prisma.Decimal((num(existing.totalEtb) + etb).toFixed(2)),
      updatedAt: now,
    },
    include: INCLUDE,
  });
  return serialize(updated);
};

const PLAN_MONTHS = ["oct", "nov", "dec", "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep"];
/** Same weights the monthly work order screen uses to spread a plan line over its scheduled months. */
const INTENSITY_SHARE = { peak: 0.4, active: 0.25, light: 0.1 };
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Turn an approved Core Operations plan into one monthly work order per scheduled month.
 * The asset owner already approved the plan, so the orders start approved and SPX activates them.
 * Months that already have an order from this plan are skipped, so it is safe to run again.
 */
function assertSpxDesk(user) {
  const cf = user.cropfortRoles || [];
  if (
    isSpxRole(user.role) ||
    ["system_admin", "spx_platform_admin", "spx_validator"].includes(user.role) ||
    cf.includes("spx_validator") ||
    cf.includes("spx_platform_admin")
  ) {
    return;
  }
  throw new AppError(403, "FORBIDDEN", "Only the SPX desk can create work orders from a plan");
}

exports.createFromPlan = async (user, planId) => {
  assertSpxDesk(user);
  const programId = requireProgramId(user);
  const plan = await prisma.cropfort_programme_plans.findFirst({
    where: { id: planId, programId },
    include: { lines: { orderBy: { sortOrder: "asc" } }, farm_estates: { select: { id: true, name: true } } },
  });
  if (!plan) throw new AppError(404, "NOT_FOUND", "Programme plan not found");
  if (plan.status !== "approved" && plan.status !== "active") {
    throw new AppError(409, "INVALID_STATE_TRANSITION", "Only approved plans can be turned into work orders");
  }

  const blocks = plan.applicableBlockIds?.length
    ? await prisma.farm_blocks.findMany({ where: { id: { in: plan.applicableBlockIds } }, select: { id: true, code: true } })
    : [];
  const defaultBlock = blocks[0] || null;

  const existing = await prisma.cropfort_monthly_work_orders.findMany({
    where: { programId, sourcePlanId: plan.id },
    select: { ethiopianMonth: true },
  });
  const done = new Set(existing.map((e) => e.ethiopianMonth));

  const included = plan.lines.filter((l) => l.included);
  const created = [];
  const skipped = [];
  const now = new Date();

  for (const month of PLAN_MONTHS) {
    if (done.has(month)) {
      skipped.push(month);
      continue;
    }
    const lines = [];
    for (const line of included) {
      const intensities = line.intensities || {};
      const share = INTENSITY_SHARE[intensities[month]] || 0;
      if (!share) continue;
      const totalWeight = PLAN_MONTHS.reduce((s, m) => s + (INTENSITY_SHARE[intensities[m]] || 0), 0) || 1;
      const monthShare = share / totalWeight;
      const qty = num(line.plannedQty) * (num(line.frequency) || 1) * monthShare;
      const cost = num(line.plannedCostEtb) * monthShare;
      if (qty <= 0) continue;

      const allocations = Array.isArray(line.blockAllocations) && line.blockAllocations.length
        ? line.blockAllocations
        : line.scope === "off_block" || !defaultBlock
          ? [{ blockId: null, blockCode: "", qty: 1 }]
          : [{ blockId: defaultBlock.id, blockCode: defaultBlock.code, qty: 1 }];
      const allocTotal = allocations.reduce((s, a) => s + num(a.qty), 0) || 1;
      for (const alloc of allocations) {
        const part = num(alloc.qty) / allocTotal;
        if (part <= 0) continue;
        lines.push({
          activityId: line.activityId,
          activityCode: line.activityCode,
          activityName: line.activityName,
          blockId: alloc.blockId || null,
          blockCode: alloc.blockCode || "",
          plannedQty: round2(qty * part),
          unit: line.uom,
          etb: round2(cost * part),
          manualsRef: line.manualsRef || "",
          inPlan: true,
        });
      }
    }
    if (!lines.length) continue;

    const lineData = normalizeLines(lines);
    const totalEtb = lineData.reduce((s, l) => s + num(l.etb), 0);
    // Plan year is the GC year the budget ends in: Tikimt–Tahsas fall in the year before
    const yearGc = ["oct", "nov", "dec"].includes(month) ? plan.planYear - 1 : plan.planYear;
    const code = `MWO-${plan.code || plan.id.slice(-6).toUpperCase()}-${month.toUpperCase()}`;

    const row = await prisma.cropfort_monthly_work_orders.create({
      data: {
        id: uuid("mwo"),
        programId,
        code,
        farmId: plan.farmEstateId,
        farmName: plan.farm_estates?.name || "",
        ethiopianMonth: month,
        yearGc,
        status: "approved",
        approvedAt: now,
        sourcePlanId: plan.id,
        totalEtb: new Prisma.Decimal(totalEtb.toFixed(2)),
        note: `From approved plan ${plan.name || plan.code}`,
        createdByUserId: user.id,
        updatedAt: now,
        lines: { create: lineData },
      },
      include: INCLUDE,
    });
    created.push(serialize(row));
  }

  return { created, skipped };
};
