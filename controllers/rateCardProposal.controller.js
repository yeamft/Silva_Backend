const catchAsync = require("../utils/catchAsync");
const proposals = require("../services/rateCardProposal.service");

exports.list = catchAsync(async (req, res) => {
  res.json({ data: await proposals.list(req.user, req.params.farmId, req.query || {}) });
});

exports.listProgram = catchAsync(async (req, res) => {
  res.json({ data: await proposals.listProgram(req.user, req.query || {}) });
});

exports.listLockedSurveys = catchAsync(async (req, res) => {
  res.json({
    data: await proposals.listLockedSurveys(req.user, req.params.farmId, req.query || {}),
  });
});

exports.createFromSurvey = catchAsync(async (req, res) => {
  res
    .status(201)
    .json({ data: await proposals.createFromSurvey(req.user, req.params.farmId, req.body || {}) });
});

exports.createImport = catchAsync(async (req, res) => {
  res
    .status(201)
    .json({ data: await proposals.createImport(req.user, req.params.farmId, req.body || {}) });
});

exports.get = catchAsync(async (req, res) => {
  res.json({ data: await proposals.get(req.user, req.params.id) });
});

exports.update = catchAsync(async (req, res) => {
  res.json({ data: await proposals.update(req.user, req.params.id, req.body || {}) });
});

exports.submit = catchAsync(async (req, res) => {
  res.json({ data: await proposals.submit(req.user, req.params.id) });
});

exports.approve = catchAsync(async (req, res) => {
  res.json({ data: await proposals.approve(req.user, req.params.id) });
});

exports.reject = catchAsync(async (req, res) => {
  res.json({
    data: await proposals.reject(req.user, req.params.id, req.body?.comment || req.body?.returnComment),
  });
});

exports.archive = catchAsync(async (req, res) => {
  res.json({ data: await proposals.archive(req.user, req.params.id) });
});

exports.restore = catchAsync(async (req, res) => {
  res.json({ data: await proposals.restore(req.user, req.params.id) });
});
