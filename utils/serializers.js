const { iso } = require("./helpers");

function userJson(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    organizationType: user.organization?.type || user.organizationType || null,
    organizationId: user.organizationId,
    vendorId: user.vendorId || null,
    activeProgramId: user.activeProgramId || null,
    active: user.active,
    createdAt: iso(user.createdAt),
  };
}

module.exports = {
  userJson,
};
