const catchAsync = require("../utils/catchAsync");
const rateCardService = require("../services/rateCard.service");

exports.listCategories = catchAsync(async (req, res) => {
  const data = await rateCardService.listCategories(req.user);
  res.json({ data });
});

exports.createCategory = catchAsync(async (req, res) => {
  const data = await rateCardService.createCategory(req.user, req.validatedBody);
  res.status(201).json({ data });
});

exports.updateCategory = catchAsync(async (req, res) => {
  const data = await rateCardService.updateCategory(req.user, req.params.id, req.validatedBody);
  res.json({ data });
});

exports.deleteCategory = catchAsync(async (req, res) => {
  const data = await rateCardService.deleteCategory(req.user, req.params.id);
  res.json({ data });
});

exports.listLines = catchAsync(async (req, res) => {
  const data = await rateCardService.listLines(req.user);
  res.json({ data });
});

exports.createLine = catchAsync(async (req, res) => {
  const data = await rateCardService.createLine(req.user, req.validatedBody);
  res.status(201).json({ data });
});

exports.updateLine = catchAsync(async (req, res) => {
  const data = await rateCardService.updateLine(req.user, req.params.id, req.validatedBody);
  res.json({ data });
});

exports.deleteLine = catchAsync(async (req, res) => {
  const data = await rateCardService.deleteLine(req.user, req.params.id);
  res.json({ data });
});

exports.submitLines = catchAsync(async (req, res) => {
  const data = await rateCardService.submitLines(req.user, req.validatedBody || req.body || {});
  res.json({ data });
});

exports.approveLine = catchAsync(async (req, res) => {
  const data = await rateCardService.approveLine(req.user, req.params.id);
  res.json({ data });
});

exports.returnLine = catchAsync(async (req, res) => {
  const data = await rateCardService.returnLine(req.user, req.params.id, req.validatedBody.comment);
  res.json({ data });
});
