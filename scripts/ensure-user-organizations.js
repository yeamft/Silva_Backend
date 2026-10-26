require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({ log: ["error", "warn"] });

async function ensureOrganization(client, { id, name, slug, type }) {
  const existing = await client.organizations.findFirst({
    where: { type, active: true },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;

  const sameSlug = await client.organizations.findUnique({ where: { slug } });
  if (sameSlug) {
    const [users, memberships, estates, assetOwners, vendor] = await Promise.all([
      client.users.count({ where: { organizationId: sameSlug.id } }),
      client.program_memberships.count({ where: { organizationId: sameSlug.id } }),
      client.farm_estates.count({ where: { ownerOrganizationId: sameSlug.id } }),
      client.asset_owners.count({ where: { organizationId: sameSlug.id } }),
      client.vendors.count({ where: { organizationId: sameSlug.id } }),
    ]);

    if (users + memberships + estates + assetOwners + vendor > 0) {
      throw new Error(
        `Organization "${sameSlug.name}" has existing relationships and cannot be safely reclassified.`,
      );
    }

    return client.organizations.update({
      where: { id: sameSlug.id },
      data: { type, active: true, status: "active" },
    });
  }

  return client.organizations.create({
    data: {
      id,
      name,
      slug,
      displayName: name,
      type,
      active: true,
      status: "active",
    },
  });
}

async function main() {
  await prisma.$transaction(async (tx) => {
    const silva = await ensureOrganization(tx, {
      id: "org_silva",
      name: "Silva",
      slug: "silva",
      type: "silva",
    });
    const vendor = await ensureOrganization(tx, {
      id: "org_bagro",
      name: "B-Agro",
      slug: "b-agro",
      type: "vendor",
    });
    console.log(`Ready for user creation: ${silva.name} (${silva.type}), ${vendor.name} (${vendor.type})`);
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
