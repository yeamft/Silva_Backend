const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../config/database");
const env = require("../config/env");
const AppError = require("../utils/AppError");
const { uuid, hashToken, rawToken } = require("../utils/ids");
const { userJson } = require("../utils/serializers");
const { permissionsFor } = require("../utils/roles");
const programService = require("./program.service");
const { hydrateUserContext } = require("./userContext.service");
const authTotp = require("./auth.totp.service");
const mail = require("./mail.service");

function signAccess(user, sessionId) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      organizationType: user.organization?.type,
      activeProgramId: user.activeProgramId || null,
      sessionId: sessionId || null,
      typ: "access",
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN },
  );
}

async function tokenBundle(user, options = {}) {
  const full = await prisma.users.findUnique({
    where: { id: user.id },
    include: { organization: true },
  });
  const jti = uuid("ses");
  const refreshToken = jwt.sign({ sub: full.id, jti, typ: "refresh" }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
  });
  const now = new Date();
  const otpVerified = options.otpVerified ?? !authTotp.otpEnabled();
  await prisma.refresh_sessions.create({
    data: {
      id: jti,
      userId: full.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + env.JWT_REFRESH_EXPIRES_IN * 1000),
      otpVerifiedAt: otpVerified ? now : null,
      deviceLabel: options.deviceLabel || null,
      lastActiveAt: now,
    },
  });
  return {
    accessToken: signAccess(full, jti),
    refreshToken,
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    sessionId: jti,
    user: userJson(full),
  };
}

exports.reissueTokens = async (userId) => {
  const user = await prisma.users.findUnique({ where: { id: userId } });
  if (!user || !user.active) throw new AppError(401, "UNAUTHENTICATED", "Invalid user.");
  return tokenBundle(user);
};

exports.login = async (email, password) => {
  const user = await prisma.users.findUnique({
    where: { email: email.toLowerCase() },
    include: { organization: true },
  });
  if (!user) throw new AppError(401, "UNAUTHENTICATED", "Invalid email or password.");
  if (!user.active) {
    throw new AppError(
      403,
      "ACCOUNT_INACTIVE",
      "Your account is not activated yet. Contact your program administrator.",
    );
  }
  if (user.organization?.status === "suspended") {
    throw new AppError(403, "FORBIDDEN", "Organization is suspended.");
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new AppError(401, "UNAUTHENTICATED", "Invalid email or password.");

  if (authTotp.otpEnabled()) {
    if (!user.totpEnrolledAt || !user.totpSecret) {
      const enrollment = await authTotp.beginEnrollment(user.id);
      return {
        requiresTotpEnrollment: true,
        enrollmentToken: enrollment.enrollmentToken,
        qrDataUrl: enrollment.qrDataUrl,
        user: { id: user.id, email: user.email, name: user.name },
      };
    }
    const otpChallengeToken = await authTotp.createLoginChallenge(user.id);
    return {
      requiresOtp: true,
      otpChallengeToken,
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  await hydrateUserContext(user);
  const tokens = await tokenBundle(user);
  const me = await exports.me({ id: user.id });
  return { ...tokens, me };
};

exports.signup = async () => {
  throw new AppError(
    403,
    "SIGNUP_DISABLED",
    "Public signup is disabled. Asset owners and vendors must apply for registration; SPX will activate approved accounts.",
  );
};

exports.logout = async (userId, refreshToken) => {
  if (refreshToken) {
    await prisma.refresh_sessions.updateMany({
      where: { userId, tokenHash: hashToken(refreshToken) },
      data: { revoked: true },
    });
  } else if (userId) {
    await prisma.refresh_sessions.updateMany({ where: { userId }, data: { revoked: true } });
  }
};

exports.refresh = async (refreshToken) => {
  let payload;
  try {
    payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET);
  } catch {
    throw new AppError(401, "UNAUTHENTICATED", "Invalid or expired token");
  }
  const session = await prisma.refresh_sessions.findFirst({
    where: { id: payload.jti, tokenHash: hashToken(refreshToken), revoked: false },
  });
  if (!session || session.expiresAt < new Date()) {
    throw new AppError(401, "UNAUTHENTICATED", "Invalid or expired token");
  }
  await prisma.refresh_sessions.update({ where: { id: session.id }, data: { revoked: true } });
  const user = await prisma.users.findUnique({ where: { id: session.userId } });
  if (!user || !user.active) throw new AppError(401, "UNAUTHENTICATED", "Invalid or expired token");
  const otpVerified = Boolean(session.otpVerifiedAt) || !authTotp.otpEnabled();
  return tokenBundle(user, { otpVerified });
};

exports.me = async (user) => {
  await hydrateUserContext(user);
  const full = await prisma.users.findUnique({
    where: { id: user.id },
    include: { organization: true, activeProgram: true },
  });
  const programs = await programService.listPrograms(full);
  return {
    user: userJson(full),
    tenant: {
      id: full.organization.id,
      name: full.organization.name,
      slug: full.organization.slug,
      displayName: full.organization.displayName || full.organization.name,
      type: full.organization.type,
      branding: full.organization.brandingJson || null,
      status: full.organization.status,
    },
    activeProgram: full.activeProgram
      ? {
          id: full.activeProgram.id,
          name: full.activeProgram.name,
          slug: full.activeProgram.slug,
          branding: full.activeProgram.brandingJson || null,
          cropfortAfeBandAMaxEtb:
            full.activeProgram.cropfortAfeBandAMaxEtb != null
              ? Number(full.activeProgram.cropfortAfeBandAMaxEtb)
              : 500000,
          cropfortAfeBandBMaxEtb:
            full.activeProgram.cropfortAfeBandBMaxEtb != null
              ? Number(full.activeProgram.cropfortAfeBandBMaxEtb)
              : 2000000,
          cropfortAfeBandCMaxEtb:
            full.activeProgram.cropfortAfeBandCMaxEtb != null
              ? Number(full.activeProgram.cropfortAfeBandCMaxEtb)
              : 5000000,
        }
      : null,
    programs,
    permissions: permissionsFor(full.role),
    onboardingComplete: Boolean(full.organization?.displayName),
    mfaEnabled: Boolean(full.totpEnrolledAt),
  };
};

exports.forgotPassword = async (email) => {
  const user = await prisma.users.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) return;
  const token = rawToken();
  await prisma.password_reset_tokens.create({
    data: {
      id: uuid("rst"),
      email: user.email,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 3600 * 1000),
    },
  });
  const resetUrl = mail.buildAbsoluteUrl(
    `/reset-password?token=${encodeURIComponent(token)}`,
  );
  try {
    await mail.sendMail({
      to: user.email,
      subject: "Reset your SPX Farm OS password",
      text: `Reset your password: ${resetUrl}`,
      html: `<p>Reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
    });
  } catch (err) {
    console.error("[forgotPassword] email failed:", err.message);
  }
};

exports.resetPassword = async (token, password) => {
  const row = await prisma.password_reset_tokens.findFirst({
    where: { tokenHash: hashToken(token), used: false },
  });
  if (!row || row.expiresAt < new Date()) {
    throw new AppError(401, "UNAUTHENTICATED", "Invalid or expired reset token.");
  }
  const hash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  const user = await prisma.users.findUnique({ where: { email: row.email } });
  await prisma.$transaction([
    prisma.users.update({ where: { email: row.email }, data: { passwordHash: hash } }),
    prisma.password_reset_tokens.update({ where: { id: row.id }, data: { used: true } }),
    ...(user
      ? [prisma.refresh_sessions.updateMany({ where: { userId: user.id }, data: { revoked: true } })]
      : []),
  ]);
};

exports.changePassword = async (user, dto) => {
  const found = await prisma.users.findUnique({ where: { id: user.id } });
  if (!found) throw new AppError(404, "NOT_FOUND", "User not found.");
  const ok = await bcrypt.compare(dto.currentPassword, found.passwordHash);
  if (!ok) throw new AppError(400, "INVALID_CREDENTIALS", "Current password is incorrect.");
  await prisma.$transaction([
    prisma.users.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, env.BCRYPT_ROUNDS) },
    }),
    prisma.refresh_sessions.updateMany({ where: { userId: user.id }, data: { revoked: true } }),
  ]);
  return { ok: true };
};

exports.verifyOtp = async (challengeToken, code, deviceLabel) => {
  return authTotp.verifyLoginOtp(challengeToken, code, (u, opts) =>
    tokenBundle(u, { ...opts, deviceLabel }),
  );
};

exports.enrollTotp = async (enrollmentToken, code) => {
  const user = await authTotp.completeEnrollment(enrollmentToken, code);
  return tokenBundle(user, { otpVerified: true });
};

exports.listSessions = async (userId) => authTotp.listSessions(userId);

exports.revokeSession = async (userId, sessionId) => authTotp.revokeSession(userId, sessionId);

exports.issueTokens = (user, options) => tokenBundle(user, options);
