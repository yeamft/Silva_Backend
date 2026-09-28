const catchAsync = require("../utils/catchAsync");
const usersService = require("../services/users.service");

exports.list = catchAsync(async (req, res) => {
  const data = await usersService.listUsers(req.user);
  res.json({ data });
});

exports.directory = catchAsync(async (req, res) => {
  const data = await usersService.listDirectory(req.user);
  res.json({ data });
});

exports.meta = catchAsync(async (req, res) => {
  const data = await usersService.getMeta(req.user);
  res.json({ data });
});

exports.create = catchAsync(async (req, res) => {
  const data = await usersService.createUser(req.user, req.validatedBody, { req });
  res.status(201).json({ data });
});

exports.update = catchAsync(async (req, res) => {
  const data = await usersService.updateUser(req.user, req.params.id, req.validatedBody);
  res.json({ data });
});

exports.suspend = catchAsync(async (req, res) => {
  const data = await usersService.suspendUser(req.user, req.params.id);
  res.json({ data });
});

exports.activate = catchAsync(async (req, res) => {
  const data = await usersService.activateUser(req.user, req.params.id);
  res.json({ data });
});

exports.revokeSessions = catchAsync(async (req, res) => {
  const data = await usersService.revokeUserSessions(req.user, req.params.id);
  res.json({ data });
});

exports.remove = catchAsync(async (req, res) => {
  const data = await usersService.deleteUser(req.user, req.params.id);
  res.json({ data });
});

exports.audit = catchAsync(async (req, res) => {
  const data = await usersService.getUserAuditTrail(req.user, req.params.id);
  res.json({ data });
});
