const catchAsync = require("../utils/catchAsync");
const service = require("../services/farmAssessment.service");

// ── id-based routes (canonical) ────────────────────────────────────────────

exports.list = catchAsync(async (req, res) => {
  const filters = {
    farmEstateId: req.query.farmEstateId,
    planYear: req.query.planYear,
    status: req.query.status,
    search: req.query.search,
    dateFrom: req.query.dateFrom,
    dateTo: req.query.dateTo,
  };
  res.json({ data: await service.list(req.user, filters) });
});

exports.summaryCounts = catchAsync(async (req, res) => {
  res.json({ data: await service.summaryCounts(req.user) });
});

exports.create = catchAsync(async (req, res) => {
  res.status(201).json({ data: await service.create(req.user, req.validatedBody) });
});

exports.get = catchAsync(async (req, res) => {
  res.json({ data: await service.get(req.user, req.params.id) });
});

exports.save = catchAsync(async (req, res) => {
  res.json({ data: await service.save(req.user, req.params.id, req.validatedBody, req.file) });
});

exports.submit = catchAsync(async (req, res) => {
  res.json({ data: await service.submit(req.user, req.params.id, req.validatedBody) });
});

exports.decide = catchAsync(async (req, res) => {
  res.json({ data: await service.decide(req.user, req.params.id, req.validatedBody) });
});

exports.download = catchAsync(async (req, res) => {
  const report = await service.download(req.user, req.params.id);
  res.set("Cache-Control", "private, no-store");
  res.set("Content-Type", "application/pdf");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Content-Disposition", `attachment; filename="assessment.pdf"; filename*=UTF-8''${encodeURIComponent(report.reportName)}`);
  res.send(Buffer.from(report.reportData));
});

// ── Legacy planId-based routes (backward-compatible) ──────────────────────

/**
 * GET /programme-plans/:planId/farm-assessment
 * Returns the assessment for this plan, or 404 if none exists.
 */
exports.getByPlanId = catchAsync(async (req, res) => {
  res.json({ data: await service.getByPlanId(req.user, req.params.id) });
});

/**
 * GET /programme-plans/:planId/farm-assessment/resolve
 * Returns { assessments: [{id, title, status}] } so the frontend can redirect.
 */
exports.resolveByPlanId = catchAsync(async (req, res) => {
  const assessments = await service.resolveByPlanId(req.user, req.params.id);
  res.json({ data: { assessments } });
});

exports.saveByPlanId = catchAsync(async (req, res) => {
  res.json({ data: await service.saveByPlanId(req.user, req.params.id, req.validatedBody, req.file) });
});

exports.submitByPlanId = catchAsync(async (req, res) => {
  res.json({ data: await service.submitByPlanId(req.user, req.params.id, req.validatedBody) });
});

exports.decideByPlanId = catchAsync(async (req, res) => {
  res.json({ data: await service.decideByPlanId(req.user, req.params.id, req.validatedBody) });
});

exports.downloadByPlanId = catchAsync(async (req, res) => {
  const report = await service.downloadByPlanId(req.user, req.params.id);
  res.set("Cache-Control", "private, no-store");
  res.set("Content-Type", "application/pdf");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Content-Disposition", `attachment; filename="assessment.pdf"; filename*=UTF-8''${encodeURIComponent(report.reportName)}`);
  res.send(Buffer.from(report.reportData));
});
