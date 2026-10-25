const catchAsync = require("../utils/catchAsync");
const activities = require("../services/activities.service");

exports.list = catchAsync(async (req, res) => {
  res.json({ data: await activities.list(req.query || {}) });
});

exports.create = catchAsync(async (req, res) => {
  res.status(201).json({ data: await activities.create(req.body || {}) });
});

exports.update = catchAsync(async (req, res) => {
  res.json({ data: await activities.update(req.params.id, req.body || {}) });
});

exports.bulkUpdate = catchAsync(async (req, res) => {
  res.json({ data: await activities.bulkUpdate(req.body?.ids, req.body?.patch || {}) });
});

exports.deactivateMany = catchAsync(async (req, res) => {
  res.json({ data: await activities.deactivateMany(req.body?.ids) });
});

exports.get = catchAsync(async (req, res) => {
  res.json({ data: await activities.get(req.params.id) });
});
