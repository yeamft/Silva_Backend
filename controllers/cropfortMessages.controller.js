const catchAsync = require("../utils/catchAsync");
const service = require("../services/cropfortMessages.service");

exports.list = catchAsync(async (req, res) => {
  res.json({ data: await service.listThreads(req.user) });
});

exports.create = catchAsync(async (req, res) => {
  res.status(201).json({ data: await service.createThread(req.user, req.body || {}) });
});

exports.postMessage = catchAsync(async (req, res) => {
  res.status(201).json({
    data: await service.postMessage(req.user, req.params.id, req.body || {}),
  });
});

exports.close = catchAsync(async (req, res) => {
  res.json({ data: await service.setThreadStatus(req.user, req.params.id, true) });
});

exports.reopen = catchAsync(async (req, res) => {
  res.json({ data: await service.setThreadStatus(req.user, req.params.id, false) });
});
