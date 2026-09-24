const catchAsync = require("../utils/catchAsync");
const survey = require("../services/benchmarkSurvey.service");
const resolve = require("../services/rateResolution.service");
const standing = require("../services/standingRateCards.service");
const proposals = require("../controllers/rateCardProposal.controller");

exports.listFarms = catchAsync(async (req, res) => {
  res.json({ data: await standing.listFarms(req.user) });
});

exports.listSurveys = catchAsync(async (req, res) => {
  res.json({ data: await survey.list(req.user, req.params.farmId, req.query || {}) });
});

exports.listProgramSurveys = catchAsync(async (req, res) => {
  res.json({ data: await survey.listProgram(req.user, req.query || {}) });
});

exports.createSurvey = catchAsync(async (req, res) => {
  res.status(201).json({ data: await survey.create(req.user, req.params.farmId, req.body || {}) });
});

exports.getSurvey = catchAsync(async (req, res) => {
  res.json({ data: await survey.get(req.user, req.params.id) });
});

exports.updateSurvey = catchAsync(async (req, res) => {
  res.json({ data: await survey.update(req.user, req.params.id, req.body || {}) });
});

exports.lockSurvey = catchAsync(async (req, res) => {
  res.json({ data: await survey.lock(req.user, req.params.id) });
});

exports.submitSurvey = catchAsync(async (req, res) => {
  res.json({ data: await survey.submit(req.user, req.params.id) });
});

exports.approveSurvey = catchAsync(async (req, res) => {
  res.json({ data: await survey.approve(req.user, req.params.id) });
});

exports.rejectSurvey = catchAsync(async (req, res) => {
  res.json({
    data: await survey.reject(req.user, req.params.id, req.body?.comment || req.body?.returnComment),
  });
});

exports.resolvedRate = catchAsync(async (req, res) => {
  res.json({
    data: await resolve.resolveLaborRate(req.user, req.params.farmId, req.params.activityId),
  });
});

exports.listActivities = catchAsync(async (req, res) => {
  res.json({ data: await standing.listActivities(req.user, req.params.farmId, req.query || {}) });
});

exports.listLabor = catchAsync(async (req, res) => {
  res.json({ data: await standing.listLabor(req.user, req.params.farmId) });
});
exports.createLabor = catchAsync(async (req, res) => {
  res.status(201).json({ data: await standing.createLabor(req.user, req.params.farmId, req.body || {}) });
});
exports.updateLabor = catchAsync(async (req, res) => {
  res.json({
    data: await standing.updateLabor(req.user, req.params.farmId, req.params.id, req.body || {}),
  });
});

exports.listMaterial = catchAsync(async (req, res) => {
  res.json({ data: await standing.material.list(req.user, req.params.farmId) });
});
exports.createMaterial = catchAsync(async (req, res) => {
  res
    .status(201)
    .json({ data: await standing.material.create(req.user, req.params.farmId, req.body || {}) });
});
exports.updateMaterial = catchAsync(async (req, res) => {
  res.json({
    data: await standing.material.update(req.user, req.params.farmId, req.params.id, req.body || {}),
  });
});

exports.listService = catchAsync(async (req, res) => {
  res.json({ data: await standing.service.list(req.user, req.params.farmId) });
});
exports.createService = catchAsync(async (req, res) => {
  res
    .status(201)
    .json({ data: await standing.service.create(req.user, req.params.farmId, req.body || {}) });
});
exports.updateService = catchAsync(async (req, res) => {
  res.json({
    data: await standing.service.update(req.user, req.params.farmId, req.params.id, req.body || {}),
  });
});

exports.listProposals = proposals.list;
exports.listLockedSurveysForProposals = proposals.listLockedSurveys;
exports.createProposalFromSurvey = proposals.createFromSurvey;
exports.createProposalImport = proposals.createImport;
