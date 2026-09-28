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

  const programChaka = await prisma.programs.upsert({
    where: { id: "prg_chaka" },
    update: { name: "Chaka Buna Estate", slug: "chaka", status: "active" },
    create: {
      id: "prg_chaka",
      name: "Chaka Buna Estate",
      slug: "chaka",
      status: "active",
      createdByOrgId: spx.id,
    },
  });

  const programMemberships = [
    {
      programId: program.id,
      rows: [
        { id: "pm_silva", organizationId: silva.id, roleInProgram: "owner" },
        { id: "pm_spx", organizationId: spx.id, roleInProgram: "manager" },
        { id: "pm_bagro", organizationId: bagro.id, roleInProgram: "executor" },
      ],
    },
    {
      programId: programChaka.id,
      rows: [
        { id: "pm_chaka_silva", organizationId: silva.id, roleInProgram: "owner" },
        { id: "pm_chaka_spx", organizationId: spx.id, roleInProgram: "manager" },
        { id: "pm_chaka_bagro", organizationId: bagro.id, roleInProgram: "executor" },
      ],
    },
  ];

  for (const block of programMemberships) {
    for (const m of block.rows) {
      await prisma.program_memberships.upsert({
        where: {
          programId_organizationId: {
            programId: block.programId,
            organizationId: m.organizationId,
          },
        },
        update: { roleInProgram: m.roleInProgram },
        create: {
          id: m.id,
          programId: block.programId,
          organizationId: m.organizationId,
          roleInProgram: m.roleInProgram,
        },
      });
    }
  }

  await prisma.vendors.upsert({
    where: { organizationId: bagro.id },
    update: {
      name: "B-Agro / RFSP",
      category: "Estate execution",
      status: "active",
      prequalified: true,
      isDefaultExecutionPartner: true,
      updatedAt: new Date(),
    },
    create: {
      id: "vnd_bagro",
      organizationId: bagro.id,
      name: "B-Agro / RFSP",
      category: "Estate execution",
      servicesProvided: "Field execution",
      prequalified: true,
      insuranceOnFile: true,
      status: "active",
      isDefaultExecutionPartner: true,
      updatedAt: new Date(),
    },
  });

  const users = [
    // Silva
    {
      id: "usr_silva_owner",
      name: "Amara Silva",
      email: "owner@silva.example",
      role: "silva_owner",
      organizationId: silva.id,
    },
    {
      id: "usr_silva_cm",
      name: "Sara Country Manager",
      email: "cm@silva.example",
      role: "silva_country_manager",
      organizationId: silva.id,
    },
    {
      id: "usr_silva_finance",
      name: "Helen Finance",
      email: "finance@silva.example",
      role: "silva_finance",
      organizationId: silva.id,
    },
    // SPX
    {
      id: "usr_system_admin",
      name: "System Admin",
      email: "admin@spx.example",
      role: "system_admin",
      organizationId: spx.id,
    },
    {
      id: "usr_spx_principal",
      name: "Daniel SPX",
      email: "principal@spx.example",
      role: "spx_principal",
      organizationId: spx.id,
    },
    {
      id: "usr_spx_handler",
      name: "Maya Account Handler",
      email: "handler@spx.example",
      role: "spx_account_handler",
      organizationId: spx.id,
    },
    {
      id: "usr_spx_supervisor",
      name: "Jonas Field Supervisor",
      email: "supervisor@spx.example",
      role: "spx_field_supervisor",
      organizationId: spx.id,
    },
    // Vendor (B-Agro / RFSP)
    {
      id: "usr_bagro_admin",
      name: "Tigist Vendor Admin",
      email: "admin@bagro.example",
      role: "vendor_admin",
      organizationId: bagro.id,
    },
    {
      id: "usr_bagro_manager",
      name: "Yonas Vendor Manager",
      email: "manager@bagro.example",
      role: "vendor_manager",
      organizationId: bagro.id,
    },
    {
      id: "usr_bagro_supervisor",
      name: "Betty Site Supervisor",
      email: "supervisor@bagro.example",
      role: "vendor_supervisor",
      organizationId: bagro.id,
    },
    {
      id: "usr_bagro_lead",
      name: "Lemma Bekele",
      email: "lead@bagro.example",
      role: "vendor_field_lead",
      organizationId: bagro.id,
    },
    {
      id: "usr_bagro_worker",
      name: "Abebe Field Worker",
      email: "worker@bagro.example",
      role: "vendor_worker",
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

  const defaultCategories = [
    { value: "labour", label: "Labour" },
    { value: "material", label: "Material" },
    { value: "machinery", label: "Machinery" },
    { value: "transport", label: "Transport" },
    { value: "other", label: "Other" },
  ];

  for (const programId of [program.id, programChaka.id]) {
    for (const c of defaultCategories) {
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

  const seedLines = [
    {
      id: "rc_lab_prune",
      resourceCode: "LAB-PRUNE",
      resourceName: "Pruning labour",
      resourceType: "labour",
      unitOfMeasure: "person-day",
      rateEtb: 450,
      budgetYear: 2026,
      benchmarkFarmARate: 420,
      benchmarkFarmBRate: 440,
      status: "approved",
      effectiveFrom: new Date("2026-01-01"),
      effectiveTo: new Date("2026-12-31"),
    },
    {
      id: "rc_lab_pick",
      resourceCode: "LAB-PICK",
      resourceName: "Cherry picking",
      resourceType: "labour",
      unitOfMeasure: "kg",
      rateEtb: 18.5,
      budgetYear: 2026,
      benchmarkFarmARate: 17,
      benchmarkFarmBRate: 19,
      status: "approved",
      effectiveFrom: new Date("2026-01-01"),
      effectiveTo: new Date("2026-12-31"),
    },
    {
      id: "rc_mac_tract",
      resourceCode: "MAC-TRACT",
      resourceName: "Tractor hire 75hp",
      resourceType: "machinery",
      unitOfMeasure: "hour",
      rateEtb: 1850,
      budgetYear: 2026,
      benchmarkFarmARate: 1400,
      benchmarkFarmBRate: 1450,
      spxJustificationNote: "Peak-season hire shortage",
      status: "draft",
      effectiveFrom: new Date("2026-06-01"),
      effectiveTo: null,
    },
    {
      id: "rc_mat_lime",
      resourceCode: "MAT-LIME",
      resourceName: "Agricultural lime",
      resourceType: "material",
      unitOfMeasure: "t",
      rateEtb: 4200,
      budgetYear: 2026,
      benchmarkFarmARate: 3900,
      benchmarkFarmBRate: 4100,
      status: "submitted",
      submittedAt: new Date(),
      effectiveFrom: null,
      effectiveTo: null,
    },
  ];

  const creatorId = "usr_spx_principal";
  for (const line of seedLines) {
    await prisma.rate_card_lines.upsert({
      where: { id: line.id },
      update: {
        ...line,
        programId: program.id,
        createdByUserId: creatorId,
        spxJustificationNote: line.spxJustificationNote || null,
      },
      create: {
        ...line,
        programId: program.id,
        createdByUserId: creatorId,
        spxJustificationNote: line.spxJustificationNote || null,
      },
    });
  }

  const { seedActivities } = require("./seedActivities");
  await seedActivities(prisma);

  console.log("Auth seed complete.");
  console.log("Programs: Silva Kaffa Coffee Program, Chaka Buna Estate");
  console.log("Activity taxonomy seeded from Cropfort Coffee Field OS Template");
  console.log("Users (password Password123!):");
  for (const u of users) {
    console.log(`  ${u.email}  (${u.role})`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
