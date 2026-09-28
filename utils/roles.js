const SILVA_ROLES = ["silva_owner", "silva_country_manager", "silva_finance"];
const SPX_ROLES = ["spx_principal", "spx_account_handler", "spx_field_supervisor", "system_admin"];
const SYSTEM_ROLES = [...SILVA_ROLES, ...SPX_ROLES];
const VENDOR_ROLES = [
  "vendor_admin",
  "vendor_manager",
  "vendor_supervisor",
  "vendor_field_lead",
  "vendor_worker",
];

/** Mirrors silva_frontend/src/mocks/permissions.ts — UI permission keys from /auth/me */
const ROLE_PERMISSIONS = {
  silva_owner: [
    "afp.read",
    "afp.approve",
    "afe.read",
    "afe.approve_band_c",
    "afe.approve_band_d",
    "work_orders.read",
    "payment_requests.read_verified",
    "settlements.read",
    "settlements.mark_settled",
    "reports.read_released",
    "vendors.read_summary",
    "dashboard.silva_owner",
    "notifications.read",
    "messages.read",
    "messages.write",
  ],
  silva_country_manager: [
    "afp.read",
    "afp.approve",
    "afe.read",
    "afe.approve_band_c",
    "afe.approve_band_d",
    "work_orders.read",
    "payment_requests.read_verified",
    "settlements.read",
    "reports.read_released",
    "vendors.read_summary",
    "dashboard.silva_owner",
    "notifications.read",
    "messages.read",
    "messages.write",
  ],
  silva_finance: [
    "afp.read",
    "afe.read",
    "work_orders.read",
    "payment_requests.read_verified",
    "settlements.read",
    "settlements.mark_settled",
    "reports.read_released",
    "dashboard.silva_owner",
    "notifications.read",
    "messages.read",
    "messages.write",
  ],
  spx_principal: [
    "afp.read",
    "afp.create",
    "afp.close",
    "afe.read",
    "afe.create",
    "afe.validate",
    "afe.approve_band_a",
    "afe.approve_band_b",
    "work_orders.full",
    "field_tickets.validate",
    "payment_requests.verify",
    "settlements.authorize",
    "revenue_ledger.full",
    "reports.release",
    "vendors.manage",
    "dashboard.spx_management",
    "audit.read",
    "notifications.read",
    "messages.read",
    "messages.write",
  ],
  spx_account_handler: [
    "afp.read",
    "afp.create",
    "afe.read",
    "afe.create",
    "afe.validate",
    "afe.approve_band_a",
    "afe.approve_band_b",
    "work_orders.create",
    "work_orders.issue",
    "field_tickets.validate",
    "payment_requests.verify",
    "settlements.authorize",
    "reports.draft",
    "vendors.manage",
    "dashboard.spx_management",
    "notifications.read",
    "messages.read",
    "messages.write",
  ],
  spx_field_supervisor: [
    "afp.read",
    "afe.read",
    "work_orders.read",
    "field_tickets.validate",
    "dashboard.spx_management",
    "notifications.read",
    "messages.read",
    "messages.write",
  ],
  system_admin: ["users.manage", "organizations.manage", "audit.read", "notifications.read"],
  vendor_admin: [
    "work_orders.read_own",
    "users.invite",
    "field_tickets.create",
    "dashboard.vendor_field",
    "notifications.read",
    "messages.read",
    "messages.write",
  ],
  vendor_manager: [
    "work_orders.read_own",
    "tasks.create",
    "field_tickets.create",
    "payment_requests.create",
    "dashboard.vendor_field",
    "notifications.read",
    "messages.read",
    "messages.write",
  ],
  vendor_supervisor: [
    "work_orders.read_own",
    "tasks.create",
    "field_tickets.review",
    "dashboard.vendor_field",
    "notifications.read",
    "messages.read",
    "messages.write",
  ],
  vendor_field_lead: [
    "work_orders.read_own",
    "field_tickets.create",
    "tasks.create",
    "payment_requests.create",
    "dashboard.vendor_field",
    "notifications.read",
    "messages.read",
    "messages.write",
  ],
  vendor_worker: [
    "work_orders.read_own",
    "field_tickets.create",
    "dashboard.vendor_field",
    "notifications.read",
  ],
};

function isVendorRole(role) {
  return VENDOR_ROLES.includes(role);
}
function isSilvaRole(role) {
  return SILVA_ROLES.includes(role);
}
function isSpxRole(role) {
  return SPX_ROLES.includes(role);
}

/**
 * Silva / asset-owner approvers (farm_owner Cropfort desk + Silva org roles).
 * These roles decide submitted plans / AFEs / MWOs / weekly — they do not create plans.
 */
function isAssetOwnerApprover(userOrRole) {
  if (userOrRole == null) return false;
  if (typeof userOrRole === "string") {
    return isSilvaRole(userOrRole) || userOrRole === "farm_owner" || userOrRole === "system_admin";
  }
  const role = userOrRole.role;
  if (isSilvaRole(role) || role === "farm_owner" || role === "system_admin") return true;
  const cf = userOrRole.cropfortRoles || [];
  return cf.includes("farm_owner");
}

/** SPX creates / edits programme & operational plan scope. */
function canCreateOrEditPlans(userOrRole) {
  if (userOrRole == null) return false;
  if (typeof userOrRole === "string") {
    return (
      isSpxRole(userOrRole) ||
      userOrRole === "spx_platform_admin" ||
      userOrRole === "spx_validator" ||
      userOrRole === "system_admin"
    );
  }
  const role = userOrRole.role;
  if (
    isSpxRole(role) ||
    role === "spx_platform_admin" ||
    role === "spx_validator" ||
    role === "system_admin"
  ) {
    return true;
  }
  const cf = userOrRole.cropfortRoles || [];
  return cf.includes("spx_validator") || cf.includes("spx_platform_admin");
}

const VENDOR_WORK_PLAN_ROLES = ["vendor_admin", "vendor_manager"];
const WORK_PLAN_MANAGE_ROLES = [...SPX_ROLES, ...VENDOR_WORK_PLAN_ROLES];

function canManageWorkPlan(role) {
  return WORK_PLAN_MANAGE_ROLES.includes(role);
}

function orgTypeOf(user) {
  return user.organizationType || user.organization?.type || null;
}

function permissionsFor(role) {
  return ROLE_PERMISSIONS[role] ?? [];
}

module.exports = {
  SILVA_ROLES,
  SPX_ROLES,
  SYSTEM_ROLES,
  VENDOR_ROLES,
  VENDOR_WORK_PLAN_ROLES,
  WORK_PLAN_MANAGE_ROLES,
  isVendorRole,
  isSilvaRole,
  isSpxRole,
  isAssetOwnerApprover,
  canCreateOrEditPlans,
  canManageWorkPlan,
  orgTypeOf,
  permissionsFor,
};
