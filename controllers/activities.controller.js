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

exports.previewWorkbookImport = catchAsync(async (req, res) => {
  if (!req.file?.buffer) {
    return res.status(400).json({ error: { code: "INVALID_FILE", message: "Workbook file is required" } });
  }
  res.json({ data: await activities.previewWorkbookImport(req.file.buffer) });
});

exports.commitWorkbookImport = catchAsync(async (req, res) => {
  res.status(201).json({ data: await activities.commitWorkbookImport(req.body?.activities) });
});

exports.get = catchAsync(async (req, res) => {
  res.json({ data: await activities.get(req.params.id) });
});
