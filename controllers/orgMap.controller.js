const catchAsync = require("../utils/catchAsync");
const orgMap = require("../services/orgMap.service");

exports.listOrganizations = catchAsync(async (req, res) => {
  res.json({ data: await orgMap.listOrganizations(req.user) });
});
exports.createOrganization = catchAsync(async (req, res) => {
  res.status(201).json({ data: await orgMap.createOrganization(req.user, req.validatedBody) });
});
exports.updateOrganization = catchAsync(async (req, res) => {
  res.json({ data: await orgMap.updateOrganization(req.user, req.params.id, req.validatedBody) });
});
exports.deleteOrganization = catchAsync(async (req, res) => {
  res.json({ data: await orgMap.deleteOrganization(req.user, req.params.id) });
});

exports.listBlocks = catchAsync(async (req, res) => {
  res.json({ data: await orgMap.listBlocks(req.user) });
});
exports.createBlock = catchAsync(async (req, res) => {
  res.status(201).json({ data: await orgMap.createBlock(req.user, req.validatedBody) });
});
exports.updateBlock = catchAsync(async (req, res) => {
  res.json({ data: await orgMap.updateBlock(req.user, req.params.id, req.validatedBody) });
});
exports.deleteBlock = catchAsync(async (req, res) => {
  res.json({ data: await orgMap.deleteBlock(req.user, req.params.id) });
});

exports.listFarmAreas = catchAsync(async (req, res) => {
  res.json({ data: await orgMap.listFarmAreas(req.user) });
});
exports.createFarmArea = catchAsync(async (req, res) => {
  res.status(201).json({ data: await orgMap.createFarmArea(req.user, req.validatedBody) });
});
exports.updateFarmArea = catchAsync(async (req, res) => {
  res.json({ data: await orgMap.updateFarmArea(req.user, req.params.id, req.validatedBody) });
});
exports.deleteFarmArea = catchAsync(async (req, res) => {
  res.json({ data: await orgMap.deleteFarmArea(req.user, req.params.id) });
});

exports.listVendors = catchAsync(async (req, res) => {
  res.json({ data: await orgMap.listVendors(req.user) });
});
exports.createVendor = catchAsync(async (req, res) => {
  res.status(201).json({ data: await orgMap.createVendor(req.user, req.validatedBody) });
});
exports.updateVendor = catchAsync(async (req, res) => {
  res.json({ data: await orgMap.updateVendor(req.user, req.params.id, req.validatedBody) });
});
exports.deleteVendor = catchAsync(async (req, res) => {
  res.json({ data: await orgMap.deleteVendor(req.user, req.params.id) });
});

exports.listAssetOwners = catchAsync(async (req, res) => {
  res.json({ data: await orgMap.listAssetOwners(req.user) });
});
exports.createAssetOwner = catchAsync(async (req, res) => {
  res.status(201).json({ data: await orgMap.createAssetOwner(req.user, req.validatedBody) });
});
exports.updateAssetOwner = catchAsync(async (req, res) => {
  res.json({ data: await orgMap.updateAssetOwner(req.user, req.params.id, req.validatedBody) });
});
exports.deleteAssetOwner = catchAsync(async (req, res) => {
  res.json({ data: await orgMap.deleteAssetOwner(req.user, req.params.id) });
});

exports.overview = catchAsync(async (req, res) => {
  res.json({ data: await orgMap.getFarmMapOverview(req.user) });
});
