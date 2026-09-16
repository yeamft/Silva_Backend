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
});

const acceptInvite = z.object({
  token: z.string().min(1),
  name: z.string().min(1).optional(),
  password: z.string().min(8),
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
};
