const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const PASSWORD = "Password123!";

async function upsertOrg({ id, name, slug, type }) {
  return prisma.organizations.upsert({
    where: { id },
    update: { name, slug, displayName: name, type, active: true, status: "active" },
    create: {
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
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const silva = await upsertOrg({
    id: "org_silva",
    name: "Silva",
    slug: "silva",
    type: "silva",
  });
  const spx = await upsertOrg({
    id: "org_spx",
    name: "SPX",
    slug: "spx",
    type: "spx",
  });
  const bagro = await upsertOrg({
    id: "org_bagro",
    name: "B-Agro",
    slug: "b-agro",
    type: "vendor",
  });

  const program = await prisma.programs.upsert({
    where: { id: "prg_shecha" },
    update: { name: "Silva Kaffa Coffee Program", slug: "shecha", status: "active" },
    create: {
      id: "prg_shecha",
      name: "Silva Kaffa Coffee Program",
      slug: "shecha",
      status: "active",
      createdByOrgId: spx.id,
    },
  });

  const memberships = [
    { id: "pm_silva", organizationId: silva.id, roleInProgram: "owner" },
    { id: "pm_spx", organizationId: spx.id, roleInProgram: "manager" },
    { id: "pm_bagro", organizationId: bagro.id, roleInProgram: "executor" },
  ];
  for (const m of memberships) {
    await prisma.program_memberships.upsert({
      where: { programId_organizationId: { programId: program.id, organizationId: m.organizationId } },
      update: { roleInProgram: m.roleInProgram },
      create: {
        id: m.id,
        programId: program.id,
        organizationId: m.organizationId,
        roleInProgram: m.roleInProgram,
      },
    });
  }

  const users = [
    {
      id: "usr_silva_owner",
      name: "Amara Silva",
      email: "owner@silva.example",
      role: "silva_owner",
      organizationId: silva.id,
    },
    {
      id: "usr_spx_principal",
      name: "Daniel SPX",
      email: "principal@spx.example",
      role: "spx_principal",
      organizationId: spx.id,
    },
    {
      id: "usr_bagro_lead",
      name: "Lemma Bekele",
      email: "lead@bagro.example",
      role: "vendor_field_lead",
      organizationId: bagro.id,
    },
  ];

  for (const u of users) {
    await prisma.users.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        role: u.role,
        organizationId: u.organizationId,
        activeProgramId: program.id,
        active: true,
        passwordHash,
      },
      create: {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        organizationId: u.organizationId,
        activeProgramId: program.id,
        active: true,
        passwordHash,
      },
    });
  }

  console.log("Auth seed complete.");
  console.log("Users (password Password123!):");
  console.log("  owner@silva.example");
  console.log("  principal@spx.example");
  console.log("  lead@bagro.example");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
