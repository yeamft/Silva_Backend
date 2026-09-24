const catchAsync = require("../utils/catchAsync");
const service = require("../services/materials.service");

exports.list = catchAsync(async (req, res) => {
  res.json({ data: await service.list(req.user, req.query || {}) });
});
exports.create = catchAsync(async (req, res) => {
  res.status(201).json({ data: await service.create(req.user, req.validatedBody) });
});
exports.update = catchAsync(async (req, res) => {
  res.json({ data: await service.update(req.user, req.params.id, req.validatedBody) });
});
exports.remove = catchAsync(async (req, res) => {
  res.json({ data: await service.remove(req.user, req.params.id) });
});
