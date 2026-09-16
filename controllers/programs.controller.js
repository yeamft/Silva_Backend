const catchAsync = require("../utils/catchAsync");
const programService = require("../services/program.service");

exports.list = catchAsync(async (req, res) => {
  res.json({ data: await programService.adminListPrograms(req.user) });
});

exports.create = catchAsync(async (req, res) => {
  res.status(201).json({ data: await programService.createProgram(req.user, req.validatedBody) });
});

exports.update = catchAsync(async (req, res) => {
  res.json({ data: await programService.updateProgram(req.user, req.params.id, req.validatedBody) });
});

exports.archive = catchAsync(async (req, res) => {
  res.json({ data: await programService.archiveProgram(req.user, req.params.id) });
});
