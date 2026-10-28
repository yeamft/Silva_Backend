const catchAsync = require("../utils/catchAsync");
const service = require("../services/annualPlanBenchmarks.service");

exports.getLatest = catchAsync(async (req, res) => {
  res.json({ data: await service.getLatest(req.query.version) });
});
exports.importWorkbook = catchAsync(async (req, res) => {
  res.status(201).json({ data: await service.importWorkbook(req.user, req.file) });
});

exports.getScenarioSettings = catchAsync(async (req, res) => {
  res.json({ data: await service.getScenarioSettings(req.user) });
});

exports.updateScenarioSettings = catchAsync(async (req, res) => {
  res.json({ data: await service.updateScenarioSettings(req.user, req.body) });
});
