const catchAsync = require("../utils/catchAsync");
const service = require("../services/cropfortDirectInstructions.service");

exports.list = catchAsync(async (req, res) => {
  res.json({
    data: await service.listDirectInstructions(req.user, {
      status: req.query.status,
      monthlyWoId: req.query.monthlyWoId,
    }),
  });
});

exports.get = catchAsync(async (req, res) => {
  res.json({ data: await service.getDirectInstruction(req.user, req.params.id) });
});

exports.issue = catchAsync(async (req, res) => {
  res.status(201).json({ data: await service.issueDirectInstruction(req.user, req.validatedBody) });
});

exports.confirm = catchAsync(async (req, res) => {
  res.json({ data: await service.confirmDirectInstruction(req.user, req.params.id) });
});

exports.pendingForMonthly = catchAsync(async (req, res) => {
  res.json({
    data: await service.pendingForMonthly(req.user, req.params.monthlyWoId),
  });
});
