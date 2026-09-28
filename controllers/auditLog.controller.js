const catchAsync = require("../utils/catchAsync");
const service = require("../services/auditLog.service");

exports.list = catchAsync(async (req, res) => {
  res.json({
    data: await service.listAuditLog(req.user, {
      entityType: req.query.entityType,
      entityId: req.query.entityId,
      limit: req.query.limit,
    }),
  });
});
