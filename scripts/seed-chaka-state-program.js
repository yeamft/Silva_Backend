/**
 * Seed "Chaka State Program" and assign it to SPX admin users.
 * Usage: node scripts/seed-chaka-state-program.js
 */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({ log: ["error", "warn"] });

const PROGRAM_ID = "prg_chaka_state";
const PROGRAM_NAME = "Chaka State Program";
const PROGRAM_SLUG = "chaka-state-program";

async function main() {
  await prisma.$connect();

  const spx = await prisma.organizations.findFirst({
    where: { OR: [{ id: "org_spx" }, { type: "spx" }, { slug: "spx" }] },
  });
  if (!spx) throw new Error("SPX organization not found. Restore users/orgs first.");

  const silva = await prisma.organizations.findFirst({
    where: { OR: [{ id: "org_silva" }, { type: "silva" }, { slug: "silva" }] },
  });
  const bagro = await prisma.organizations.findFirst({
    where: { OR: [{ id: "org_bagro" }, { type: "vendor" }, { slug: "b-agro" }] },
  });

  const program = await prisma.programs.upsert({
    where: { id: PROGRAM_ID },
    update: {
      name: PROGRAM_NAME,
      slug: PROGRAM_SLUG,
      status: "active",
      createdByOrgId: spx.id,
    },
    create: {
      id: PROGRAM_ID,
      name: PROGRAM_NAME,
      slug: PROGRAM_SLUG,
      status: "active",
      createdByOrgId: spx.id,
    },
  });

  const memberships = [
    { id: "pm_chaka_state_spx", organizationId: spx.id, roleInProgram: "manager" },
  ];
  if (silva) {
    memberships.push({
      id: "pm_chaka_state_silva",
      organizationId: silva.id,
      roleInProgram: "owner",
    });
  }
  if (bagro) {
    memberships.push({
      id: "pm_chaka_state_bagro",
      organizationId: bagro.id,
      roleInProgram: "executor",
    });
  }

  for (const m of memberships) {
    await prisma.program_memberships.upsert({
      where: {
        programId_organizationId: {
          programId: program.id,
          organizationId: m.organizationId,
        },
      },
      update: { roleInProgram: m.roleInProgram },
      create: {
        id: m.id,
        programId: program.id,
        organizationId: m.organizationId,
        roleInProgram: m.roleInProgram,
      },
    });
  }

  // Default categories so rate-card UI isn't empty when opened.
  const categories = [
    { value: "labour", label: "Labour" },
    { value: "material", label: "Material" },
    { value: "machinery", label: "Machinery" },
    { value: "transport", label: "Transport" },
    { value: "other", label: "Other" },
  ];
  for (const c of categories) {
    await prisma.rate_card_categories.upsert({
      where: { programId_value: { programId: program.id, value: c.value } },
      update: { label: c.label, active: true },
      create: {
        id: `rcc_${program.id}_${c.value}`,
        programId: program.id,
        value: c.value,
        label: c.label,
        active: true,
      },
    });
  }

  const admins = await prisma.users.updateMany({
    where: {
      organizationId: spx.id,
      role: { in: ["system_admin", "spx_principal"] },
    },
    data: { activeProgramId: program.id },
  });

  console.log(`Program: ${program.name} (${program.id})`);
  console.log(`Memberships: ${memberships.length}`);
  console.log(`SPX admin activeProgram set: ${admins.count} user(s)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
