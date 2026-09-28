const catchAsync = require("../utils/catchAsync");
const service = require("../services/cropfortScenarios.service");

exports.list = catchAsync(async (req, res) => {
  res.json({ data: await service.listScenarios(req.user) });
});

exports.create = catchAsync(async (req, res) => {
  res.status(201).json({ data: await service.createScenario(req.user, req.validatedBody || req.body) });
});

exports.rename = catchAsync(async (req, res) => {
  res.json({
    data: await service.renameScenario(req.user, req.params.id, req.validatedBody?.name ?? req.body?.name),
  });
});

exports.remove = catchAsync(async (req, res) => {
  res.json({ data: await service.deleteScenario(req.user, req.params.id) });
});
