/**
 * Restore demo user accounts only (no programmes / operational data).
 * Password for all: Password123!
 */
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient({ log: ["error", "warn"] });
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
  await prisma.$connect();
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

  const users = [
    { id: "usr_silva_owner", name: "Amara Silva", email: "owner@silva.example", role: "silva_owner", organizationId: silva.id },
    { id: "usr_silva_cm", name: "Sara Country Manager", email: "cm@silva.example", role: "silva_country_manager", organizationId: silva.id },
    { id: "usr_silva_finance", name: "Helen Finance", email: "finance@silva.example", role: "silva_finance", organizationId: silva.id },
    { id: "usr_system_admin", name: "System Admin", email: "admin@spx.example", role: "system_admin", organizationId: spx.id },
    { id: "usr_spx_principal", name: "Daniel SPX", email: "principal@spx.example", role: "spx_principal", organizationId: spx.id },
    { id: "usr_spx_handler", name: "Maya Account Handler", email: "handler@spx.example", role: "spx_account_handler", organizationId: spx.id },
    { id: "usr_spx_supervisor", name: "Jonas Field Supervisor", email: "supervisor@spx.example", role: "spx_field_supervisor", organizationId: spx.id },
    { id: "usr_bagro_admin", name: "Tigist Vendor Admin", email: "admin@bagro.example", role: "vendor_admin", organizationId: bagro.id },
    { id: "usr_bagro_manager", name: "Yonas Vendor Manager", email: "manager@bagro.example", role: "vendor_manager", organizationId: bagro.id },
    { id: "usr_bagro_supervisor", name: "Betty Site Supervisor", email: "supervisor@bagro.example", role: "vendor_supervisor", organizationId: bagro.id },
    { id: "usr_bagro_lead", name: "Lemma Bekele", email: "lead@bagro.example", role: "vendor_field_lead", organizationId: bagro.id },
    { id: "usr_bagro_worker", name: "Abebe Field Worker", email: "worker@bagro.example", role: "vendor_worker", organizationId: bagro.id },
  ];

  for (const u of users) {
    await prisma.users.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        role: u.role,
        organizationId: u.organizationId,
        activeProgramId: null,
        vendorId: null,
        active: true,
        passwordHash,
      },
      create: {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        organizationId: u.organizationId,
        activeProgramId: null,
        active: true,
        passwordHash,
      },
    });
    console.log(`  restored ${u.email}`);
  }

  const count = await prisma.users.count();
  console.log(`Done. users=${count} (password: ${PASSWORD})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
