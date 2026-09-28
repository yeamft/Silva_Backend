const catchAsync = require("../utils/catchAsync");
const service = require("../services/cropfortAgreementConfig.service");

exports.get = catchAsync(async (req, res) => {
  res.json({ data: await service.getAgreementConfig(req.user) });
});

exports.put = catchAsync(async (req, res) => {
  res.json({ data: await service.putAgreementConfig(req.user, req.body || {}) });
});
