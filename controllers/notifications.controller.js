const catchAsync = require("../utils/catchAsync");
const notifications = require("../services/notifications.service");

exports.list = catchAsync(async (req, res) => {
  res.json({ data: await notifications.listForUser(req.user) });
});

exports.acknowledge = catchAsync(async (req, res) => {
  res.json({ data: await notifications.acknowledge(req.user, req.params.id) });
});

exports.acknowledgeAll = catchAsync(async (req, res) => {
  res.json({ data: await notifications.acknowledgeAll(req.user) });
});
