const catchAsync = require("../utils/catchAsync");
const authService = require("../services/auth.service");
const authTotp = require("../services/auth.totp.service");

exports.config = catchAsync(async (_req, res) => {
  res.json({ data: { otpOnLogin: authTotp.otpEnabled() } });
});

exports.login = catchAsync(async (req, res) => {
  const data = await authService.login(req.validatedBody.email, req.validatedBody.password);
  res.json({ data });
});

exports.signup = catchAsync(async (req, res) => {
  const data = await authService.signup(req.validatedBody);
  res.status(201).json({ data });
});

exports.switchProgram = catchAsync(async (req, res) => {
  const programService = require("../services/program.service");
  const program = await programService.switchProgram(req.user, req.validatedBody.programId);
  const tokens = await authService.reissueTokens(req.user.id);
  const me = await authService.me({ id: req.user.id });
  res.json({ data: { ...tokens, activeProgram: program, me } });
});

exports.updateTenantBranding = catchAsync(async (req, res) => {
  const programService = require("../services/program.service");
  const data = await programService.updateTenantBranding(req.user, req.validatedBody);
  res.json({ data });
});

exports.completeOnboarding = catchAsync(async (req, res) => {
  const programService = require("../services/program.service");
  const data = await programService.completeOnboarding(req.user, req.validatedBody);
  res.json({ data });
});

exports.logout = catchAsync(async (req, res) => {
  await authService.logout(req.user?.id, req.body?.refreshToken);
  res.json({ data: { ok: true } });
});

exports.refresh = catchAsync(async (req, res) => {
  const data = await authService.refresh(req.validatedBody.refreshToken);
  res.json({ data });
});

exports.me = catchAsync(async (req, res) => {
  const data = await authService.me(req.user);
  res.json({ data });
});

exports.forgot = catchAsync(async (req, res) => {
  await authService.forgotPassword(req.validatedBody.email);
  res.json({ data: { ok: true } });
});

exports.reset = catchAsync(async (req, res) => {
  await authService.resetPassword(req.validatedBody.token, req.validatedBody.password);
  res.json({ data: { ok: true } });
});

exports.invitePreview = catchAsync(async (req, res) => {
  const usersService = require("../services/users.service");
  const data = await usersService.getInvitePreview(req.query.token || req.params.token);
  res.json({ data });
});

exports.acceptInvite = catchAsync(async (req, res) => {
  const usersService = require("../services/users.service");
  const data = await usersService.acceptInvite(req.validatedBody);
  res.json({ data });
});

exports.changePassword = catchAsync(async (req, res) => {
  const data = await authService.changePassword(req.user, req.validatedBody);
  res.json({ data });
});

exports.verifyOtp = catchAsync(async (req, res) => {
  const data = await authService.verifyOtp(
    req.validatedBody.otpChallengeToken,
    req.validatedBody.code,
    req.validatedBody.deviceLabel,
  );
  const me = await authService.me({ id: data.user.id });
  res.json({ data: { ...data, me } });
});

exports.enrollTotp = catchAsync(async (req, res) => {
  const data = await authService.enrollTotp(req.validatedBody.enrollmentToken, req.validatedBody.code);
  const me = await authService.me({ id: data.user.id });
  res.json({ data: { ...data, me } });
});

exports.listSessions = catchAsync(async (req, res) => {
  const data = await authService.listSessions(req.user.id);
  res.json({ data });
});

exports.revokeSession = catchAsync(async (req, res) => {
  const data = await authService.revokeSession(req.user.id, req.params.sessionId);
  res.json({ data });
});
