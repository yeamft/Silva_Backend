const catchAsync = require("../utils/catchAsync");
const service = require("../services/farmAssessment.service");

exports.list = catchAsync(async (req, res) => {
  res.json({ data: await service.list(req.user) });
});

for (const action of ["get", "save", "submit", "decide"]) {
  exports[action] = catchAsync(async (req, res) => {
    res.json({ data: await service[action](req.user, req.params.id, req.validatedBody, req.file) });
  });
}

exports.download = catchAsync(async (req, res) => {
  const report = await service.download(req.user, req.params.id);
  res.set("Cache-Control", "private, no-store");
  res.set("Content-Type", "application/pdf");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Content-Disposition", `attachment; filename="assessment.pdf"; filename*=UTF-8''${encodeURIComponent(report.reportName)}`);
  res.send(Buffer.from(report.reportData));
});
