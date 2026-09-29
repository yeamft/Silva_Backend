const AppError = require("../utils/AppError");
const prisma = require("../config/database");
const { uuid } = require("../utils/ids");
const { loadFarmForUser, requireProgramId, num } = require("../utils/farmRateAccess");
const { assertView, assertEdit, assertDecide } = require("../utils/modularRateAccess");
const { isSpxRole, isAssetOwnerApprover } = require("../utils/roles");
const { Prisma } = require("@prisma/client");
const notifications = require("./notifications.service");

const PLAN_MONTHS = [
  "oct",
  "nov",
  "dec",
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
];

const EDITABLE = new Set(["draft", "returned", "ready_for_review"]);
const SUBMITTABLE = new Set(["draft", "returned", "ready_for_review"]);

function dec(n, scale = 2) {
  const v = Number(n);
  if (!Number.isFinite(v)) return new Prisma.Decimal(0);
  return new Prisma.Decimal(v.toFixed(scale));
}

function emptyIntensities() {
  return Object.fromEntries(PLAN_MONTHS.map((m) => [m, "none"]));
}

function normalizeIntensities(raw) {
  const base = emptyIntensities();
  if (!raw || typeof raw !== "object") return base;
  for (const m of PLAN_MONTHS) {
    const v = raw[m];
    if (v === "none" || v === "light" || v === "active" || v === "peak") base[m] = v;
  }
  return base;
}

function isScheduled(intensities) {
  return PLAN_MONTHS.some((m) => intensities[m] && intensities[m] !== "none");
}

function mapStatusToFe(status) {
  if (status === "ready_for_review") return "finalized";
  if (status === "submitted") return "submitted";
  if (status === "approved" || status === "active") return "submitted";
  if (status === "returned") return "draft";
  if (status === "archived" || status === "closed") return "submitted";
  return "draft";
}

function mapStatusFromFe(status) {
  if (status === "finalized") return "ready_for_review";
  if (status === "submitted") return "submitted";
  return "draft";
}

/** Durable AFP promotion derived from programme plan status (no separate table). */
function promotionsFromPlan(plan) {
  const raw = plan.status;
  if (!["submitted", "approved", "active", "returned"].includes(raw)) return [];
  const metrics = summaryMetrics(plan);
  const totalEtb = metrics.plannedCostEtb;
  const band = plan.resolvedBand || "B";
  const createdAt = plan.submittedAt || plan.updatedAt || plan.createdAt || new Date();
  const createdAtIso = createdAt instanceof Date ? createdAt.toISOString() : String(createdAt);
  let status = "pending_silva";
  let note = plan.approvalRequirement || "";
  if (raw === "approved" || raw === "active") {
    const sameActor =
      plan.submittedByUserId &&
      plan.reviewedByUserId &&
      plan.submittedByUserId === plan.reviewedByUserId;
    status = sameActor ? "auto_approved" : "approved";
    note = plan.approvalRequirement || `Band ${band}: approved.`;
  } else if (raw === "returned") {
    status = "returned";
    note = plan.returnedComment || plan.approvalRequirement || `Band ${band}: returned.`;
  } else {
    note = plan.approvalRequirement || `Band ${band}: awaiting Silva.`;
  }
  return [
    {
      id: `afpp-${plan.id}`,
      planId: plan.id,
      totalEtb,
      band,
      status,
      createdAt: createdAtIso,
      note,
    },
  ];
}

function summaryMetrics(plan) {
  const lines = plan.lines || [];
  const included = lines.filter((l) => l.included);
  const scheduled = included.filter((l) => isScheduled(normalizeIntensities(l.intensities)));
  const validRates = included.filter((l) => l.rateStatus === "VALID" && num(l.unitRateEtb) != null);
  const plannedCost =
    num(plan.plannedCostEtb) ||
    included.reduce((s, l) => s + (num(l.plannedCostEtb) ?? 0), 0);
  return {
    includedCount: included.length,
    totalLines: lines.length,
    scheduledCount: scheduled.length,
    ratesOkCount: validRates.length,
    plannedCostEtb: plannedCost,
  };
}

function defaultPlanName(farmName, planYear, budgetYearLabel) {
  const farm = String(farmName || "").trim();
  const label = String(budgetYearLabel || "").trim();
  if (farm && label) return `${farm} — ${label}`;
  if (farm) return `${farm} — ${planYear} Programme`;
  return `${planYear} Programme Plan`;
}

function makePlanCode() {
  return `PP-${Date.now().toString(36).slice(-6).toUpperCase()}`;
}

async function recordAudit({ actorId, programId, entityId, action, before, after }) {
  await prisma.audit_log.create({
    data: {
      id: uuid("aud"),
      programId: programId || null,
      userId: actorId || null,
      entityType: "programme_plan",
      entityId,
      action,
      oldValue: before ?? undefined,
      newValue: after ?? undefined,
    },
  });
}

function resolveBandFromProgram(program, costEtb) {
  const cost = Number(costEtb) || 0;
  const aMax = num(program.cropfortAfeBandAMaxEtb) ?? 500000;
  const bMax = num(program.cropfortAfeBandBMaxEtb) ?? 2000000;
  const cMax = num(program.cropfortAfeBandCMaxEtb) ?? 5000000;
  let band = "D";
  if (cost <= aMax) band = "A";
  else if (cost <= bMax) band = "B";
  else if (cost <= cMax) band = "C";
  const silvaGate = band === "C" || band === "D";
  return {
    band,
    thresholdExceeded: silvaGate,
    approvalLevel: silvaGate ? "silva" : "spx",
    approvalRequirement: silvaGate
      ? `Band ${band}: requires Silva gate (above ETB ${bMax.toLocaleString()})`
      : `Band ${band}: SPX can approve / auto-route`,
    thresholds: { aMax, bMax, cMax },
  };
}

function lineJson(line) {
  const intensities = normalizeIntensities(line.intensities);
  const qty = num(line.plannedQty) ?? 0;
  const rate = num(line.unitRateEtb);
  return {
    id: line.id,
    category: line.category,
    activityId: line.activityId,
    activityCode: line.activityCode,
    activityName: line.activityName,
    uom: line.uom,
    scope: line.scope === "off_block" ? "off_block" : "block",
    included: Boolean(line.included),
    plannedQty: qty,
    blockAllocations: Array.isArray(line.blockAllocations) ? line.blockAllocations : [],
    agreedRate:
      rate != null
        ? {
            rateCardId: line.rateCardId || "",
            unitRateEtb: rate,
            costKind: line.rateSource || "labor",
            normMdPerUnit: null,
            approvedAt: null,
          }
        : null,
    plannedCost: num(line.plannedCostEtb) ?? 0,
    intensities,
    manualsRef: line.manualsRef || "",
    serviceType: line.serviceType || "core_ops",
    rateStatus: line.rateStatus,
    notes: line.notes || null,
  };
}

function planJson(plan) {
  const lines = (plan.lines || []).slice().sort((a, b) => a.sortOrder - b.sortOrder || a.activityCode.localeCompare(b.activityCode));
  const activities = {};
  const activityIds = [];
  for (const line of lines) {
    activityIds.push(line.id);
    activities[line.id] = lineJson(line);
  }
  const metrics = summaryMetrics(plan);
  const farmName = plan.farm_estates?.name || "";
  const name =
    String(plan.name || "").trim() ||
    defaultPlanName(farmName, plan.planYear, plan.budgetYearLabel);
  return {
    id: plan.id,
    name,
    code: plan.code || "",
    description: plan.description || "",
    planningCycleLabel: plan.planningCycleLabel || `${plan.planYear} Programme`,
    farmEstateId: plan.farmEstateId,
    farmName,
    budgetYearGc: plan.planYear,
    budgetYearLabel: plan.budgetYearLabel || "",
    programBandSetId: plan.programBandSetId,
    totalHa: num(plan.totalHa) ?? 0,
    vendorLabel: plan.vendorLabel || "",
    notes: plan.notes || "",
    status: mapStatusToFe(plan.status),
    statusRaw: plan.status,
    applicableBlockIds: plan.applicableBlockIds || [],
    activityIds,
    activities,
    promotions: promotionsFromPlan(plan),
    plannedCostEtb: metrics.plannedCostEtb,
    resolvedBand: plan.resolvedBand,
    approvalRequirement: plan.approvalRequirement,
    returnedComment: plan.returnedComment,
    submittedAt: plan.submittedAt ? plan.submittedAt.toISOString() : null,
    reviewedAt: plan.reviewedAt ? plan.reviewedAt.toISOString() : null,
    archivedAt: plan.archivedAt ? plan.archivedAt.toISOString() : null,
    includedCount: metrics.includedCount,
    scheduledCount: metrics.scheduledCount,
    ratesOkCount: metrics.ratesOkCount,
    totalLines: metrics.totalLines,
    updatedAt: plan.updatedAt.toISOString(),
    createdAt: plan.createdAt.toISOString(),
  };
}

async function loadPlanScoped(user, planId) {
  assertView(user);
  const programId = requireProgramId(user);
  const plan = await prisma.cropfort_programme_plans.findFirst({
    where: { id: planId, programId },
    include: {
      lines: true,
      farm_estates: { select: { id: true, name: true } },
      programs: true,
    },
  });
  if (!plan) throw new AppError(404, "NOT_FOUND", "Programme plan not found");
  return plan;
}

function assertCanEditPlan(user, plan) {
  assertEdit(user);
  if (!EDITABLE.has(plan.status)) {
    throw new AppError(
      409,
      "INVALID_STATE_TRANSITION",
      `Plan in status ${plan.status} cannot be edited`,
    );
  }
}

function computeLineCost(qty, unitRate) {
  const q = Number(qty) || 0;
  const r = unitRate == null ? null : Number(unitRate);
  if (r == null || !Number.isFinite(r)) return { cost: 0, rateStatus: "MISSING" };
  return { cost: Math.round(q * r * 100) / 100, rateStatus: "VALID" };
}

function buildReadiness(plan) {
  const lines = plan.lines || [];
  const included = lines.filter((l) => l.included);
  const missingRates = included.filter((l) => l.rateStatus !== "VALID" || num(l.unitRateEtb) == null);
  const validRates = included.filter((l) => l.rateStatus === "VALID" && num(l.unitRateEtb) != null);
  const unscheduled = included.filter((l) => !isScheduled(normalizeIntensities(l.intensities)));
  const scheduled = included.filter((l) => isScheduled(normalizeIntensities(l.intensities)));
  const missingQty = included.filter((l) => (num(l.plannedQty) ?? 0) <= 0);
  const missingManuals = included.filter((l) => !(l.manualsRef || "").trim());
  const totalCost = included.reduce((s, l) => s + (num(l.plannedCostEtb) ?? 0), 0);
  const bandInfo = resolveBandFromProgram(plan.programs || plan.program || {}, totalCost);

  const blockers = [];
  if (included.length === 0) blockers.push({ code: "NO_ACTIVITIES", message: "Include at least one activity line" });
  if (missingRates.length)
    blockers.push({
      code: "MISSING_RATES",
      message: `${missingRates.length} included line(s) missing approved rates`,
      activityIds: missingRates.map((l) => l.activityId),
    });
  if (missingQty.length)
    blockers.push({
      code: "MISSING_QTY",
      message: `${missingQty.length} included line(s) have zero quantity`,
    });
  if (unscheduled.length)
    blockers.push({
      code: "UNSCHEDULED",
      message: `${unscheduled.length} included line(s) are not scheduled`,
    });
  if (missingManuals.length)
    blockers.push({
      code: "MISSING_MANUALS",
      message: `${missingManuals.length} included line(s) missing operating manuals (RB09.3)`,
    });
  if (totalCost <= 0) blockers.push({ code: "ZERO_COST", message: "Plan has no planned cost" });

  const warnings = [];
  if (bandInfo.thresholdExceeded) {
    warnings.push({
      code: "SILVA_GATE",
      message: bandInfo.approvalRequirement,
    });
  }

  return {
    canSubmit: blockers.length === 0,
    blockers,
    warnings,
    metrics: {
      totalActivityLines: lines.length,
      includedLines: included.length,
      missingRates: missingRates.length,
      validRates: validRates.length,
      unscheduledActivities: unscheduled.length,
      scheduledActivities: scheduled.length,
      missingQty: missingQty.length,
      missingManuals: missingManuals.length,
      totalPlannedCost: totalCost,
      band: bandInfo.band,
      approvalLevel: bandInfo.approvalLevel,
      approvalRequirement: bandInfo.approvalRequirement,
      thresholdExceeded: bandInfo.thresholdExceeded,
    },
  };
}

exports.createPlan = async (user, body) => {
  assertEdit(user);
  const programId = requireProgramId(user);
  const year = Number(body.planYear);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new AppError(400, "VALIDATION_ERROR", "planYear must be a valid GC year");
  }
  const farm = await loadFarmForUser(user, body.farmEstateId);
  const name = String(body.name || "").trim();
  if (!name) throw new AppError(400, "VALIDATION_ERROR", "Programme plan name is required");

  const blocks = await prisma.farm_blocks.findMany({
    where: { programId, farmEstateId: farm.id, status: "active" },
    select: { id: true },
  });
  const blockIds = Array.isArray(body.applicableBlockIds) && body.applicableBlockIds.length
    ? body.applicableBlockIds.filter((id) => blocks.some((b) => b.id === id))
    : blocks.map((b) => b.id);

  const ecStart = year - 8;
  const ecEnd = year - 7;
  const budgetYearLabel =
    String(body.budgetYearLabel || "").trim() ||
    `${ecStart}/${String(ecEnd).slice(-2)} EC (${year - 1}/${String(year).slice(-2)} GC)`;
  const planningCycleLabel =
    String(body.planningCycleLabel || "").trim() || `${year} Programme`;

  const existing = await prisma.cropfort_programme_plans.findFirst({
    where: { programId, farmEstateId: farm.id, planYear: year },
    select: { id: true, name: true, status: true },
  });
  if (existing) {
    throw new AppError(
      409,
      "CONFLICT",
      `A programme plan already exists for this farm and ${year} (${existing.name}). Open it instead of creating another.`,
    );
  }

  const plan = await prisma.cropfort_programme_plans.create({
    data: {
      id: uuid("pplan"),
      programId,
      farmEstateId: farm.id,
      planYear: year,
      name,
      code: String(body.code || "").trim() || makePlanCode(),
      description: String(body.description || "").trim(),
      planningCycleLabel,
      budgetYearLabel,
      status: "draft",
      notes: String(body.notes || "").trim() || null,
      vendorLabel: String(body.vendorLabel || "").trim(),
      totalHa: farm.totalAreaHa,
      applicableBlockIds: blockIds,
      createdByUserId: user.id,
    },
    include: {
      lines: true,
      farm_estates: { select: { id: true, name: true } },
      programs: true,
    },
  });

  await recordAudit({
    actorId: user.id,
    programId,
    entityId: plan.id,
    action: "programme_plan.create",
    after: {
      name,
      farmEstateId: farm.id,
      planYear: year,
      planningCycleLabel,
    },
  });

  return planJson(plan);
};

/** Backward-compatible: return latest plan for farm+year, or create a named default. */
exports.getOrCreatePlan = async (user, { farmEstateId, planYear, name }) => {
  assertView(user);
  const programId = requireProgramId(user);
  const year = Number(planYear);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new AppError(400, "VALIDATION_ERROR", "planYear must be a valid GC year");
  }
  const farm = await loadFarmForUser(user, farmEstateId);

  let plan = await prisma.cropfort_programme_plans.findFirst({
    where: {
      programId,
      farmEstateId: farm.id,
      planYear: year,
      status: { not: "archived" },
    },
    include: {
      lines: true,
      farm_estates: { select: { id: true, name: true } },
      programs: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!plan) {
    return exports.createPlan(user, {
      farmEstateId: farm.id,
      planYear: year,
      name:
        String(name || "").trim() ||
        defaultPlanName(farm.name, year, ""),
    });
  }

  return planJson(plan);
};

exports.getPlan = async (user, planId) => {
  const plan = await loadPlanScoped(user, planId);
  return planJson(plan);
};

exports.upsertPlan = async (user, planId, body) => {
  const plan = await loadPlanScoped(user, planId);
  if (plan.status === "archived" || plan.status === "closed") {
    throw new AppError(409, "INVALID_STATE_TRANSITION", "Archived or closed plans are read-only");
  }
  assertCanEditPlan(user, plan);

  const meta = {};
  if (body.name != null) {
    const n = String(body.name).trim();
    if (!n) throw new AppError(400, "VALIDATION_ERROR", "Programme plan name is required");
    meta.name = n;
  }
  if (body.description != null) meta.description = String(body.description);
  if (body.planningCycleLabel != null) meta.planningCycleLabel = String(body.planningCycleLabel);
  if (body.notes != null) meta.notes = String(body.notes);
  if (body.vendorLabel != null) meta.vendorLabel = String(body.vendorLabel);
  if (body.budgetYearLabel != null) meta.budgetYearLabel = String(body.budgetYearLabel);
  if (body.programBandSetId !== undefined) meta.programBandSetId = body.programBandSetId;
  if (body.totalHa != null) meta.totalHa = dec(body.totalHa, 2);
  if (Array.isArray(body.applicableBlockIds)) {
    const blocks = await prisma.farm_blocks.findMany({
      where: {
        id: { in: body.applicableBlockIds },
        programId: plan.programId,
        farmEstateId: plan.farmEstateId,
      },
      select: { id: true },
    });
    if (blocks.length !== body.applicableBlockIds.length) {
      throw new AppError(400, "VALIDATION_ERROR", "One or more blocks do not belong to this farm estate");
    }
    meta.applicableBlockIds = blocks.map((b) => b.id);
  }
  if (body.status === "finalized" || body.status === "ready_for_review") {
    meta.status = "ready_for_review";
  } else if (body.status === "draft") {
    meta.status = "draft";
  }

  const incomingLines = Array.isArray(body.lines) ? body.lines : Array.isArray(body.activities) ? Object.values(body.activities) : null;

  const updated = await prisma.$transaction(async (tx) => {
    if (incomingLines) {
      const activityIds = [...new Set(incomingLines.map((l) => String(l.activityId || "").trim()).filter(Boolean))];
      const activities = await tx.activities.findMany({ where: { id: { in: activityIds } } });
      const byId = new Map(activities.map((a) => [a.id, a]));
      for (const aid of activityIds) {
        if (!byId.has(aid)) throw new AppError(400, "VALIDATION_ERROR", `Unknown activity ${aid}`);
      }

      await tx.cropfort_programme_plan_lines.deleteMany({ where: { planId: plan.id } });

      let total = 0;
      let sortOrder = 0;
      for (const raw of incomingLines) {
        const activity = byId.get(String(raw.activityId));
        const qty = Math.max(0, Number(raw.plannedQty) || 0);
        const rate =
          raw.agreedRate?.unitRateEtb != null
            ? Number(raw.agreedRate.unitRateEtb)
            : raw.unitRateEtb != null
              ? Number(raw.unitRateEtb)
              : null;
        const included = Boolean(raw.included);
        const { cost, rateStatus } = included
          ? computeLineCost(qty, rate)
          : { cost: 0, rateStatus: rate != null ? "VALID" : "MISSING" };
        if (included) total += cost;
        const intensities = normalizeIntensities(raw.intensities);
        await tx.cropfort_programme_plan_lines.create({
          data: {
            id: String(raw.id || "").startsWith("pline_") || String(raw.id || "").startsWith("copact_")
              ? String(raw.id)
              : uuid("pline"),
            planId: plan.id,
            activityId: activity.id,
            activityCode: String(raw.activityCode || activity.name).slice(0, 64),
            activityName: String(raw.activityName || activity.name),
            category: String(raw.category || activity.category || ""),
            uom: String(raw.uom || activity.unitOfMeasure || ""),
            scope: raw.scope === "off_block" ? "off_block" : "block",
            included,
            plannedQty: dec(qty, 4),
            unitRateEtb: rate != null ? dec(rate, 4) : null,
            rateCardId: raw.agreedRate?.rateCardId || raw.rateCardId || null,
            rateSource: raw.agreedRate?.costKind || raw.rateSource || null,
            rateStatus: raw.rateStatus === "OVERRIDDEN" ? "OVERRIDDEN" : rateStatus,
            plannedCostEtb: dec(cost, 2),
            intensities,
            blockAllocations: Array.isArray(raw.blockAllocations) ? raw.blockAllocations : [],
            manualsRef: String(raw.manualsRef || ""),
            serviceType: String(raw.serviceType || "core_ops"),
            notes: raw.notes != null ? String(raw.notes) : null,
            sortOrder: sortOrder++,
          },
        });
      }
      const bandInfo = resolveBandFromProgram(plan.programs, total);
      meta.plannedCostEtb = dec(total, 2);
      meta.resolvedBand = bandInfo.band;
      meta.approvalRequirement = bandInfo.approvalRequirement;
    }

    return tx.cropfort_programme_plans.update({
      where: { id: plan.id },
      data: meta,
      include: {
        lines: true,
        farm_estates: { select: { id: true, name: true } },
        programs: true,
      },
    });
  });

  await recordAudit({
    actorId: user.id,
    programId: plan.programId,
    entityId: plan.id,
    action: "programme_plan.upsert",
    before: { status: plan.status, plannedCostEtb: num(plan.plannedCostEtb) },
    after: { status: updated.status, plannedCostEtb: num(updated.plannedCostEtb) },
  });

  return planJson(updated);
};

exports.patchSchedule = async (user, planId, body) => {
  const plan = await loadPlanScoped(user, planId);
  assertCanEditPlan(user, plan);
  const patches = Array.isArray(body.lines) ? body.lines : [];
  if (!patches.length) throw new AppError(400, "VALIDATION_ERROR", "lines required");

  await prisma.$transaction(async (tx) => {
    for (const p of patches) {
      const lineId = String(p.id || p.lineId || "");
      if (!lineId) continue;
      const line = plan.lines.find((l) => l.id === lineId);
      if (!line) throw new AppError(404, "NOT_FOUND", `Line ${lineId} not on this plan`);
      const intensities = normalizeIntensities({
        ...normalizeIntensities(line.intensities),
        ...(p.intensities || {}),
      });
      if (p.from && p.to && p.intensity) {
        const fromIdx = PLAN_MONTHS.indexOf(p.from);
        const toIdx = PLAN_MONTHS.indexOf(p.to);
        if (fromIdx >= 0 && toIdx >= 0) {
          const lo = Math.min(fromIdx, toIdx);
          const hi = Math.max(fromIdx, toIdx);
          for (let i = lo; i <= hi; i++) intensities[PLAN_MONTHS[i]] = p.intensity;
        }
      }
      await tx.cropfort_programme_plan_lines.update({
        where: { id: line.id },
        data: { intensities },
      });
    }
    if (plan.status === "ready_for_review") {
      await tx.cropfort_programme_plans.update({
        where: { id: plan.id },
        data: { status: "draft" },
      });
    }
  });

  const fresh = await loadPlanScoped(user, planId);
  await recordAudit({
    actorId: user.id,
    programId: plan.programId,
    entityId: plan.id,
    action: "programme_plan.schedule",
    after: { lines: patches.length },
  });
  return planJson(fresh);
};

exports.getReadiness = async (user, planId) => {
  const plan = await loadPlanScoped(user, planId);
  return buildReadiness(plan);
};

exports.submitPlan = async (user, planId) => {
  assertEdit(user);
  const plan = await loadPlanScoped(user, planId);
  if (!SUBMITTABLE.has(plan.status)) {
    throw new AppError(409, "INVALID_STATE_TRANSITION", `Cannot submit from ${plan.status}`);
  }
  const readiness = buildReadiness(plan);
  if (!readiness.canSubmit) {
    throw new AppError(400, "NOT_READY", "Programme plan is not ready to submit", readiness.blockers);
  }

  const bandInfo = resolveBandFromProgram(plan.programs, readiness.metrics.totalPlannedCost);
  const autoApprove = !bandInfo.thresholdExceeded && (isSpxRole(user.role) || user.role === "spx_platform_admin" || user.role === "spx_validator");

  const updated = await prisma.cropfort_programme_plans.update({
    where: { id: plan.id },
    data: {
      status: autoApprove ? "approved" : "submitted",
      plannedCostEtb: dec(readiness.metrics.totalPlannedCost, 2),
      resolvedBand: bandInfo.band,
      approvalRequirement: bandInfo.approvalRequirement,
      submittedAt: new Date(),
      submittedByUserId: user.id,
      ...(autoApprove
        ? { reviewedAt: new Date(), reviewedByUserId: user.id, returnedComment: null }
        : {}),
    },
    include: {
      lines: true,
      farm_estates: { select: { id: true, name: true } },
      programs: true,
    },
  });

  await recordAudit({
    actorId: user.id,
    programId: plan.programId,
    entityId: plan.id,
    action: autoApprove ? "programme_plan.auto_approve" : "programme_plan.submit",
    before: { status: plan.status },
    after: {
      status: updated.status,
      band: bandInfo.band,
      plannedCostEtb: readiness.metrics.totalPlannedCost,
    },
  });

  const planPayload = planJson(updated);

  if (!autoApprove) {
    try {
      await notifications.notifyProgrammePlanSubmitted(plan.programId, {
        ...planPayload,
        submittedByUserId: updated.submittedByUserId,
        createdByUserId: updated.createdByUserId || plan.createdByUserId,
      });
    } catch (err) {
      console.error("[programme-plans] notifyProgrammePlanSubmitted failed:", err?.message || err);
    }
  }

  return {
    plan: planPayload,
    readiness,
    band: bandInfo,
    promotion: planPayload.promotions[0] || {
      id: `afpp-${updated.id}`,
      planId: updated.id,
      totalEtb: readiness.metrics.totalPlannedCost,
      band: bandInfo.band,
      status: autoApprove ? "auto_approved" : "pending_silva",
      createdAt: new Date().toISOString(),
      note: bandInfo.approvalRequirement,
    },
  };
};

exports.decidePlan = async (user, planId, { decision, comment }) => {
  assertDecide(user);
  const plan = await loadPlanScoped(user, planId);
  if (plan.status !== "submitted") {
    throw new AppError(409, "INVALID_STATE_TRANSITION", `Cannot decide plan in ${plan.status}`);
  }
  if (!isAssetOwnerApprover(user)) {
    throw new AppError(403, "FORBIDDEN", "Only Silva / asset owners can decide submitted plans");
  }

  const d = String(decision || "").toLowerCase();
  if (d !== "approve" && d !== "return") {
    throw new AppError(400, "VALIDATION_ERROR", "decision must be approve or return");
  }
  if (d === "return" && !String(comment || "").trim()) {
    throw new AppError(400, "VALIDATION_ERROR", "Return reason is required");
  }

  const updated = await prisma.cropfort_programme_plans.update({
    where: { id: plan.id },
    data: {
      status: d === "approve" ? "approved" : "returned",
      reviewedAt: new Date(),
      reviewedByUserId: user.id,
      returnedComment: d === "return" ? String(comment).trim() : null,
    },
    include: {
      lines: true,
      farm_estates: { select: { id: true, name: true } },
      programs: true,
    },
  });

  await recordAudit({
    actorId: user.id,
    programId: plan.programId,
    entityId: plan.id,
    action: d === "approve" ? "programme_plan.approve" : "programme_plan.return",
    before: { status: plan.status },
    after: { status: updated.status, comment: comment || null },
  });

  const payload = planJson(updated);
  try {
    await notifications.notifyProgrammePlanDecision(
      plan.programId,
      {
        ...payload,
        submittedByUserId: updated.submittedByUserId || plan.submittedByUserId,
        createdByUserId: updated.createdByUserId || plan.createdByUserId,
      },
      d,
      user.name,
    );
  } catch (err) {
    console.error("[programme-plans] notifyProgrammePlanDecision failed:", err?.message || err);
  }

  return payload;
};

exports.listPlans = async (user, { farmEstateId, planYear, status, q, includeArchived } = {}) => {
  assertView(user);
  const programId = requireProgramId(user);
  const where = { programId };
  if (!includeArchived && status !== "archived") {
    where.status = status ? status : { not: "archived" };
  } else if (status) {
    where.status = status;
  }
  if (farmEstateId) {
    await loadFarmForUser(user, farmEstateId);
    where.farmEstateId = farmEstateId;
  }
  if (planYear) where.planYear = Number(planYear);
  if (q && String(q).trim()) {
    const term = String(q).trim();
    where.OR = [
      { name: { contains: term, mode: "insensitive" } },
      { code: { contains: term, mode: "insensitive" } },
      { description: { contains: term, mode: "insensitive" } },
    ];
  }

  const rows = await prisma.cropfort_programme_plans.findMany({
    where,
    include: {
      lines: true,
      farm_estates: { select: { id: true, name: true } },
      programs: true,
    },
    orderBy: [{ planYear: "desc" }, { updatedAt: "desc" }],
  });
  return rows.map(planJson);
};

exports.duplicatePlan = async (user, planId) => {
  assertEdit(user);
  const source = await loadPlanScoped(user, planId);
  const copy = await prisma.$transaction(async (tx) => {
    const created = await tx.cropfort_programme_plans.create({
      data: {
        id: uuid("pplan"),
        programId: source.programId,
        farmEstateId: source.farmEstateId,
        planYear: source.planYear,
        name: `${String(source.name || "Programme plan").trim()} (copy)`,
        code: makePlanCode(),
        description: source.description || "",
        planningCycleLabel: source.planningCycleLabel || `${source.planYear} Programme`,
        budgetYearLabel: source.budgetYearLabel || "",
        status: "draft",
        notes: source.notes,
        totalHa: source.totalHa,
        vendorLabel: source.vendorLabel || "",
        programBandSetId: source.programBandSetId,
        applicableBlockIds: source.applicableBlockIds || [],
        plannedCostEtb: source.plannedCostEtb,
        createdByUserId: user.id,
      },
    });

    if (source.lines?.length) {
      await tx.cropfort_programme_plan_lines.createMany({
        data: source.lines.map((l, i) => ({
          id: uuid("pline"),
          planId: created.id,
          activityId: l.activityId,
          activityCode: l.activityCode,
          activityName: l.activityName,
          category: l.category || "",
          uom: l.uom || "",
          scope: l.scope || "block",
          included: l.included,
          plannedQty: l.plannedQty,
          unitRateEtb: l.unitRateEtb,
          rateCardId: l.rateCardId,
          rateSource: l.rateSource,
          rateStatus: l.rateStatus,
          plannedCostEtb: l.plannedCostEtb,
          intensities: l.intensities || {},
          blockAllocations: l.blockAllocations || [],
          manualsRef: l.manualsRef || "",
          serviceType: l.serviceType || "core_ops",
          notes: l.notes,
          sortOrder: i,
        })),
      });
    }

    return tx.cropfort_programme_plans.findFirst({
      where: { id: created.id },
      include: {
        lines: true,
        farm_estates: { select: { id: true, name: true } },
        programs: true,
      },
    });
  });

  await recordAudit({
    actorId: user.id,
    programId: source.programId,
    entityId: copy.id,
    action: "programme_plan.duplicate",
    after: { sourceId: source.id, name: copy.name },
  });

  return planJson(copy);
};

exports.archivePlan = async (user, planId) => {
  assertEdit(user);
  const plan = await loadPlanScoped(user, planId);
  if (plan.status === "archived") {
    throw new AppError(409, "INVALID_STATE_TRANSITION", "Plan is already archived");
  }
  if (plan.status === "submitted") {
    throw new AppError(
      409,
      "INVALID_STATE_TRANSITION",
      "Decide submitted plans before archiving",
    );
  }
  const updated = await prisma.cropfort_programme_plans.update({
    where: { id: plan.id },
    data: { status: "archived", archivedAt: new Date() },
    include: {
      lines: true,
      farm_estates: { select: { id: true, name: true } },
      programs: true,
    },
  });
  await recordAudit({
    actorId: user.id,
    programId: plan.programId,
    entityId: plan.id,
    action: "programme_plan.archive",
    before: { status: plan.status },
    after: { status: "archived" },
  });
  return planJson(updated);
};

exports.mapStatusFromFe = mapStatusFromFe;
exports.buildReadiness = buildReadiness;
exports.resolveBandFromProgram = resolveBandFromProgram;
