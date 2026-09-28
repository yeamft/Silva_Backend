const catchAsync = require("../utils/catchAsync");
const service = require("../services/cropfortWeeklyPlans.service");

exports.list = catchAsync(async (req, res) => {
  res.json({ data: await service.listWeeklyPlans(req.user, { status: req.query.status }) });
});

exports.get = catchAsync(async (req, res) => {
  res.json({ data: await service.getWeeklyPlan(req.user, req.params.id) });
});

exports.create = catchAsync(async (req, res) => {
  res.status(201).json({ data: await service.createWeeklyPlan(req.user, req.validatedBody) });
});

exports.submit = catchAsync(async (req, res) => {
  res.json({ data: await service.submitWeeklyPlan(req.user, req.params.id) });
});

exports.decide = catchAsync(async (req, res) => {
  res.json({
    data: await service.decideWeeklyPlan(req.user, req.params.id, req.validatedBody),
  });
});

exports.activate = catchAsync(async (req, res) => {
  res.json({ data: await service.activateWeeklyPlan(req.user, req.params.id) });
});

exports.setLoop = catchAsync(async (req, res) => {
  res.json({
    data: await service.setWeeklyPlanLoop(req.user, req.params.id, req.validatedBody.loop),
  });
});
