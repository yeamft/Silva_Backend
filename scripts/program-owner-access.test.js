const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const program = {
  id: "program-1",
  name: "Farm Program",
  slug: "farm-program",
  status: "active",
  brandingJson: null,
  createdByOrgId: "spx-org",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  cropfortAfeBandAMaxEtb: 500000,
  cropfortAfeBandBMaxEtb: 2000000,
  cropfortAfeBandCMaxEtb: 5000000,
};

let membership;
let roleAssignment;
let linkedEstate;
let updatedUser;

const prisma = {
  program_memberships: {
    findUnique: async () => membership,
    findMany: async () => [],
  },
  cropfort_user_roles: {
    findFirst: async () => roleAssignment,
    findMany: async () => [],
  },
  farm_estates: {
    findFirst: async () => linkedEstate ? { id: "estate-1" } : null,
    findMany: async () => linkedEstate ? [{ programs: program }] : [],
  },
  programs: {
    findUnique: async () => program,
  },
  users: {
    update: async ({ data }) => {
      updatedUser = data;
    },
  },
};

const databasePath = require.resolve("../config/database");
require.cache[databasePath] = {
  id: databasePath,
  filename: databasePath,
  loaded: true,
  exports: prisma,
};

const service = require("../services/program.service");
const owner = {
  id: "owner-1",
  role: "silva_owner",
  organizationId: "owner-org",
  email: "owner@example.com",
};

beforeEach(() => {
  membership = null;
  roleAssignment = null;
  linkedEstate = true;
  updatedUser = null;
});

test("lists programs linked to the Silva owner's farm estate", async () => {
  const result = await service.listPrograms(owner);
  assert.deepEqual(result.map((row) => row.id), ["program-1"]);
  assert.equal(result[0].roleInProgram, "owner");
});

test("allows a linked Silva owner to switch to the farm program", async () => {
  const result = await service.switchProgram(owner, program.id);
  assert.equal(result.id, program.id);
  assert.deepEqual(updatedUser, { activeProgramId: program.id });
});

test("does not allow an unrelated user to switch into a farm program", async () => {
  linkedEstate = false;
  await assert.rejects(
    service.switchProgram({ ...owner, role: "spx_validator" }, program.id),
    (error) => error.statusCode === 403,
  );
});
