const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const { uuid } = require("../utils/ids");

function slugify(input) {
  return String(input)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function programJson(p, membership) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    status: p.status,
    branding: p.brandingJson || null,
    createdByOrgId: p.createdByOrgId,
    roleInProgram: membership?.roleInProgram || null,
    createdAt: p.createdAt.toISOString(),
  };
}

async function assertProgramMember(user, programId) {
  const membership = await prisma.program_memberships.findUnique({
    where: {
      programId_organizationId: { programId, organizationId: user.organizationId },
    },
  });
  if (!membership) {
    throw new AppError(403, "FORBIDDEN", "Your organization is not a member of this program.");
  }
  return membership;
}

exports.listPrograms = async (user) => {
  const memberships = await prisma.program_memberships.findMany({
    where: { organizationId: user.organizationId },
    include: { program: true },
    orderBy: { createdAt: "asc" },
  });
  return memberships.map((m) => programJson(m.program, m));
};

exports.createProgram = async (user, dto) => {
  if (!["silva_owner", "silva_country_manager", "spx_principal", "system_admin"].includes(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Only Silva or SPX admins can create programs.");
  }
  const base = slugify(dto.slug || dto.name);
  if (!base) throw new AppError(400, "VALIDATION_ERROR", "Program name is required.");
  let slug = base;
  let n = 1;
  while (await prisma.programs.findUnique({ where: { slug } })) {
    slug = `${base}-${n++}`;
  }
  const roleInProgram = user.organizationType === "silva" ? "owner" : "manager";
  const program = await prisma.programs.create({
    data: {
      id: uuid("prg"),
      name: dto.name,
      slug,
      brandingJson: dto.branding || null,
      createdByOrgId: user.organizationId,
      memberships: {
        create: {
          id: uuid("pm"),
          organizationId: user.organizationId,
          roleInProgram,
        },
      },
    },
  });
  await prisma.users.update({ where: { id: user.id }, data: { activeProgramId: program.id } });
  return programJson(program, { roleInProgram });
};

exports.switchProgram = async (user, programId) => {
  await assertProgramMember(user, programId);
  await prisma.users.update({ where: { id: user.id }, data: { activeProgramId: programId } });
  const program = await prisma.programs.findUnique({ where: { id: programId } });
  return programJson(program);
};

exports.updateTenantBranding = async (user, dto) => {
  if (
    !["silva_owner", "silva_country_manager", "spx_principal", "vendor_admin", "system_admin"].includes(
      user.role,
    )
  ) {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  }
  const existing = await prisma.organizations.findUnique({ where: { id: user.organizationId } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Organization not found.");
  const mergedBranding =
    dto.branding !== undefined ? { ...(existing.brandingJson || {}), ...dto.branding } : undefined;
  const org = await prisma.organizations.update({
    where: { id: user.organizationId },
    data: {
      displayName: dto.displayName ?? existing.displayName,
      brandingJson: mergedBranding,
    },
  });
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    displayName: org.displayName,
    type: org.type,
    branding: org.brandingJson,
    status: org.status,
  };
};

exports.completeOnboarding = async (user, dto = {}) => {
  const existing = await prisma.organizations.findUnique({ where: { id: user.organizationId } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Organization not found.");

  const canEditBranding = [
    "silva_owner",
    "silva_country_manager",
    "spx_principal",
    "vendor_admin",
    "system_admin",
  ].includes(user.role);

  const branding = {
    ...(existing.brandingJson || {}),
    onboardingCompletedAt: new Date().toISOString(),
  };
  if (canEditBranding && dto.branding) {
    Object.assign(branding, dto.branding);
  } else if (!canEditBranding && dto.branding?.tagline) {
    branding.tagline = dto.branding.tagline;
  }

  const data = { brandingJson: branding };
  if (canEditBranding && dto.displayName) {
    data.displayName = dto.displayName;
  }

  const org = await prisma.organizations.update({
    where: { id: user.organizationId },
    data,
  });

  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    displayName: org.displayName,
    type: org.type,
    branding: org.brandingJson,
    status: org.status,
  };
};

exports.slugify = slugify;
exports.assertProgramMember = assertProgramMember;
exports.programJson = programJson;
