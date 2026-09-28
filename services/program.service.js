const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const { uuid } = require("../utils/ids");

const DEFAULT_RATE_CATEGORIES = [
  { value: "labour", label: "Labour" },
  { value: "material", label: "Material" },
  { value: "machinery", label: "Machinery" },
  { value: "transport", label: "Transport" },
  { value: "other", label: "Other" },
];

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
    cropfortAfeBandAMaxEtb: p.cropfortAfeBandAMaxEtb != null ? Number(p.cropfortAfeBandAMaxEtb) : 500000,
    cropfortAfeBandBMaxEtb: p.cropfortAfeBandBMaxEtb != null ? Number(p.cropfortAfeBandBMaxEtb) : 2000000,
    cropfortAfeBandCMaxEtb: p.cropfortAfeBandCMaxEtb != null ? Number(p.cropfortAfeBandCMaxEtb) : 5000000,
  };
}

function adminProgramJson(p) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    status: p.status,
    createdByOrgId: p.createdByOrgId,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt ? p.updatedAt.toISOString() : null,
    memberCount: p._count?.memberships ?? 0,
    farmAreaCount: p._count?.farm_estates ?? 0,
    cropfortAfeBandAMaxEtb: p.cropfortAfeBandAMaxEtb != null ? Number(p.cropfortAfeBandAMaxEtb) : 500000,
    cropfortAfeBandBMaxEtb: p.cropfortAfeBandBMaxEtb != null ? Number(p.cropfortAfeBandBMaxEtb) : 2000000,
    cropfortAfeBandCMaxEtb: p.cropfortAfeBandCMaxEtb != null ? Number(p.cropfortAfeBandCMaxEtb) : 5000000,
    cropfortCurrency: p.cropfortCurrency || "ETB",
  };
}

function assertManagePrograms(user) {
  if (!["system_admin", "spx_principal"].includes(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Only platform admins can manage programs");
  }
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

async function ensureDefaultCategories(programId) {
  for (const c of DEFAULT_RATE_CATEGORIES) {
    await prisma.rate_card_categories.upsert({
      where: { programId_value: { programId, value: c.value } },
      update: { label: c.label, active: true },
      create: {
        id: `rcc_${programId}_${c.value}`,
        programId,
        value: c.value,
        label: c.label,
        active: true,
      },
    });
  }
}

exports.listPrograms = async (user) => {
  if (user.role === "system_admin") {
    const rows = await prisma.programs.findMany({
      orderBy: { name: "asc" },
      include: {
        memberships: {
          where: { organizationId: user.organizationId },
          take: 1,
        },
      },
    });
    return rows.map((p) => programJson(p, p.memberships[0] || { roleInProgram: "manager" }));
  }

  const memberships = await prisma.program_memberships.findMany({
    where: { organizationId: user.organizationId },
    include: { program: true },
    orderBy: { createdAt: "asc" },
  });
  return memberships.map((m) => programJson(m.program, m));
};

exports.adminListPrograms = async (user) => {
  assertManagePrograms(user);
  const rows = await prisma.programs.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { memberships: true, farm_estates: true } },
    },
  });
  return rows.map(adminProgramJson);
};

exports.createProgram = async (user, dto) => {
  if (!["silva_owner", "silva_country_manager", "spx_principal", "system_admin"].includes(user.role)) {
    throw new AppError(403, "FORBIDDEN", "Only Silva or SPX admins can create programs.");
  }
  const name = String(dto.name || "").trim();
  if (!name) throw new AppError(400, "VALIDATION_ERROR", "Program name is required.");

  const base = slugify(dto.slug || name);
  if (!base) throw new AppError(400, "VALIDATION_ERROR", "Program slug is required.");
  let slug = base;
  let n = 1;
  while (await prisma.programs.findUnique({ where: { slug } })) {
    slug = `${base}-${n++}`;
  }

  const roleInProgram = user.organizationType === "silva" ? "owner" : "manager";
  const status = dto.status === "archived" ? "archived" : "active";

  const program = await prisma.programs.create({
    data: {
      id: uuid("prg"),
      name,
      slug,
      status,
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

  await ensureDefaultCategories(program.id);

  if (user.role !== "system_admin") {
    await prisma.users.update({ where: { id: user.id }, data: { activeProgramId: program.id } });
  }

  const full = await prisma.programs.findUnique({
    where: { id: program.id },
    include: { _count: { select: { memberships: true, farm_estates: true } } },
  });
  return adminProgramJson(full);
};

exports.updateProgram = async (user, id, dto) => {
  assertManagePrograms(user);
  const existing = await prisma.programs.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Program not found");

  const name = dto.name !== undefined ? String(dto.name || "").trim() : existing.name;
  if (!name) throw new AppError(400, "VALIDATION_ERROR", "Program name is required.");

  let slug = existing.slug;
  if (dto.slug !== undefined || dto.name !== undefined) {
    const base = slugify(dto.slug || name);
    if (!base) throw new AppError(400, "VALIDATION_ERROR", "Program slug is required.");
    slug = base;
    if (slug !== existing.slug) {
      let n = 1;
      let candidate = slug;
      while (await prisma.programs.findFirst({ where: { slug: candidate, id: { not: id } } })) {
        candidate = `${slug}-${n++}`;
      }
      slug = candidate;
    }
  }

  const status =
    dto.status === undefined ? existing.status : dto.status === "archived" ? "archived" : "active";

  const data = { name, slug, status };
  if (dto.cropfortAfeBandAMaxEtb != null) {
    data.cropfortAfeBandAMaxEtb = dto.cropfortAfeBandAMaxEtb;
  }
  if (dto.cropfortAfeBandBMaxEtb != null) {
    data.cropfortAfeBandBMaxEtb = dto.cropfortAfeBandBMaxEtb;
  }
  if (dto.cropfortAfeBandCMaxEtb != null) {
    data.cropfortAfeBandCMaxEtb = dto.cropfortAfeBandCMaxEtb;
  }
  if (dto.cropfortCurrency != null) {
    data.cropfortCurrency = String(dto.cropfortCurrency).trim() || existing.cropfortCurrency;
  }

  const updated = await prisma.programs.update({
    where: { id },
    data,
    include: { _count: { select: { memberships: true, farm_estates: true } } },
  });
  return adminProgramJson(updated);
};

exports.archiveProgram = async (user, id) => {
  assertManagePrograms(user);
  const existing = await prisma.programs.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Program not found");
  const updated = await prisma.programs.update({
    where: { id },
    data: { status: "archived" },
    include: { _count: { select: { memberships: true, farm_estates: true } } },
  });
  return adminProgramJson(updated);
};

exports.switchProgram = async (user, programId) => {
  if (user.role === "system_admin") {
    const program = await prisma.programs.findUnique({ where: { id: programId } });
    if (!program) throw new AppError(404, "NOT_FOUND", "Program not found");
    const existing = await prisma.program_memberships.findUnique({
      where: {
        programId_organizationId: { programId, organizationId: user.organizationId },
      },
    });
    if (!existing) {
      await prisma.program_memberships.create({
        data: {
          id: uuid("pm"),
          programId,
          organizationId: user.organizationId,
          roleInProgram: "manager",
        },
      });
    }
    await prisma.users.update({ where: { id: user.id }, data: { activeProgramId: programId } });
    return programJson(program, { roleInProgram: "manager" });
  }

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
