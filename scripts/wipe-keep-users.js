/**
 * Wipe all operational data; keep users + organizations.
 * Uses DELETE (not TRUNCATE CASCADE) so FKs from users → programs/vendors
 * cannot cascade-delete user rows.
 *
 * Usage: node scripts/wipe-keep-users.js
 */
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({ log: ["error", "warn"] });

const KEEP = new Set(["users", "organizations", "_prisma_migrations"]);

async function main() {
  console.log("Connecting…");
  await prisma.$connect();

  const beforeUsers = await prisma.users.count();
  const beforeOrgs = await prisma.organizations.count();
  console.log(`Keeping ${beforeUsers} users and ${beforeOrgs} organizations.`);

  await prisma.users.updateMany({
    data: { activeProgramId: null, vendorId: null },
  });

  const rows = await prisma.$queryRaw`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `;

  const targets = rows
    .map((r) => r.tablename)
    .filter((name) => !KEEP.has(name));

  // Disable triggers/FKs for this session, delete table contents, re-enable.
  // Safer than TRUNCATE CASCADE (which would wipe users via FKs to programs/vendors).
  await prisma.$executeRawUnsafe(`SET session_replication_role = 'replica'`);
  try {
    for (const table of targets) {
      const result = await prisma.$executeRawUnsafe(`DELETE FROM "${table}"`);
      if (result > 0) console.log(`  cleared ${table}: ${result}`);
    }
  } finally {
    await prisma.$executeRawUnsafe(`SET session_replication_role = 'origin'`);
  }

  const afterUsers = await prisma.users.count();
  const afterOrgs = await prisma.organizations.count();
  const afterPrograms = await prisma.programs.count();

  console.log("Done.");
  console.log(`  users: ${afterUsers} (was ${beforeUsers})`);
  console.log(`  organizations: ${afterOrgs} (was ${beforeOrgs})`);
  console.log(`  programs: ${afterPrograms}`);

  if (afterUsers !== beforeUsers) {
    throw new Error(`User count changed unexpectedly (${beforeUsers} → ${afterUsers})`);
  }
}

main()
  .catch((err) => {
    console.error("Wipe failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
