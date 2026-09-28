const catchAsync = require("../utils/catchAsync");
const service = require("../services/cropfortDailyFieldRecords.service");

exports.list = catchAsync(async (req, res) => {
  res.json({
    data: await service.listDailyFieldRecords(req.user, {
      status: req.query.status,
      latestOnly: req.query.latestOnly !== "false",
    }),
  });
});

exports.get = catchAsync(async (req, res) => {
  res.json({ data: await service.getDailyFieldRecord(req.user, req.params.id) });
});

exports.create = catchAsync(async (req, res) => {
  res.status(201).json({ data: await service.createDailyFieldRecord(req.user, req.validatedBody) });
});

exports.update = catchAsync(async (req, res) => {
  res.json({
    data: await service.updateDailyFieldRecord(req.user, req.params.id, req.validatedBody),
  });
});

exports.submit = catchAsync(async (req, res) => {
  res.json({ data: await service.submitDailyFieldRecord(req.user, req.params.id) });
});

exports.siteCheck = catchAsync(async (req, res) => {
  res.json({
    data: await service.siteCheckDailyFieldRecord(req.user, req.params.id, req.validatedBody || {}),
  });
});

exports.validate = catchAsync(async (req, res) => {
  res.json({
    data: await service.validateDailyFieldRecord(req.user, req.params.id, req.validatedBody || {}),
  });
});

exports.returnDfr = catchAsync(async (req, res) => {
  res.json({
    data: await service.returnDailyFieldRecord(req.user, req.params.id, req.validatedBody || {}),
  });
});

exports.correct = catchAsync(async (req, res) => {
  res.json({
    data: await service.correctDailyFieldRecord(req.user, req.params.id, req.validatedBody || {}),
  });
});
