const catchAsync = require("../utils/catchAsync");
const service = require("../services/paymentRequests.service");

exports.list = catchAsync(async (req, res) => {
  res.json({ data: await service.listPaymentRequests(req.user, { status: req.query.status }) });
});

exports.create = catchAsync(async (req, res) => {
  res.status(201).json({ data: await service.createPaymentRequest(req.user, req.validatedBody) });
});

exports.verify = catchAsync(async (req, res) => {
  res.json({ data: await service.verifyPaymentRequest(req.user, req.params.id) });
});

exports.returnPr = catchAsync(async (req, res) => {
  res.json({
    data: await service.returnPaymentRequest(req.user, req.params.id, req.validatedBody || {}),
  });
});

exports.authorizeSettlement = catchAsync(async (req, res) => {
  res.status(201).json({
    data: await service.authorizeSettlement(req.user, req.params.id, req.validatedBody || {}),
  });
});

exports.listSettlements = catchAsync(async (req, res) => {
  res.json({ data: await service.listSettlements(req.user) });
});

exports.markSettlementSettled = catchAsync(async (req, res) => {
  res.json({ data: await service.markSettlementSettled(req.user, req.params.id) });
});
