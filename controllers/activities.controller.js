const catchAsync = require("../utils/catchAsync");
const activities = require("../services/activities.service");

exports.list = catchAsync(async (req, res) => {
  res.json({ data: await activities.list(req.query || {}) });
});

exports.get = catchAsync(async (req, res) => {
  res.json({ data: await activities.get(req.params.id) });
});
