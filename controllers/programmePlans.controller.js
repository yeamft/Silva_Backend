const catchAsync = require("../utils/catchAsync");
const service = require("../services/programmePlans.service");

exports.list = catchAsync(async (req, res) => {
  res.json({
    data: await service.listPlans(req.user, {
      farmEstateId: req.query.farmEstateId,
      planYear: req.query.planYear,
      status: req.query.status,
      q: req.query.q,
      includeArchived: req.query.includeArchived === "1" || req.query.includeArchived === "true",
    }),
  });
});

exports.getOrCreate = catchAsync(async (req, res) => {
  res.json({
    data: await service.getOrCreatePlan(req.user, {
      farmEstateId: req.query.farmEstateId || req.validatedBody?.farmEstateId,
      planYear: req.query.planYear || req.validatedBody?.planYear,
      name: req.query.name || req.validatedBody?.name,
    }),
  });
});

exports.create = catchAsync(async (req, res) => {
  res.status(201).json({
    data: await service.createPlan(req.user, req.validatedBody),
  });
});

exports.get = catchAsync(async (req, res) => {
  res.json({ data: await service.getPlan(req.user, req.params.id) });
});

exports.upsert = catchAsync(async (req, res) => {
  res.json({ data: await service.upsertPlan(req.user, req.params.id, req.validatedBody) });
});

exports.patchSchedule = catchAsync(async (req, res) => {
  res.json({ data: await service.patchSchedule(req.user, req.params.id, req.validatedBody) });
});

exports.readiness = catchAsync(async (req, res) => {
  res.json({ data: await service.getReadiness(req.user, req.params.id) });
});

exports.submit = catchAsync(async (req, res) => {
  res.json({ data: await service.submitPlan(req.user, req.params.id) });
});

exports.decide = catchAsync(async (req, res) => {
  res.json({ data: await service.decidePlan(req.user, req.params.id, req.validatedBody) });
});

exports.duplicate = catchAsync(async (req, res) => {
  res.status(201).json({ data: await service.duplicatePlan(req.user, req.params.id) });
});

exports.archive = catchAsync(async (req, res) => {
  res.json({ data: await service.archivePlan(req.user, req.params.id) });
});
