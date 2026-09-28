const { z } = require("zod");

const login = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
const refresh = z.object({ refreshToken: z.string().min(1) });
const forgot = z.object({ email: z.string().email() });
const reset = z.object({ token: z.string().min(1), password: z.string().min(8) });
const changePassword = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});
const verifyOtp = z.object({
  otpChallengeToken: z.string().min(1),
  code: z.string().min(6).max(8),
  deviceLabel: z.string().optional(),
});
const enrollTotp = z.object({
  enrollmentToken: z.string().min(1),
  code: z.string().min(6).max(8),
});
const signup = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  orgName: z.string().min(1),
  orgSlug: z.string().optional(),
  orgType: z.enum(["silva", "vendor"]),
  displayName: z.string().optional(),
  vendorCategory: z.string().optional(),
  branding: z.record(z.any()).optional(),
});
const switchProgram = z.object({ programId: z.string().min(1) });
const tenantBranding = z.object({
  displayName: z.string().min(1).optional(),
  branding: z.record(z.any()).optional(),
});
const contactInquiry = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  organization: z.string().trim().max(160).optional().default(""),
  message: z.string().trim().min(10).max(4000),
  /** Honeypot — bots fill this; service ignores the inquiry */
  website: z.string().max(200).optional().default(""),
});

const rateCardCategory = z.object({
  label: z.string().min(1),
  value: z.string().min(1).optional(),
  active: z.boolean().optional(),
});

const optionalNumber = z.union([z.number(), z.null()]).optional();

const rateCardLine = z.object({
  resourceCode: z.string().min(1),
  resourceName: z.string().min(1),
  category: z.string().min(1),
  unitOfMeasure: z.string().min(1),
  rateBirr: z.number().finite().nonnegative(),
  benchmarkFarmARate: optionalNumber,
  benchmarkFarmBRate: optionalNumber,
  justificationNote: z.string().optional().default(""),
  budgetYear: z.number().int().min(2000).max(2100),
  effectiveFrom: z.union([z.string(), z.null()]).optional(),
  effectiveTo: z.union([z.string(), z.null()]).optional(),
});

const rateCardReturn = z.object({
  comment: z.string().min(1),
});

const rateCardSubmit = z.object({
  ids: z.array(z.string().min(1)).min(1, "Select at least one draft line"),
});

const rateCardArchiveYear = z.object({
  budgetYear: z.number().int().min(2000).max(2100),
});

const cropfortRole = z.enum([
  "field_supervisor",
  "bagro_office",
  "spx_validator",
  "farm_owner",
  "spx_platform_admin",
]);

const adminUser = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  organization: z.enum(["spx", "bagro", "silva"]),
  status: z.enum(["invited", "active", "suspended"]),
  roles: z.array(cropfortRole).min(1),
  tenants: z
    .array(
      z.object({
        tenantId: z.string().min(1),
        tenantName: z.string().optional(),
        roles: z.array(cropfortRole).optional(),
        blockIds: z.array(z.string()).optional().default([]),
      }),
    )
    .min(1),
});

const orgMapOrganization = z.object({
  name: z.string().min(1),
  type: z.enum(["spx", "bagro", "silva_estate", "vendor_org", "other", "silva", "vendor"]),
  status: z.enum(["active", "inactive"]),
});

const orgMapFarmArea = z.object({
  name: z.string().min(1),
  organizationId: z.string().min(1),
  totalHectares: z.union([z.number(), z.string()]).optional(),
  status: z.enum(["active", "inactive"]),
  blockIds: z.array(z.string()).optional().default([]),
  vendorIds: z.array(z.string()).optional().default([]),
  assetOwnerIds: z.array(z.string()).optional().default([]),
});

const orgMapVendor = z.object({
  name: z.string().min(1),
  category: z.string().optional().default("general"),
  status: z.enum(["active", "pending", "expired", "terminated"]),
  prequalified: z.boolean().optional().default(false),
  insuranceOnFile: z.boolean().optional().default(false),
  farmAreaIds: z.array(z.string()).optional().default([]),
  blockIds: z.array(z.string()).optional().default([]),
});

const orgMapAssetOwner = z.object({
  name: z.string().min(1),
  organizationId: z.union([z.string(), z.null()]).optional(),
  contactEmail: z.union([z.string(), z.null()]).optional(),
  contactPhone: z.union([z.string(), z.null()]).optional(),
  farmAreaIds: z.array(z.string()).optional().default([]),
  blockIds: z.array(z.string()).optional().default([]),
});

const orgMapBlock = z.object({
  code: z.string().min(1),
  name: z.string().min(1).optional(),
  label: z.string().min(1).optional(),
  hectares: z.union([z.number(), z.string(), z.null()]).optional(),
  areaHa: z.union([z.number(), z.string(), z.null()]).optional(),
  farmAreaId: z.union([z.string(), z.null()]).optional(),
  farmEstateId: z.union([z.string(), z.null()]).optional(),
  status: z.enum(["active", "inactive"]).optional().default("active"),
});

const adminProgram = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).optional(),
  status: z.enum(["active", "archived"]).optional(),
  branding: z.record(z.any()).optional(),
});

const adminProgramUpdate = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  status: z.enum(["active", "archived"]).optional(),
  cropfortAfeBandAMaxEtb: z.number().finite().positive().optional(),
  cropfortAfeBandBMaxEtb: z.number().finite().positive().optional(),
  cropfortAfeBandCMaxEtb: z.number().finite().positive().optional(),
  cropfortCurrency: z.string().min(1).max(8).optional(),
});

const acceptInvite = z.object({
  token: z.string().min(1),
  name: z.string().min(1).optional(),
  password: z.string().min(8),
});

const catalogResource = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  defaultUnit: z.string().min(1),
  isActive: z.boolean().optional(),
});
const catalogResourceUpdate = catalogResource.partial();

const materialResource = catalogResource.extend({
  stockQuantity: z.number().finite().nonnegative().optional(),
});
const materialResourceUpdate = materialResource.partial();

const modularRateCard = z.object({
  name: z.string().min(1),
  effectiveDate: z.string().optional(),
  endDate: z.union([z.string(), z.null()]).optional(),
  currency: z.string().min(1).optional(),
});
const modularRateCardUpdate = modularRateCard.partial();

const rateCardLineItem = z.object({
  category: z.enum(["labor", "equipment", "material"]),
  laborActivityId: z.string().min(1).optional().nullable(),
  equipmentResourceId: z.string().min(1).optional().nullable(),
  materialId: z.string().min(1).optional().nullable(),
  unit: z.string().optional(),
  rate: z.number().finite().nonnegative(),
  overtimeMultiplier: z.union([z.number().finite().positive(), z.null()]).optional(),
  minimumQty: z.union([z.number().finite().nonnegative(), z.null()]).optional(),
  notes: z.string().optional().nullable(),
});
const rateCardLineItemUpdate = rateCardLineItem.partial().extend({
  category: z.enum(["labor", "equipment", "material"]).optional(),
  rate: z.number().finite().nonnegative().optional(),
});

const rateCardReject = z.object({
  comment: z.string().min(1),
});

const planMonth = z.enum([
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
]);
const monthIntensity = z.enum(["none", "light", "active", "peak"]);

const programmePlanLine = z.object({
  id: z.string().optional(),
  activityId: z.string().min(1),
  activityCode: z.string().optional(),
  activityName: z.string().optional(),
  category: z.string().optional(),
  uom: z.string().optional(),
  scope: z.enum(["block", "off_block"]).optional(),
  included: z.boolean().optional(),
  plannedQty: z.number().finite().nonnegative().optional(),
  unitRateEtb: z.number().finite().nonnegative().nullable().optional(),
  rateCardId: z.string().nullable().optional(),
  rateSource: z.string().nullable().optional(),
  rateStatus: z.enum(["VALID", "MISSING", "EXPIRED", "UNAPPROVED", "OVERRIDDEN"]).optional(),
  agreedRate: z
    .object({
      rateCardId: z.string().optional(),
      unitRateEtb: z.number().finite().nonnegative(),
      costKind: z.string().optional(),
      normMdPerUnit: z.number().nullable().optional(),
      approvedAt: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  intensities: z.record(z.string(), monthIntensity).optional(),
  blockAllocations: z
    .array(
      z.object({
        blockId: z.string(),
        blockCode: z.string().optional(),
        qty: z.number().finite().nonnegative(),
      }),
    )
    .optional(),
  manualsRef: z.string().optional(),
  serviceType: z.string().optional(),
  notes: z.string().nullable().optional(),
});

const programmePlanCreate = z.object({
  name: z.string().min(1),
  farmEstateId: z.string().min(1),
  planYear: z.number().int().min(2000).max(2100),
  planningCycleLabel: z.string().optional(),
  budgetYearLabel: z.string().optional(),
  description: z.string().optional(),
  notes: z.string().optional(),
  vendorLabel: z.string().optional(),
  code: z.string().optional(),
  applicableBlockIds: z.array(z.string()).optional(),
});

const programmePlanUpsert = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  planningCycleLabel: z.string().optional(),
  notes: z.string().optional(),
  vendorLabel: z.string().optional(),
  budgetYearLabel: z.string().optional(),
  programBandSetId: z.string().nullable().optional(),
  totalHa: z.number().finite().nonnegative().optional(),
  applicableBlockIds: z.array(z.string()).optional(),
  status: z.enum(["draft", "finalized", "ready_for_review", "submitted"]).optional(),
  lines: z.array(programmePlanLine).optional(),
  activities: z.record(z.string(), programmePlanLine).optional(),
});

const programmePlanSchedule = z.object({
  lines: z
    .array(
      z.object({
        id: z.string().optional(),
        lineId: z.string().optional(),
        intensities: z.record(z.string(), monthIntensity).optional(),
        from: planMonth.optional(),
        to: planMonth.optional(),
        intensity: monthIntensity.optional(),
      }),
    )
    .min(1),
});

const programmePlanDecide = z.object({
  decision: z.enum(["approve", "return"]),
  comment: z.string().optional(),
});

const cropfortAfeCreate = z.object({
  title: z.string().min(1),
  amountEtb: z.number().finite().nonnegative(),
  band: z.enum(["A", "B", "C", "D"]).optional(),
  sourceType: z
    .enum(["afp_line", "weekly_submission", "intervention", "project", "manual"])
    .optional(),
  sourceId: z.string().nullable().optional(),
});

const cropfortAfeDecide = z.object({
  decision: z.enum(["approve", "return"]),
  comment: z.string().optional(),
});

const paymentRequestCreate = z.object({
  fieldTicketId: z.string().min(1),
});

const paymentRequestReturn = z.object({
  comment: z.string().min(1).optional(),
});

const paymentRequestAuthorizeSettlement = z.object({
  narrative: z.string().optional(),
});

const weeklyPlanLine = z.object({
  monthlyLineId: z.string().optional(),
  activityId: z.string().optional(),
  activityCode: z.string().optional(),
  activityName: z.string().min(1),
  blockId: z.string().optional(),
  blockCode: z.string().optional(),
  qty: z.number().finite().nonnegative(),
  unit: z.string().optional(),
  crew: z.string().optional(),
  materials: z.string().optional(),
  manualsRef: z.string().optional(),
  etb: z.number().finite().nonnegative(),
});

const weeklyPlanCreate = z.object({
  weekLabel: z.string().min(1),
  code: z.string().optional(),
  monthlyWoId: z.string().nullable().optional(),
  monthlyWoCode: z.string().nullable().optional(),
  note: z.string().optional(),
  loop: z.string().optional(),
  directInstructionIds: z.array(z.string()).optional(),
  lines: z.array(weeklyPlanLine).min(1),
});

const weeklyPlanDecide = z.object({
  decision: z.enum(["approve", "return"]),
  comment: z.string().optional(),
});

const weeklyPlanLoop = z.object({
  loop: z.string().min(1),
});

const monthlyWoLine = z.object({
  activityId: z.string().optional(),
  activityCode: z.string().optional(),
  activityName: z.string().min(1),
  blockId: z.string().optional(),
  blockCode: z.string().optional(),
  plannedQty: z.number().finite().nonnegative(),
  unit: z.string().optional(),
  etb: z.number().finite().nonnegative(),
  manualsRef: z.string().optional(),
  inPlan: z.boolean().optional(),
});

const monthlyWoCreate = z.object({
  ethiopianMonth: z.string().min(1),
  yearGc: z.number().int().min(2000).max(2100),
  code: z.string().optional(),
  farmId: z.string().nullable().optional(),
  farmName: z.string().optional(),
  sourcePlanId: z.string().nullable().optional(),
  outOfPlanReason: z.string().optional(),
  loop: z.string().optional(),
  lastMonthInsights: z.string().optional(),
  structuredInsights: z.any().optional(),
  recommendedAdjustments: z.array(z.any()).optional(),
  note: z.string().optional(),
  lines: z.array(monthlyWoLine).min(1),
});

const monthlyWoDecide = z.object({
  decision: z.enum(["approve", "return"]),
  comment: z.string().optional(),
});

const monthlyWoLoop = z.object({
  loop: z.string().min(1),
});

const monthlyWoAddOutOfPlanLine = z.object({
  activityName: z.string().min(1),
  activityCode: z.string().optional(),
  activityId: z.string().optional(),
  blockId: z.string().optional(),
  blockCode: z.string().optional(),
  plannedQty: z.number().finite().nonnegative(),
  unit: z.string().optional(),
  etb: z.number().finite().nonnegative(),
  manualsRef: z.string().optional(),
  reason: z.string().min(1),
});

const directInstructionIssue = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  amountEtb: z.number().finite().nonnegative(),
  blockId: z.string().optional(),
  blockCode: z.string().optional(),
  monthlyWoId: z.string().nullable().optional(),
  monthlyWoCode: z.string().nullable().optional(),
  weeklyPlanId: z.string().nullable().optional(),
  weeklyPlanLineId: z.string().nullable().optional(),
  workOrderId: z.string().nullable().optional(),
  oral: z.boolean().optional(),
  code: z.string().optional(),
});

const dfrCreate = z.object({
  activityName: z.string().min(1),
  activityCode: z.string().optional(),
  activityId: z.string().optional(),
  weeklyPlanId: z.string().optional(),
  weeklyPlanLineId: z.string().optional(),
  monthlyWoId: z.string().optional(),
  monthlyWoCode: z.string().optional(),
  monthlyLineId: z.string().optional(),
  workOrderId: z.string().nullable().optional(),
  date: z.string().optional(),
  blockId: z.string().optional(),
  blockCode: z.string().optional(),
  plannedQty: z.number().finite().nonnegative(),
  actualQty: z.number().finite().nonnegative().optional().default(0),
  unit: z.string().optional(),
  laborHours: z.number().finite().nonnegative().optional(),
  materialsUsed: z.array(z.string()).optional(),
  notes: z.string().optional(),
  entrySource: z.string().optional(),
  missCause: z.string().nullable().optional(),
  code: z.string().optional(),
});

const dfrUpdate = z.object({
  actualQty: z.number().finite().nonnegative().optional(),
  plannedQty: z.number().finite().nonnegative().optional(),
  laborHours: z.number().finite().nonnegative().optional(),
  notes: z.string().optional(),
  materialsUsed: z.array(z.string()).optional(),
  date: z.string().optional(),
  missCause: z.string().nullable().optional(),
});

const dfrSiteCheck = z.object({
  note: z.string().optional(),
  qualityScore: z.number().finite().nonnegative().optional(),
});

const dfrValidate = z.object({
  note: z.string().optional(),
  qualityScore: z.number().finite().nonnegative().optional(),
  missCause: z.string().nullable().optional(),
});

const dfrReturn = z.object({
  note: z.string().min(1).optional(),
  comment: z.string().min(1).optional(),
  failedCriteria: z.array(z.string()).optional(),
});

const dfrCorrect = dfrUpdate;

const workOrderCreate = z.object({
  title: z.string().optional(),
  activity: z.string().optional(),
  category: z.string().optional(),
  tier: z.enum(["retainer", "project", "special"]).optional(),
  weekStart: z.number().int().min(1).max(53).optional(),
  weekEnd: z.number().int().min(1).max(53).optional(),
  week: z.number().int().min(1).max(53).optional(),
  plannedCostEtb: z.number().finite().nonnegative().optional(),
  etb: z.number().finite().nonnegative().optional(),
  farmEstateId: z.string().nullable().optional(),
  assignedVendorId: z.string().nullable().optional(),
  afeId: z.string().nullable().optional(),
  cropfortAfeId: z.string().nullable().optional(),
  blockId: z.string().optional(),
  blockIds: z.array(z.string()).optional(),
  instructions: z.string().nullable().optional(),
  code: z.string().optional(),
});

const workOrderUpdate = workOrderCreate.partial();

const workOrderTransition = z.object({
  status: z.enum(["draft", "issued", "in_progress", "complete", "closed"]),
});

const fieldTicketCreate = z.object({
  activityRecorded: z.string().optional(),
  areaHa: z.number().finite().nonnegative().optional(),
  laborCount: z.number().int().nonnegative().optional(),
  materialsUsed: z.string().optional(),
  actualQuantity: z.number().finite().nonnegative().nullable().optional(),
  actualMandays: z.number().finite().nonnegative().nullable().optional(),
  unitRateEtb: z.number().finite().nonnegative().nullable().optional(),
  ticketDate: z.string().optional(),
  vendorUserId: z.string().nullable().optional(),
});

const fieldTicketTransition = z.object({
  status: z.enum(["draft", "submitted", "vendor_reviewed", "validated", "rejected"]),
  comment: z.string().optional(),
});

const projectCreate = z.object({
  title: z.string().min(1),
  budgetEtb: z.number().finite().positive(),
  blockId: z.string().min(1),
  blockCode: z.string().optional(),
  vendor: z.string().optional(),
  band: z.enum(["A", "B", "C", "D"]).optional(),
  notes: z.string().optional(),
  code: z.string().optional(),
});

const projectDecide = z.object({
  decision: z.enum(["approve", "return"]),
  comment: z.string().optional(),
});

const interventionCreate = z.object({
  title: z.string().min(1),
  costEtb: z.number().finite().positive(),
  blockId: z.string().min(1),
  blockCode: z.string().optional(),
  vendor: z.string().optional(),
  band: z.enum(["A", "B", "C", "D"]).optional(),
  code: z.string().optional(),
});

const linkAfe = z.object({
  cropfortAfeId: z.string().min(1),
});

module.exports = {
  login,
  refresh,
  forgot,
  reset,
  changePassword,
  verifyOtp,
  enrollTotp,
  signup,
  switchProgram,
  tenantBranding,
  contactInquiry,
  rateCardCategory,
  rateCardLine,
  rateCardReturn,
  rateCardSubmit,
  rateCardArchiveYear,
  adminUser,
  orgMapOrganization,
  orgMapFarmArea,
  orgMapVendor,
  orgMapAssetOwner,
  orgMapBlock,
  adminProgram,
  adminProgramUpdate,
  acceptInvite,
  catalogResource,
  catalogResourceUpdate,
  materialResource,
  materialResourceUpdate,
  modularRateCard,
  modularRateCardUpdate,
  rateCardLineItem,
  rateCardLineItemUpdate,
  rateCardReject,
  programmePlanCreate,
  programmePlanUpsert,
  programmePlanSchedule,
  programmePlanDecide,
  cropfortAfeCreate,
  cropfortAfeDecide,
  paymentRequestCreate,
  paymentRequestReturn,
  paymentRequestAuthorizeSettlement,
  weeklyPlanCreate,
  weeklyPlanDecide,
  weeklyPlanLoop,
  monthlyWoCreate,
  monthlyWoDecide,
  monthlyWoLoop,
  monthlyWoAddOutOfPlanLine,
  directInstructionIssue,
  dfrCreate,
  dfrUpdate,
  dfrSiteCheck,
  dfrValidate,
  dfrReturn,
  dfrCorrect,
  workOrderCreate,
  workOrderUpdate,
  workOrderTransition,
  fieldTicketCreate,
  fieldTicketTransition,
  projectCreate,
  projectDecide,
  interventionCreate,
  linkAfe,
};
