const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const ASSESSMENT_ID = "fa_test-id";
const author = { id: "spx", name: "SPX", role: "spx_validator", activeProgramId: "workspace" };
const fieldUser = { id: "field1", name: "Field Sup", role: "field_supervisor", activeProgramId: "workspace" };
const owner = { id: "owner", name: "Asset Owner", role: "farm_owner", activeProgramId: "workspace" };
const pdf = { originalname: "farm.pdf", buffer: Buffer.from("%PDF-1.4\nreport"), size: 15 };
let row, audits, alerts, conflict, notificationFailure;

const pick = (value, select) =>
  value && Object.fromEntries(Object.keys(select).map((key) => [key, value[key]]));

const db = {
  cropfort_farm_assessments: {
    findFirst: async ({ where, select }) => {
      if (!row) return null;
      if (where.id !== row.id) return null;
      if (where.programId && where.programId !== row.programId) return null;
      return pick(row, select);
    },
    findUnique: async ({ where, select }) => {
      if (!row || row.id !== where.id) return null;
      return pick(row, select);
    },
    create: async ({ data, select }) => {
      row = {
        id: data.id, planId: null, farmEstateId: null, programId: data.programId,
        planYear: null, title: data.title || "", planningCycle: null,
        assessmentDate: null, assessorName: data.assessorName || null,
        assessorUserId: data.assessorUserId || null,
        assessmentPurpose: "annual_baseline", assessedAreaHa: null,
        cropStage: null, generalCondition: null,
        findings: "", recommendedOps: [], blockIds: [],
        reportName: null, reportData: null, reportSize: null,
        revision: 1, status: "draft", returnedComment: null,
        submittedByUserId: null, submittedAt: null, reviewedAt: null,
        history: [], createdAt: new Date(), updatedAt: new Date(),
        ...data,
      };
      return pick(row, select);
    },
    updateMany: async ({ where, data }) => {
      if (conflict || !row || row.revision !== where.revision) return { count: 0 };
      const inc = data.revision?.increment ?? 0;
      row = { ...row, ...data, revision: row.revision + inc };
      return { count: 1 };
    },
    groupBy: async () => [],
    findMany: async ({ where, select }) => {
      if (!row) return [];
      if (where.programId && where.programId !== row.programId) return [];
      return [pick(row, select)];
    },
  },
  audit_log: { create: async ({ data }) => audits.push(data) },
  $transaction: async (fn) => {
    const previous = row && { ...row };
    const auditCount = audits.length;
    try { return await fn(db); }
    catch (err) { row = previous; audits.length = auditCount; throw err; }
  },
};

const databasePath = require.resolve("../config/database");
require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: db };
const notificationsPath = require.resolve("../services/notifications.service");
require.cache[notificationsPath] = {
  id: notificationsPath, filename: notificationsPath, loaded: true,
  exports: {
    notifyFarmAssessment: async (p, a, action, _name, tx) => {
      assert.equal(tx, db);
      if (notificationFailure) throw new Error("Notifications unavailable");
      alerts.push({ assessmentId: p.id, status: a.status, action });
    },
  },
};

const service = require("../services/farmAssessment.service");
const schemas = require("../schemas/farmAssessment");

beforeEach(() => {
  row = null;
  audits = [];
  alerts = [];
  conflict = false;
  notificationFailure = false;
});

// Helpers — all use the assessment id directly
const save = (findings = "Irrigation repairs needed", file = pdf) =>
  service.save(author, ASSESSMENT_ID, { findings, revision: row?.revision || 0 }, file);
const submit = () => service.submit(author, ASSESSMENT_ID, { revision: row.revision });
const decide = (decision, comment = "") =>
  service.decide(owner, ASSESSMENT_ID, { revision: row.revision, decision, comment });
const rejectsCode = (promise, code) =>
  assert.rejects(promise, (error) => error.code === code);

// Seed a row so save/submit/decide have something to work with
async function seedRow(overrides = {}) {
  row = {
    id: ASSESSMENT_ID, planId: null, farmEstateId: "farm1", programId: "workspace",
    planYear: 2026, title: "Chaka Annual Farm Assessment — 2026 Programme",
    planningCycle: "2026 Programme", assessmentDate: null,
    assessorName: "SPX", assessorUserId: "spx",
    assessmentPurpose: "annual_baseline", assessedAreaHa: null,
    cropStage: null, generalCondition: null,
    findings: "", recommendedOps: [], blockIds: [],
    reportName: null, reportData: null, reportSize: null,
    revision: 0, status: "draft", returnedComment: null,
    submittedByUserId: null, submittedAt: null, reviewedAt: null,
    history: [], createdAt: new Date(), updatedAt: new Date(),
    ...overrides,
  };
}

test("assessment lifecycle: upload, submit, changes, resubmit, approve, with history", async () => {
  await seedRow();
  let dto = await save();
  assert.equal(dto.reportName, "farm.pdf");
  assert.equal(dto.reportData, undefined);
  assert.equal(dto.canEdit, true);
  assert.deepEqual((await service.download(owner, ASSESSMENT_ID)).reportData, pdf.buffer);
  dto = await submit();
  assert.equal(dto.status, "submitted");
  assert.equal(dto.canEdit, false);
  assert.equal((await service.get(owner, ASSESSMENT_ID)).canReview, true);
  await decide("request_changes", "Include soil analysis");
  assert.equal((await service.get(author, ASSESSMENT_ID)).canEdit, true);
  await save("Soil analysis added", null);
  assert.equal(row.reportName, "farm.pdf");
  await submit();
  dto = await decide("approve", "Assessment accepted");
  assert.equal(dto.status, "approved");
  assert.equal(dto.history.length, 4);
  assert.equal(dto.history[1].comment, "Include soil analysis");
  assert.equal(dto.canReview, false);
  assert.equal(alerts.length, 4);
  assert.equal(audits.length, 6);
});

test("assessment titles omit the generated em dash separator", async () => {
  await seedRow();
  const dto = await service.get(author, ASSESSMENT_ID);
  assert.equal(dto.title, "Chaka Annual Farm Assessment 2026 Programme");
});

test("workspace isolation applies to reads, downloads and writes", async () => {
  await seedRow();
  const other = { ...author, activeProgramId: "elsewhere" };
  await rejectsCode(service.get(other, ASSESSMENT_ID), "NOT_FOUND");
  await rejectsCode(service.download(other, ASSESSMENT_ID), "NOT_FOUND");
  await rejectsCode(service.save(other, ASSESSMENT_ID, { findings: "x", revision: 0 }, pdf), "NOT_FOUND");
});

test("field_supervisor and bagro_office can write and submit assessments", async () => {
  await seedRow();
  const dto = await service.save(fieldUser, ASSESSMENT_ID, { findings: "Field observation", revision: 0 }, pdf);
  assert.equal(dto.canEdit, true);
  await service.submit(fieldUser, ASSESSMENT_ID, { revision: dto.revision });
  assert.equal(row.status, "submitted");
});

test("only asset owner approvers may decide, and cannot self-approve", async () => {
  await seedRow();
  await save();
  await submit();
  await rejectsCode(service.decide(author, ASSESSMENT_ID, { revision: row.revision, decision: "approve" }), "FORBIDDEN");
  await rejectsCode(service.get({ ...owner, role: "vendor_worker" }, ASSESSMENT_ID), "FORBIDDEN");
});

test("dual-role authors cannot review their own submissions", async () => {
  await seedRow();
  await save();
  await submit();
  const dualRole = { ...author, cropfortRoles: ["farm_owner"] };
  assert.equal((await service.get(dualRole, ASSESSMENT_ID)).canReview, false);
  await rejectsCode(service.decide(dualRole, ASSESSMENT_ID, { revision: row.revision, decision: "approve" }), "FORBIDDEN");
});

test("farm_owner_viewer can read assessments but cannot decide them", async () => {
  await seedRow({ status: "submitted", submittedByUserId: author.id });
  const viewer = {
    id: "viewer",
    name: "Asset Owner Viewer",
    role: "spx_principal",
    cropfortRoles: ["farm_owner_viewer"],
    activeProgramId: "workspace",
  };
  const dto = await service.get(viewer, ASSESSMENT_ID);
  assert.equal(dto.status, "submitted");
  assert.equal(dto.canReview, false);
  await rejectsCode(
    service.decide(viewer, ASSESSMENT_ID, {
      revision: row.revision,
      decision: "approve",
    }),
    "FORBIDDEN",
  );
});

test("submission requires at least one finding or condition — PDF is optional", async () => {
  await seedRow();
  // Empty findings, no condition, no recommendedOps → should fail
  await save("", null);
  await rejectsCode(submit(), "VALIDATION_ERROR");
  // Findings present → should succeed even without a PDF
  await save("Findings present", null);
  await service.submit(author, ASSESSMENT_ID, { revision: row.revision });
  assert.equal(row.status, "submitted");
  assert.equal(alerts.length, 1);
});

test("invalid and oversized PDFs are rejected without storing bytes", async () => {
  await seedRow();
  await rejectsCode(save("Findings", { ...pdf, buffer: Buffer.from("<html>"), size: 6 }), "INVALID_FILE");
  await rejectsCode(save("Findings", { ...pdf, size: 5 * 1024 * 1024 + 1 }), "INVALID_FILE");
  assert.equal(row.findings, "");
});

test("return requires meaningful comments and valid decisions", async () => {
  await seedRow();
  await save();
  await submit();
  await rejectsCode(decide("request_changes", "  "), "VALIDATION_ERROR");
  await rejectsCode(decide("delete"), "VALIDATION_ERROR");
  assert.equal(row.status, "submitted");
});

test("submitted and approved assessments cannot be changed or resubmitted", async () => {
  await seedRow();
  await save();
  await submit();
  await rejectsCode(save("changed"), "INVALID_STATE_TRANSITION");
  await rejectsCode(submit(), "INVALID_STATE_TRANSITION");
  await decide("approve");
  await rejectsCode(save("changed"), "INVALID_STATE_TRANSITION");
  await rejectsCode(decide("request_changes", "Again"), "INVALID_STATE_TRANSITION");
});

test("stale revisions and concurrent review updates cannot overwrite another change", async () => {
  await seedRow();
  await save();
  await rejectsCode(service.save(author, ASSESSMENT_ID, { revision: 0, findings: "stale" }, null), "CONFLICT");
  await submit();
  conflict = true;
  await rejectsCode(decide("approve"), "CONFLICT");
  assert.equal(row.status, "submitted");
  assert.equal(alerts.length, 1);
});

test("notification failure rolls back submission and audit", async () => {
  await seedRow();
  await save();
  notificationFailure = true;
  await assert.rejects(submit(), /Notifications unavailable/);
  assert.equal(row.status, "draft");
  assert.equal(row.revision, 1);
  assert.equal(audits.length, 1);
});

test("missing report downloads return 404", async () => {
  await seedRow();
  await rejectsCode(service.download(owner, ASSESSMENT_ID), "NOT_FOUND");
});

test("returnedComment is set on request_changes and cleared on approve", async () => {
  await seedRow();
  await save();
  await submit();
  await decide("request_changes", "Add soil analysis");
  assert.equal(row.returnedComment, "Add soil analysis");
  await save("Updated findings");
  await submit();
  await decide("approve", "Looks good");
  assert.equal(row.returnedComment, null);
});

test("request schemas reject missing revisions, long findings and blank return comments", () => {
  assert.equal(schemas.save.safeParse({ findings: "x" }).success, false);
  assert.equal(schemas.save.safeParse({ findings: "x".repeat(20001), revision: 0 }).success, false);
  assert.equal(schemas.submit.safeParse({ revision: -1 }).success, false);
  assert.equal(schemas.decide.safeParse({ revision: 1, decision: "request_changes", comment: " " }).success, false);
  assert.deepEqual(schemas.save.parse({ findings: " x ", revision: "0" }), { findings: "x", revision: 0 });
});

test("create schema requires farmEstateId", () => {
  assert.equal(schemas.create.safeParse({}).success, false);
  assert.equal(schemas.create.safeParse({ farmEstateId: "farm1" }).success, true);
  assert.equal(schemas.create.safeParse({ farmEstateId: "farm1", planYear: 2026, assessmentPurpose: "annual_baseline" }).success, true);
});
