const catchAsync = require("../utils/catchAsync");
const service = require("../services/rateCards.service");

exports.list = catchAsync(async (req, res) => {
  res.json({ data: await service.list(req.user, req.query || {}) });
});
exports.summary = catchAsync(async (req, res) => {
  res.json({ data: await service.summary(req.user) });
});
exports.get = catchAsync(async (req, res) => {
  res.json({ data: await service.get(req.user, req.params.id) });
});
exports.create = catchAsync(async (req, res) => {
  res.status(201).json({ data: await service.create(req.user, req.validatedBody) });
});
exports.update = catchAsync(async (req, res) => {
  res.json({ data: await service.update(req.user, req.params.id, req.validatedBody) });
});
exports.addLineItem = catchAsync(async (req, res) => {
  res.status(201).json({ data: await service.addLineItem(req.user, req.params.id, req.validatedBody) });
});
exports.updateLineItem = catchAsync(async (req, res) => {
  res.json({
    data: await service.updateLineItem(req.user, req.params.id, req.params.lineId, req.validatedBody),
  });
});
exports.deleteLineItem = catchAsync(async (req, res) => {
  res.json({ data: await service.deleteLineItem(req.user, req.params.id, req.params.lineId) });
});
exports.submit = catchAsync(async (req, res) => {
  res.json({ data: await service.submit(req.user, req.params.id) });
});
exports.approve = catchAsync(async (req, res) => {
  res.json({ data: await service.approve(req.user, req.params.id) });
});
exports.reject = catchAsync(async (req, res) => {
  res.json({ data: await service.reject(req.user, req.params.id, req.validatedBody || {}) });
});
exports.publish = catchAsync(async (req, res) => {
  res.json({ data: await service.publish(req.user, req.params.id) });
});
exports.archive = catchAsync(async (req, res) => {
  res.json({ data: await service.archive(req.user, req.params.id) });
});
exports.restore = catchAsync(async (req, res) => {
  res.json({ data: await service.restore(req.user, req.params.id) });
});
