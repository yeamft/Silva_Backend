const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const { uuid } = require("../utils/ids");
const { isSpxRole } = require("../utils/roles");

function assertView(user) {
  if (!(isSpxRole(user.role) || user.role === "system_admin")) {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  }
}

function assertManage(user) {
  if (user.role !== "system_admin") {
    throw new AppError(403, "FORBIDDEN", "Insufficient permissions");
  }
}

function requireProgramId(user) {
  if (!user.activeProgramId) {
    throw new AppError(400, "NO_ACTIVE_PROGRAM", "Select a workspace program first.");
  }
  return user.activeProgramId;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function toUiOrgType(type) {
  if (type === "silva") return "silva_estate";
  if (type === "spx") return "spx";
  if (type === "vendor") return "vendor_org";
  return "other";
}

function toDbOrgType(type) {
  if (type === "silva_estate" || type === "silva") return "silva";
  if (type === "spx") return "spx";
  return "vendor";
}

function toEntityStatus(active, status) {
  if (status === "suspended" || active === false) return "inactive";
  return "active";
}

function num(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function serializeOrganization(row) {
  return {
    id: row.id,
    name: row.name,
    type: toUiOrgType(row.type),
    status: toEntityStatus(row.active, row.status),
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeFarmArea(row) {
  return {
    id: row.id,
    name: row.name,
    organizationId: row.ownerOrganizationId || "",
    totalHectares: num(row.totalAreaHa) ?? 0,
    status: row.status === "inactive" ? "inactive" : "active",
    blockIds: (row.farm_blocks || []).map((b) => b.id),
    vendorIds: (row.farm_estate_vendors || []).map((v) => v.vendorId),
    assetOwnerIds: (row.farm_estate_asset_owners || []).map((a) => a.assetOwnerId),
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeVendor(row) {
  const estateIds = (row.farm_estate_vendors || []).map((l) => l.farmEstateId);
  const blockIds = [];
  for (const link of row.farm_estate_vendors || []) {
    for (const b of link.farm_estates?.farm_blocks || []) blockIds.push(b.id);
  }
  return {
    id: row.id,
    name: row.name,
    category: row.category || "",
    status: row.status,
    prequalified: Boolean(row.prequalified),
    insuranceOnFile: Boolean(row.insuranceOnFile),
    farmAreaIds: estateIds,
    blockIds: [...new Set(blockIds)],
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeAssetOwner(row) {
  return {
    id: row.id,
    name: row.name,
    organizationId: row.organizationId,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    farmAreaIds: (row.farm_estate_asset_owners || []).map((l) => l.farmEstateId),
    blockIds: [],
    createdAt: row.createdAt.toISOString(),
  };
}

function serializeBlock(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.label || row.code,
    hectares: num(row.areaHa) ?? 0,
    farmAreaId: row.farmEstateId || null,
    mapLat: row.mapLat != null ? Number(row.mapLat) : null,
    mapLng: row.mapLng != null ? Number(row.mapLng) : null,
    status: row.status === "inactive" ? "inactive" : "active",
  };
}

const farmAreaInclude = {
  farm_blocks: { select: { id: true } },
  farm_estate_vendors: { select: { vendorId: true } },
  farm_estate_asset_owners: { select: { assetOwnerId: true } },
};

const vendorInclude = {
  farm_estate_vendors: {
    include: {
      farm_estates: {
        include: { farm_blocks: { select: { id: true } } },
      },
    },
  },
};

async function listOrganizations(user) {
  assertView(user);
  const programId = requireProgramId(user);

  const [memberships, estates, vendorLinks] = await Promise.all([
    prisma.program_memberships.findMany({
      where: { programId },
      select: { organizationId: true },
    }),
    prisma.farm_estates.findMany({
      where: { programId },
      select: { ownerOrganizationId: true },
    }),
    prisma.farm_estate_vendors.findMany({
      where: { farm_estates: { programId } },
      include: { vendors: { select: { organizationId: true } } },
    }),
  ]);

  const ids = new Set();
  for (const m of memberships) ids.add(m.organizationId);
  for (const e of estates) if (e.ownerOrganizationId) ids.add(e.ownerOrganizationId);
  for (const l of vendorLinks) {
    if (l.vendors?.organizationId) ids.add(l.vendors.organizationId);
  }

  if (ids.size === 0) return [];

  const rows = await prisma.organizations.findMany({
    where: { id: { in: [...ids] } },
    orderBy: { name: "asc" },
  });
  return rows.map(serializeOrganization);
}

async function createOrganization(user, input) {
  assertManage(user);
  const name = String(input.name || "").trim();
  if (!name) throw new AppError(400, "VALIDATION_ERROR", "Name is required");
  const type = toDbOrgType(input.type);
  let slug = slugify(input.slug || name) || uuid("org").slice(0, 12);
  const clash = await prisma.organizations.findUnique({ where: { slug } });
  if (clash) slug = `${slug}-${Date.now().toString(36)}`;

  const created = await prisma.organizations.create({
    data: {
      id: uuid("org"),
      name,
      slug,
      displayName: name,
      type,
      active: input.status !== "inactive",
      status: input.status === "inactive" ? "suspended" : "active",
    },
  });
  return serializeOrganization(created);
}

async function updateOrganization(user, id, input) {
  assertManage(user);
  const existing = await prisma.organizations.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Organization not found");
  const name = String(input.name || "").trim();
  if (!name) throw new AppError(400, "VALIDATION_ERROR", "Name is required");
  const updated = await prisma.organizations.update({
    where: { id },
    data: {
      name,
      displayName: name,
      type: toDbOrgType(input.type),
      active: input.status !== "inactive",
      status: input.status === "inactive" ? "suspended" : "active",
    },
  });
  return serializeOrganization(updated);
}

async function deleteOrganization(user, id) {
  assertManage(user);
  const existing = await prisma.organizations.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Organization not found");
  const estates = await prisma.farm_estates.count({ where: { ownerOrganizationId: id } });
  if (estates > 0) throw new AppError(409, "IN_USE", "Cannot delete an organization that still has farm areas");
  const owners = await prisma.asset_owners.count({ where: { organizationId: id } });
  if (owners > 0) throw new AppError(409, "IN_USE", "Cannot delete an organization that still has asset owners");
  const vendor = await prisma.vendors.findUnique({ where: { organizationId: id } });
  if (vendor) throw new AppError(409, "IN_USE", "Cannot delete an organization linked to a vendor");
  await prisma.organizations.delete({ where: { id } });
  return { ok: true };
}

async function listBlocks(user) {
  assertView(user);
  const programId = requireProgramId(user);
  const rows = await prisma.farm_blocks.findMany({
    where: { programId },
    orderBy: { code: "asc" },
  });
  return rows.map(serializeBlock);
}

async function createBlock(user, input) {
  assertManage(user);
  const programId = requireProgramId(user);
  const code = String(input.code || "").trim().toUpperCase();
  const name = String(input.name || input.label || "").trim();
  if (!code) throw new AppError(400, "VALIDATION_ERROR", "Block code is required");
  if (!name) throw new AppError(400, "VALIDATION_ERROR", "Block name is required");

  const farmEstateId = input.farmAreaId || input.farmEstateId || null;
  if (farmEstateId) {
    const estate = await prisma.farm_estates.findFirst({ where: { id: farmEstateId, programId } });
    if (!estate) throw new AppError(400, "VALIDATION_ERROR", "Farm area not found in this program");
  }

  const clash = await prisma.farm_blocks.findFirst({
    where: { programId, farmEstateId, code },
  });
  if (clash) throw new AppError(409, "CONFLICT", "A block with this code already exists for that farm area");

  const created = await prisma.farm_blocks.create({
    data: {
      id: uuid("blk"),
      programId,
      farmEstateId,
      code,
      label: name,
      areaHa: num(input.hectares ?? input.areaHa),
      mapLat: num(input.mapLat),
      mapLng: num(input.mapLng),
      status: input.status === "inactive" ? "inactive" : "active",
      updatedAt: new Date(),
    },
  });
  return serializeBlock(created);
}

async function updateBlock(user, id, input) {
  assertManage(user);
  const programId = requireProgramId(user);
  const existing = await prisma.farm_blocks.findFirst({ where: { id, programId } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Block not found");

  const code = String(input.code || "").trim().toUpperCase();
  const name = String(input.name || input.label || "").trim();
  if (!code) throw new AppError(400, "VALIDATION_ERROR", "Block code is required");
  if (!name) throw new AppError(400, "VALIDATION_ERROR", "Block name is required");

  const farmEstateId =
    input.farmAreaId === undefined && input.farmEstateId === undefined
      ? existing.farmEstateId
      : input.farmAreaId || input.farmEstateId || null;

  if (farmEstateId) {
    const estate = await prisma.farm_estates.findFirst({ where: { id: farmEstateId, programId } });
    if (!estate) throw new AppError(400, "VALIDATION_ERROR", "Farm area not found in this program");
  }

  const clash = await prisma.farm_blocks.findFirst({
    where: { programId, farmEstateId, code, id: { not: id } },
  });
  if (clash) throw new AppError(409, "CONFLICT", "A block with this code already exists for that farm area");

  const updated = await prisma.farm_blocks.update({
    where: { id },
    data: {
      code,
      label: name,
      farmEstateId,
      areaHa: num(input.hectares ?? input.areaHa),
      ...(input.mapLat !== undefined ? { mapLat: num(input.mapLat) } : {}),
      ...(input.mapLng !== undefined ? { mapLng: num(input.mapLng) } : {}),
      status: input.status === "inactive" ? "inactive" : "active",
      updatedAt: new Date(),
    },
  });
  return serializeBlock(updated);
}

async function deleteBlock(user, id) {
  assertManage(user);
  const programId = requireProgramId(user);
  const existing = await prisma.farm_blocks.findFirst({ where: { id, programId } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Block not found");
  await prisma.farm_blocks.delete({ where: { id } });
  return { ok: true };
}

async function listFarmAreas(user) {
  assertView(user);
  const programId = requireProgramId(user);
  const rows = await prisma.farm_estates.findMany({
    where: { programId },
    include: farmAreaInclude,
    orderBy: { name: "asc" },
  });
  return rows.map(serializeFarmArea);
}

async function syncFarmAreaLinks(programId, estateId, { blockIds = [], vendorIds = [], assetOwnerIds = [] }) {
  if (Array.isArray(blockIds)) {
    if (blockIds.length) {
      const blocks = await prisma.farm_blocks.findMany({
        where: { id: { in: blockIds }, programId },
        select: { id: true },
      });
      if (blocks.length !== blockIds.length) {
        throw new AppError(400, "VALIDATION_ERROR", "One or more blocks are outside the active programme");
      }
    }
    await prisma.farm_blocks.updateMany({
      where: { farmEstateId: estateId, programId, id: { notIn: blockIds } },
      data: { farmEstateId: null, updatedAt: new Date() },
    });
    if (blockIds.length) {
      await prisma.farm_blocks.updateMany({
        where: { id: { in: blockIds }, programId },
        data: { farmEstateId: estateId, updatedAt: new Date() },
      });
    }
  }

  if (Array.isArray(vendorIds) && vendorIds.length) {
    const vendors = await prisma.vendors.findMany({
      where: { id: { in: vendorIds } },
      select: { id: true },
    });
    if (vendors.length !== vendorIds.length) {
      throw new AppError(400, "VALIDATION_ERROR", "One or more vendors were not found");
    }
  }

  await prisma.farm_estate_vendors.deleteMany({ where: { farmEstateId: estateId } });
  if (vendorIds.length) {
    await prisma.farm_estate_vendors.createMany({
      data: vendorIds.map((vendorId) => ({
        id: uuid("fev"),
        farmEstateId: estateId,
        vendorId,
        isPrimary: true,
      })),
      skipDuplicates: true,
    });
  }

  if (Array.isArray(assetOwnerIds) && assetOwnerIds.length) {
    const owners = await prisma.asset_owners.findMany({
      where: { id: { in: assetOwnerIds } },
      select: { id: true },
    });
    if (owners.length !== assetOwnerIds.length) {
      throw new AppError(400, "VALIDATION_ERROR", "One or more asset owners were not found");
    }
  }

  await prisma.farm_estate_asset_owners.deleteMany({ where: { farmEstateId: estateId } });
  if (assetOwnerIds.length) {
    await prisma.farm_estate_asset_owners.createMany({
      data: assetOwnerIds.map((assetOwnerId) => ({
        id: uuid("feo"),
        farmEstateId: estateId,
        assetOwnerId,
      })),
      skipDuplicates: true,
    });
  }
}

async function createFarmArea(user, input) {
  assertManage(user);
  const programId = requireProgramId(user);
  const name = String(input.name || "").trim();
  if (!name) throw new AppError(400, "VALIDATION_ERROR", "Name is required");
  if (!input.organizationId) throw new AppError(400, "VALIDATION_ERROR", "A farm area must belong to an organization");

  const created = await prisma.farm_estates.create({
    data: {
      id: uuid("fe"),
      programId,
      name,
      ownerOrganizationId: input.organizationId,
      totalAreaHa: num(input.totalHectares),
      status: input.status === "inactive" ? "inactive" : "active",
      updatedAt: new Date(),
    },
  });

  await syncFarmAreaLinks(programId, created.id, input);
  const full = await prisma.farm_estates.findUnique({ where: { id: created.id }, include: farmAreaInclude });
  return serializeFarmArea(full);
}

async function updateFarmArea(user, id, input) {
  assertManage(user);
  const programId = requireProgramId(user);
  const existing = await prisma.farm_estates.findFirst({ where: { id, programId } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Farm area not found");
  const name = String(input.name || "").trim();
  if (!name) throw new AppError(400, "VALIDATION_ERROR", "Name is required");
  if (!input.organizationId) throw new AppError(400, "VALIDATION_ERROR", "A farm area must belong to an organization");

  await prisma.farm_estates.update({
    where: { id },
    data: {
      name,
      ownerOrganizationId: input.organizationId,
      totalAreaHa: num(input.totalHectares),
      status: input.status === "inactive" ? "inactive" : "active",
      updatedAt: new Date(),
    },
  });
  await syncFarmAreaLinks(programId, id, input);
  const full = await prisma.farm_estates.findUnique({ where: { id }, include: farmAreaInclude });
  return serializeFarmArea(full);
}

async function deleteFarmArea(user, id) {
  assertManage(user);
  const programId = requireProgramId(user);
  const existing = await prisma.farm_estates.findFirst({ where: { id, programId } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Farm area not found");
  await prisma.farm_blocks.updateMany({
    where: { farmEstateId: id },
    data: { farmEstateId: null, updatedAt: new Date() },
  });
  await prisma.farm_estate_vendors.deleteMany({ where: { farmEstateId: id } });
  await prisma.farm_estate_asset_owners.deleteMany({ where: { farmEstateId: id } });
  await prisma.farm_estates.delete({ where: { id } });
  return { ok: true };
}

async function listVendors(user) {
  assertView(user);
  const programId = requireProgramId(user);
  const rows = await prisma.vendors.findMany({
    where: {
      farm_estate_vendors: { some: { farm_estates: { programId } } },
    },
    include: vendorInclude,
    orderBy: { name: "asc" },
  });
  return rows.map(serializeVendor);
}

async function syncVendorEstateLinks(programId, vendorId, farmAreaIds = [], blockIds = []) {
  const estateIds = new Set(farmAreaIds);
  if (blockIds.length) {
    const blocks = await prisma.farm_blocks.findMany({
      where: { id: { in: blockIds }, programId },
      select: { farmEstateId: true },
    });
    if (blocks.length !== blockIds.length) {
      throw new AppError(400, "VALIDATION_ERROR", "One or more blocks are outside the active programme");
    }
    for (const b of blocks) if (b.farmEstateId) estateIds.add(b.farmEstateId);
  }
  if (estateIds.size === 0) {
    throw new AppError(400, "VALIDATION_ERROR", "Assign the vendor to at least one farm area or block");
  }
  const estates = await prisma.farm_estates.findMany({
    where: { id: { in: [...estateIds] }, programId },
    select: { id: true },
  });
  if (estates.length !== estateIds.size) {
    throw new AppError(400, "VALIDATION_ERROR", "One or more farm areas are outside the active programme");
  }
  await prisma.farm_estate_vendors.deleteMany({ where: { vendorId } });
  await prisma.farm_estate_vendors.createMany({
    data: [...estateIds].map((farmEstateId) => ({
      id: uuid("fev"),
      farmEstateId,
      vendorId,
      isPrimary: true,
    })),
  });
}

async function createVendor(user, input) {
  assertManage(user);
  const programId = requireProgramId(user);
  const name = String(input.name || "").trim();
  if (!name) throw new AppError(400, "VALIDATION_ERROR", "Name is required");
  let slug = slugify(name) || uuid("vnd").slice(0, 12);
  if (await prisma.organizations.findUnique({ where: { slug } })) {
    slug = `${slug}-${Date.now().toString(36)}`;
  }
  const org = await prisma.organizations.create({
    data: {
      id: uuid("org"),
      name,
      slug,
      displayName: name,
      type: "vendor",
      active: input.status !== "terminated" && input.status !== "expired",
      status: "active",
    },
  });
  const created = await prisma.vendors.create({
    data: {
      id: uuid("vnd"),
      organizationId: org.id,
      name,
      category: String(input.category || "general"),
      servicesProvided: "",
      prequalified: Boolean(input.prequalified),
      insuranceOnFile: Boolean(input.insuranceOnFile),
      status: input.status || "pending",
      updatedAt: new Date(),
    },
  });
  await syncVendorEstateLinks(programId, created.id, input.farmAreaIds || [], input.blockIds || []);
  const full = await prisma.vendors.findUnique({ where: { id: created.id }, include: vendorInclude });
  return serializeVendor(full);
}

async function updateVendor(user, id, input) {
  assertManage(user);
  const programId = requireProgramId(user);
  const existing = await prisma.vendors.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Vendor not found");
  const name = String(input.name || "").trim();
  if (!name) throw new AppError(400, "VALIDATION_ERROR", "Name is required");
  await prisma.vendors.update({
    where: { id },
    data: {
      name,
      category: String(input.category || existing.category),
      prequalified: Boolean(input.prequalified),
      insuranceOnFile: Boolean(input.insuranceOnFile),
      status: input.status || existing.status,
      updatedAt: new Date(),
    },
  });
  await prisma.organizations.update({
    where: { id: existing.organizationId },
    data: { name, displayName: name },
  });
  await syncVendorEstateLinks(programId, id, input.farmAreaIds || [], input.blockIds || []);
  const full = await prisma.vendors.findUnique({ where: { id }, include: vendorInclude });
  return serializeVendor(full);
}

async function deleteVendor(user, id) {
  assertManage(user);
  const existing = await prisma.vendors.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Vendor not found");
  const links = await prisma.farm_estate_vendors.count({ where: { vendorId: id } });
  if (links > 0) throw new AppError(409, "IN_USE", "Unlink this vendor from farm areas before deleting");
  await prisma.vendors.delete({ where: { id } });
  await prisma.organizations.delete({ where: { id: existing.organizationId } }).catch(() => null);
  return { ok: true };
}

async function listAssetOwners(user) {
  assertView(user);
  const programId = requireProgramId(user);
  const rows = await prisma.asset_owners.findMany({
    where: {
      farm_estate_asset_owners: { some: { farm_estates: { programId } } },
    },
    include: { farm_estate_asset_owners: true },
    orderBy: { name: "asc" },
  });
  return rows.map(serializeAssetOwner);
}

async function syncOwnerEstateLinks(programId, assetOwnerId, farmAreaIds = []) {
  if (farmAreaIds.length) {
    const estates = await prisma.farm_estates.findMany({
      where: { id: { in: farmAreaIds }, programId },
      select: { id: true },
    });
    if (estates.length !== farmAreaIds.length) {
      throw new AppError(400, "VALIDATION_ERROR", "One or more farm areas are outside the active programme");
    }
  }
  await prisma.farm_estate_asset_owners.deleteMany({ where: { assetOwnerId } });
  if (farmAreaIds.length) {
    await prisma.farm_estate_asset_owners.createMany({
      data: farmAreaIds.map((farmEstateId) => ({
        id: uuid("feo"),
        farmEstateId,
        assetOwnerId,
      })),
      skipDuplicates: true,
    });
  }
}

async function createAssetOwner(user, input) {
  assertManage(user);
  const programId = requireProgramId(user);
  const name = String(input.name || "").trim();
  if (!name) throw new AppError(400, "VALIDATION_ERROR", "Name is required");
  const created = await prisma.asset_owners.create({
    data: {
      id: uuid("ao"),
      name,
      organizationId: input.organizationId || null,
      contactEmail: input.contactEmail || null,
      contactPhone: input.contactPhone || null,
    },
  });
  await syncOwnerEstateLinks(programId, created.id, input.farmAreaIds || []);
  const full = await prisma.asset_owners.findUnique({
    where: { id: created.id },
    include: { farm_estate_asset_owners: true },
  });
  return serializeAssetOwner(full);
}

async function updateAssetOwner(user, id, input) {
  assertManage(user);
  const programId = requireProgramId(user);
  const existing = await prisma.asset_owners.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Asset owner not found");
  const name = String(input.name || "").trim();
  if (!name) throw new AppError(400, "VALIDATION_ERROR", "Name is required");
  await prisma.asset_owners.update({
    where: { id },
    data: {
      name,
      organizationId: input.organizationId || null,
      contactEmail: input.contactEmail || null,
      contactPhone: input.contactPhone || null,
    },
  });
  await syncOwnerEstateLinks(programId, id, input.farmAreaIds || []);
  const full = await prisma.asset_owners.findUnique({
    where: { id },
    include: { farm_estate_asset_owners: true },
  });
  return serializeAssetOwner(full);
}

async function deleteAssetOwner(user, id) {
  assertManage(user);
  const existing = await prisma.asset_owners.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, "NOT_FOUND", "Asset owner not found");
  const links = await prisma.farm_estate_asset_owners.count({ where: { assetOwnerId: id } });
  if (links > 0) throw new AppError(409, "IN_USE", "Unlink this asset owner from farm areas before deleting");
  await prisma.asset_owners.delete({ where: { id } });
  return { ok: true };
}

async function getFarmMapOverview(user) {
  assertView(user);
  const programId = requireProgramId(user);
  const areas = await prisma.farm_estates.findMany({
    where: { programId },
    include: {
      organizations: true,
      farm_blocks: { select: { id: true } },
      farm_estate_vendors: { include: { vendors: true } },
      farm_estate_asset_owners: { include: { asset_owners: true } },
    },
    orderBy: { name: "asc" },
  });
  return areas.map((fa) => ({
    farmAreaId: fa.id,
    farmAreaName: fa.name,
    organizationId: fa.ownerOrganizationId || "",
    organizationName: fa.organizations?.name || "—",
    organizationType: toUiOrgType(fa.organizations?.type || "vendor"),
    assetOwners: fa.farm_estate_asset_owners.map((l) => l.asset_owners?.name).filter(Boolean),
    primaryVendors: fa.farm_estate_vendors.map((l) => l.vendors?.name).filter(Boolean),
    blocksCount: fa.farm_blocks.length,
    hectares: num(fa.totalAreaHa) ?? 0,
    status: fa.status === "inactive" ? "inactive" : "active",
  }));
}

module.exports = {
  listOrganizations,
  createOrganization,
  updateOrganization,
  deleteOrganization,
  listBlocks,
  createBlock,
  updateBlock,
  deleteBlock,
  listFarmAreas,
  createFarmArea,
  updateFarmArea,
  deleteFarmArea,
  listVendors,
  createVendor,
  updateVendor,
  deleteVendor,
  listAssetOwners,
  createAssetOwner,
  updateAssetOwner,
  deleteAssetOwner,
  getFarmMapOverview,
};
