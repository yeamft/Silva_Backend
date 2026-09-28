const catchAsync = require("../utils/catchAsync");
const service = require("../services/cropfortInterventions.service");

exports.list = catchAsync(async (req, res) => {
  res.json({ data: await service.listInterventions(req.user, { status: req.query.status }) });
});

exports.get = catchAsync(async (req, res) => {
  res.json({ data: await service.getIntervention(req.user, req.params.id) });
});

exports.create = catchAsync(async (req, res) => {
  res.status(201).json({ data: await service.createIntervention(req.user, req.validatedBody) });
});

exports.start = catchAsync(async (req, res) => {
  res.json({ data: await service.startIntervention(req.user, req.params.id) });
});

exports.submit = catchAsync(async (req, res) => {
  res.json({ data: await service.submitIntervention(req.user, req.params.id) });
});

exports.decide = catchAsync(async (req, res) => {
  res.json({
    data: await service.decideIntervention(req.user, req.params.id, req.validatedBody),
  });
});

exports.complete = catchAsync(async (req, res) => {
  res.json({ data: await service.completeIntervention(req.user, req.params.id) });
});

exports.toggleStep = catchAsync(async (req, res) => {
  res.json({
    data: await service.toggleStep(req.user, req.params.id, req.params.stepId),
  });
});

exports.linkAfe = catchAsync(async (req, res) => {
  res.json({
    data: await service.linkAfe(req.user, req.params.id, req.validatedBody.cropfortAfeId),
  });
});
