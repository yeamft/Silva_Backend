const catchAsync = require("../utils/catchAsync");
const service = require("../services/workOrders.service");

exports.list = catchAsync(async (req, res) => {
  res.json({
    data: await service.listWorkOrders(req.user, {
      status: req.query.status,
      farmEstateId: req.query.farmEstateId,
    }),
  });
});

exports.get = catchAsync(async (req, res) => {
  res.json({ data: await service.getWorkOrder(req.user, req.params.id) });
});

exports.create = catchAsync(async (req, res) => {
  res.status(201).json({ data: await service.createWorkOrder(req.user, req.validatedBody) });
});

exports.update = catchAsync(async (req, res) => {
  res.json({ data: await service.updateWorkOrder(req.user, req.params.id, req.validatedBody) });
});

exports.transition = catchAsync(async (req, res) => {
  res.json({ data: await service.transitionWorkOrder(req.user, req.params.id, req.validatedBody) });
});

exports.listTickets = catchAsync(async (req, res) => {
  res.json({
    data: await service.listFieldTickets(req.user, {
      workOrderId: req.query.workOrderId || req.params.id,
      status: req.query.status,
    }),
  });
});

exports.createTicket = catchAsync(async (req, res) => {
  res.status(201).json({
    data: await service.createFieldTicket(req.user, req.params.id, req.validatedBody),
  });
});

exports.transitionTicket = catchAsync(async (req, res) => {
  res.json({
    data: await service.transitionFieldTicket(req.user, req.params.ticketId, req.validatedBody),
  });
});
