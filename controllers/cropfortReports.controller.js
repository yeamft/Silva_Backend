const catchAsync = require("../utils/catchAsync");
const service = require("../services/cropfortReports.service");

exports.list = catchAsync(async (req, res) => {
  res.json({ data: await service.listReports(req.user, { status: req.query.status }) });
});

exports.get = catchAsync(async (req, res) => {
  res.json({ data: await service.getReport(req.user, req.params.id) });
});

exports.create = catchAsync(async (req, res) => {
  res.status(201).json({ data: await service.createReport(req.user, req.validatedBody || req.body) });
});

exports.update = catchAsync(async (req, res) => {
  res.json({ data: await service.updateDraft(req.user, req.params.id, req.validatedBody || req.body) });
});

exports.submit = catchAsync(async (req, res) => {
  res.json({ data: await service.submitReport(req.user, req.params.id) });
});

exports.release = catchAsync(async (req, res) => {
  res.json({ data: await service.releaseReport(req.user, req.params.id, req.body || {}) });
});

exports.returnReport = catchAsync(async (req, res) => {
  res.json({ data: await service.returnReport(req.user, req.params.id, req.body || {}) });
});

exports.remove = catchAsync(async (req, res) => {
  res.json({ data: await service.deleteReport(req.user, req.params.id) });
});
