/**
 * Seed only the minimum required rows to log in as admin@spx.example.
 * Safe to run against a wiped production database.
 *
 * Usage:
 *   DATABASE_URL="..." node scripts/seed-admin-only.js
 */

const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("Password123!", 12);

  // 1. SPX org (required FK for the user)
  const spx = await prisma.organizations.upsert({
    where: { id: "org_spx" },
    update: {},
    create: {
      id: "org_spx",
      name: "SPX",
      slug: "spx",
      displayName: "SPX",
      type: "spx",
      active: true,
      status: "active",
    },
  });

  // 2. A program so activeProgramId is not null (required for most API calls)
  const program = await prisma.programs.upsert({
    where: { id: "prg_shecha" },
    update: {},
    create: {
      id: "prg_shecha",
      name: "Silva Kaffa Coffee Program",
      slug: "shecha",
      status: "active",
      createdByOrgId: spx.id,
    },
  });

  // 3. Program membership for SPX org
  await prisma.program_memberships.upsert({
    where: { programId_organizationId: { programId: program.id, organizationId: spx.id } },
    update: {},
    create: {
      id: "pm_spx",
      programId: program.id,
      organizationId: spx.id,
      roleInProgram: "manager",
    },
  });

  // 4. Admin user
  await prisma.users.upsert({
    where: { email: "admin@spx.example" },
    update: { passwordHash, active: true, activeProgramId: program.id },
    create: {
      id: "usr_system_admin",
      name: "System Admin",
      email: "admin@spx.example",
      role: "system_admin",
      organizationId: spx.id,
      activeProgramId: program.id,
      active: true,
      passwordHash,
    },
  });

  console.log("Done. Login: admin@spx.example / Password123!");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
