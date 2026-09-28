const jwt = require("jsonwebtoken");
const env = require("../config/env");
const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const { hydrateUserContext } = require("../services/userContext.service");

module.exports = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next(new AppError(401, "UNAUTHENTICATED", "Missing or invalid Authorization header"));
    }

    const token = authHeader.split(" ")[1];

    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET);
    } catch {
      return next(new AppError(401, "UNAUTHENTICATED", "Invalid or expired token"));
    }

    if (decoded.typ && decoded.typ !== "access") {
      return next(new AppError(401, "UNAUTHENTICATED", "Invalid access token"));
    }

    const userId = decoded.userId || decoded.sub;
    if (!userId) {
      return next(new AppError(401, "UNAUTHENTICATED", "Invalid or expired token"));
    }

    if (decoded.sessionId) {
      const session = await prisma.refresh_sessions.findFirst({
        where: {
          id: decoded.sessionId,
          userId,
          revoked: false,
          expiresAt: { gt: new Date() },
        },
        select: { id: true, otpVerifiedAt: true },
      });
      if (!session) {
        return next(new AppError(401, "UNAUTHENTICATED", "Session revoked or expired"));
      }
      if (env.OTP_ON_LOGIN && !session.otpVerifiedAt) {
        return next(new AppError(401, "UNAUTHENTICATED", "MFA verification required"));
      }
    }

    const user = await prisma.users.findUnique({
      where: { id: userId },
      include: { organization: true },
    });
    if (!user || !user.active) {
      return next(new AppError(401, "UNAUTHENTICATED", "Invalid or expired token"));
    }
    if (user.organization?.status === "suspended") {
      return next(new AppError(403, "FORBIDDEN", "Organization is suspended."));
    }

    const ctx = await hydrateUserContext(user);

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      cropfortRoles: ctx.cropfortRoles || [],
      organizationId: user.organizationId,
      organizationType: user.organization.type,
      organization: user.organization,
      activeProgramId: ctx.activeProgramId,
      tenantOrgId: user.organizationId,
      sessionId: decoded.sessionId || null,
    };
    next();
  } catch (err) {
    next(err);
  }
};
