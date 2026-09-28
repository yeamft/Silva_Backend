const catchAsync = require("../utils/catchAsync");
const service = require("../services/cropfortAfes.service");

exports.list = catchAsync(async (req, res) => {
  res.json({ data: await service.listAfes(req.user, { status: req.query.status }) });
});

exports.get = catchAsync(async (req, res) => {
  res.json({ data: await service.getAfe(req.user, req.params.id) });
});

exports.create = catchAsync(async (req, res) => {
  res.status(201).json({ data: await service.createAfe(req.user, req.validatedBody) });
});

exports.submit = catchAsync(async (req, res) => {
  res.json({ data: await service.submitAfe(req.user, req.params.id) });
});

exports.decide = catchAsync(async (req, res) => {
  res.json({ data: await service.decideAfe(req.user, req.params.id, req.validatedBody) });
});
