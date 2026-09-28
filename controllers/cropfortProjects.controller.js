const catchAsync = require("../utils/catchAsync");
const service = require("../services/cropfortProjects.service");

exports.list = catchAsync(async (req, res) => {
  res.json({ data: await service.listProjects(req.user, { status: req.query.status }) });
});

exports.get = catchAsync(async (req, res) => {
  res.json({ data: await service.getProject(req.user, req.params.id) });
});

exports.create = catchAsync(async (req, res) => {
  res.status(201).json({ data: await service.createProject(req.user, req.validatedBody) });
});

exports.submit = catchAsync(async (req, res) => {
  res.json({ data: await service.submitProject(req.user, req.params.id) });
});

exports.decide = catchAsync(async (req, res) => {
  res.json({ data: await service.decideProject(req.user, req.params.id, req.validatedBody) });
});

exports.start = catchAsync(async (req, res) => {
  res.json({ data: await service.startProject(req.user, req.params.id) });
});

exports.toggleMilestone = catchAsync(async (req, res) => {
  res.json({
    data: await service.toggleMilestone(req.user, req.params.id, req.params.milestoneId),
  });
});

exports.linkAfe = catchAsync(async (req, res) => {
  res.json({
    data: await service.linkAfe(req.user, req.params.id, req.validatedBody.cropfortAfeId),
  });
});
