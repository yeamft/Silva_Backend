const catchAsync = require("../utils/catchAsync");
const service = require("../services/cropfortMonthlyWorkOrders.service");

exports.list = catchAsync(async (req, res) => {
  res.json({ data: await service.listMonthlyWorkOrders(req.user, { status: req.query.status }) });
});

exports.get = catchAsync(async (req, res) => {
  res.json({ data: await service.getMonthlyWorkOrder(req.user, req.params.id) });
});

exports.create = catchAsync(async (req, res) => {
  res.status(201).json({ data: await service.createMonthlyWorkOrder(req.user, req.validatedBody) });
});

exports.submit = catchAsync(async (req, res) => {
  res.json({ data: await service.submitMonthlyWorkOrder(req.user, req.params.id) });
});

exports.decide = catchAsync(async (req, res) => {
  res.json({
    data: await service.decideMonthlyWorkOrder(req.user, req.params.id, req.validatedBody),
  });
});

exports.activate = catchAsync(async (req, res) => {
  res.json({ data: await service.activateMonthlyWorkOrder(req.user, req.params.id) });
});

exports.setLoop = catchAsync(async (req, res) => {
  res.json({
    data: await service.setMonthlyWorkOrderLoop(req.user, req.params.id, req.validatedBody.loop),
  });
});

exports.addOutOfPlanLine = catchAsync(async (req, res) => {
  res.json({
    data: await service.addOutOfPlanLine(req.user, req.params.id, req.validatedBody),
  });
});
