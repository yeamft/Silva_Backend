const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const author = { id: "spx", name: "SPX", role: "spx_validator", activeProgramId: "workspace" };
const owner = { id: "owner", name: "Asset Owner", role: "farm_owner", activeProgramId: "workspace" };
const pdf = { originalname: "farm.pdf", buffer: Buffer.from("%PDF-1.4\nreport"), size: 15 };
let row, plan, audits, alerts, conflict, notificationFailure;

const pick = (value, select) => value && Object.fromEntries(Object.keys(select).map((key) => [key, value[key]]));
const db = {
  cropfort_programme_plans: {
    findFirst: async ({ where }) => where.id === plan.id && where.programId === plan.programId ? plan : null,
    findMany: async ({ where }) => where.programId === plan.programId ? [{
      id: plan.id, name: plan.name, code: "PP-1", planningCycleLabel: "2026 Programme",
      budgetYearLabel: "", farm_estates: { name: "Chaka" },
      farmAssessment: row ? { status: row.status, reportName: row.reportName, updatedAt: new Date("2026-10-25T00:00:00Z") } : null,
    }] : [],
  },
  cropfort_farm_assessments: {
    findUnique: async ({ select }) => pick(row, select),
    create: async ({ data }) => {
      row = { status: "draft", findings: "", reportName: null, reportData: null, reportSize: null,
        revision: 1, history: [], submittedAt: null, reviewedAt: null, ...data };
    },
    updateMany: async ({ where, data }) => {
      if (conflict || row?.revision !== where.revision) return { count: 0 };
      row = { ...row, ...data, revision: row.revision + 1 };
      return { count: 1 };
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
require.cache[notificationsPath] = { id: notificationsPath, filename: notificationsPath, loaded: true, exports: {
  notifyFarmAssessment: async (p, a, action, _name, tx) => {
    assert.equal(tx, db);
    if (notificationFailure) throw new Error("Notifications unavailable");
    alerts.push({ planId: p.id, status: a.status, action });
  },
} };
const service = require("../services/farmAssessment.service");
const schemas = require("../schemas/farmAssessment");

beforeEach(() => {
  row = null;
  plan = { id: "plan", programId: "workspace", name: "Coffee programme", status: "draft" };
  audits = [];
  alerts = [];
  conflict = false;
  notificationFailure = false;
});
const save = (findings = "Irrigation repairs needed", file = pdf) => service.save(author, "plan", { findings, revision: row?.revision || 0 }, file);
const submit = () => service.submit(author, "plan", { revision: row.revision });
const decide = (decision, comment = "") => service.decide(owner, "plan", { revision: row.revision, decision, comment });
const rejectsCode = (promise, code) => assert.rejects(promise, (error) => error.code === code);

test("assessment lifecycle: upload, submit, changes, resubmit, approve, with history", async () => {
  let dto = await save();
  assert.equal(dto.reportName, "farm.pdf");
  assert.equal(dto.reportData, undefined);
  assert.equal(dto.canEdit, true);
  assert.deepEqual((await service.download(owner, "plan")).reportData, pdf.buffer);
  dto = await submit();
  assert.equal(dto.status, "submitted");
  assert.equal(dto.canEdit, false);
  assert.equal((await service.get(owner, "plan")).canReview, true);
  await decide("request_changes", "Include soil analysis");
  assert.equal((await service.get(author, "plan")).canEdit, true);
  await save("Soil analysis added", null);
  assert.equal(row.reportName, "farm.pdf");
  await submit();
  dto = await decide("approve", "Assessment accepted");
  assert.equal(dto.status, "approved");
  assert.equal(dto.history.length, 4);
  assert.equal(dto.history[1].comment, "Include soil analysis");
  assert.equal(dto.canReview, false);
  assert.equal(plan.status, "draft", "assessment approval must not approve the programme");
  assert.equal(alerts.length, 4);
  assert.equal(audits.length, 6);
});

test("workspace isolation applies to reads, downloads and writes", async () => {
  const other = { ...author, activeProgramId: "elsewhere" };
  await rejectsCode(service.get(other, "plan"), "NOT_FOUND");
  await rejectsCode(service.download(other, "plan"), "NOT_FOUND");
  await rejectsCode(service.save(other, "plan", { findings: "x", revision: 0 }, pdf), "NOT_FOUND");
  assert.equal(row, null);
});

test("only SPX authors may write or submit, and only owner approvers may decide", async () => {
  await rejectsCode(service.save(owner, "plan", { findings: "x", revision: 0 }, pdf), "FORBIDDEN");
  await save();
  await rejectsCode(service.submit(owner, "plan", { revision: 1 }), "FORBIDDEN");
  await submit();
  await rejectsCode(service.decide(author, "plan", { revision: row.revision, decision: "approve" }), "FORBIDDEN");
  await rejectsCode(service.get({ ...owner, role: "vendor_worker" }, "plan"), "FORBIDDEN");
});

test("dual-role authors cannot review their own submissions", async () => {
  await save();
  await submit();
  const dualRole = { ...author, cropfortRoles: ["farm_owner"] };
  assert.equal((await service.get(dualRole, "plan")).canReview, false);
  await rejectsCode(service.decide(dualRole, "plan", { revision: row.revision, decision: "approve" }), "FORBIDDEN");
});

test("submission requires both findings and report", async () => {
  await save("", null);
  await rejectsCode(submit(), "VALIDATION_ERROR");
  await save("Findings", null);
  await rejectsCode(submit(), "VALIDATION_ERROR");
  await save("", pdf);
  await rejectsCode(submit(), "VALIDATION_ERROR");
  assert.equal(alerts.length, 0);
});

test("invalid and oversized PDFs are rejected without storing bytes", async () => {
  await rejectsCode(save("Findings", { ...pdf, buffer: Buffer.from("<html>"), size: 6 }), "INVALID_FILE");
  await rejectsCode(save("Findings", { ...pdf, size: 5 * 1024 * 1024 + 1 }), "INVALID_FILE");
  assert.equal(row, null);
});

test("return requires meaningful comments and valid decisions", async () => {
  await save();
  await submit();
  await rejectsCode(decide("request_changes", "  "), "VALIDATION_ERROR");
  await rejectsCode(decide("delete"), "VALIDATION_ERROR");
  assert.equal(row.status, "submitted");
});

test("submitted and approved reports cannot be changed or resubmitted", async () => {
  await save();
  await submit();
  await rejectsCode(save("changed"), "INVALID_STATE_TRANSITION");
  await rejectsCode(submit(), "INVALID_STATE_TRANSITION");
  await decide("approve");
  await rejectsCode(save("changed"), "INVALID_STATE_TRANSITION");
  await rejectsCode(decide("request_changes", "Again"), "INVALID_STATE_TRANSITION");
});

test("archived programmes keep reports readable but reject mutations", async () => {
  await save();
  plan.status = "archived";
  assert.equal((await service.get(author, "plan")).canEdit, false);
  assert.equal((await service.download(owner, "plan")).reportName, "farm.pdf");
  await rejectsCode(save(), "INVALID_STATE_TRANSITION");
  await rejectsCode(submit(), "INVALID_STATE_TRANSITION");
});

test("stale revisions and concurrent review updates cannot overwrite another change", async () => {
  await save();
  await rejectsCode(service.save(author, "plan", { revision: 0, findings: "stale" }, null), "CONFLICT");
  await submit();
  conflict = true;
  await rejectsCode(decide("approve"), "CONFLICT");
  assert.equal(row.status, "submitted");
  assert.equal(alerts.length, 1);
});

test("notification failure rolls back submission and audit", async () => {
  await save();
  notificationFailure = true;
  await assert.rejects(submit(), /Notifications unavailable/);
  assert.equal(row.status, "draft");
  assert.equal(row.revision, 1);
  assert.equal(audits.length, 1);
});

test("missing report downloads return 404", async () => {
  await rejectsCode(service.download(owner, "plan"), "NOT_FOUND");
});

test("SPX assessment register includes every active programme and its assessment status", async () => {
  let rows = await service.list(author);
  assert.deepEqual(rows[0], {
    planId: "plan", planName: "Coffee programme", farmName: "Chaka",
    cycleLabel: "2026 Programme", status: "draft", exists: false, reportName: null, updatedAt: null,
  });
  await save();
  rows = await service.list(author);
  assert.equal(rows[0].status, "draft");
  assert.equal(rows[0].exists, true);
  assert.equal(rows[0].reportName, "farm.pdf");
  assert.equal(rows[0].updatedAt, "2026-10-25T00:00:00.000Z");
});

test("request schemas reject missing revisions, long findings and blank return comments", () => {
  assert.equal(schemas.save.safeParse({ findings: "x" }).success, false);
  assert.equal(schemas.save.safeParse({ findings: "x".repeat(20001), revision: 0 }).success, false);
  assert.equal(schemas.submit.safeParse({ revision: -1 }).success, false);
  assert.equal(schemas.decide.safeParse({ revision: 1, decision: "request_changes", comment: " " }).success, false);
  assert.deepEqual(schemas.save.parse({ findings: " x ", revision: "0" }), { findings: "x", revision: 0 });
});
