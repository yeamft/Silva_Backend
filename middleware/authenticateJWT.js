const jwt = require("jsonwebtoken");
const env = require("../config/env");
const prisma = require("../config/database");
const AppError = require("../utils/AppError");
const { hydrateUserContext } = require("../services/userContext.service");

const PUBLIC = new Set([
  "POST /auth/login",
  "POST /auth/signup",
  "POST /auth/refresh",
  "POST /auth/otp/verify",
  "POST /auth/totp/enroll",
  "POST /auth/password/forgot",
  "POST /auth/password/reset",
  "GET /auth/config",
]);

function isPublic(req) {
  const path = req.path.replace(/^\/api\/v1/, "") || "/";
  if (PUBLIC.has(`${req.method} ${path}`)) return true;
  if (path === "/health" || req.path === "/health") return true;
  return false;
}

module.exports = async (req, res, next) => {
  try {
    if (isPublic(req)) return next();

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

    const userId = decoded.userId || decoded.sub;
    const user = await prisma.users.findUnique({
      where: { id: userId },
      include: { organization: true },
    });
    if (!user || !user.active) {
      return next(new AppError(401, "UNAUTHENTICATED", "Invalid or expired token"));
    }

    const ctx = await hydrateUserContext(user);

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      organizationType: user.organization.type,
      vendorId: ctx.vendorId,
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
