const catchAsync = require("../utils/catchAsync");
const service = require("../services/annualPlanBenchmarks.service");

exports.getLatest = catchAsync(async (req, res) => {
  res.json({ data: await service.getLatest(req.query.version) });
});