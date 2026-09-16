const path = require("path");

function trimEnv(value) {
  const v = String(value ?? "").trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const NODE_ENV = process.env.NODE_ENV || "development";
const JWT_SECRET = process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET || "";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "";
const DATABASE_URL = process.env.DATABASE_URL || "";

const WEAK_SECRETS = new Set([
  "",
  "change-me-jwt-secret",
  "change-me-refresh-secret",
  "dev-jwt-secret",
  "dev-refresh-secret",
]);

if (!DATABASE_URL) {
  console.error("FATAL: DATABASE_URL is required.");
  process.exit(1);
}

if (NODE_ENV === "production") {
  if (WEAK_SECRETS.has(JWT_SECRET) || WEAK_SECRETS.has(JWT_REFRESH_SECRET)) {
    console.error("FATAL: Set strong JWT_SECRET and JWT_REFRESH_SECRET in production.");
    process.exit(1);
  }
  if (JWT_SECRET.length < 32 || JWT_REFRESH_SECRET.length < 32) {
    console.error("FATAL: JWT secrets must be at least 32 characters in production.");
    process.exit(1);
  }
  if (JWT_SECRET === JWT_REFRESH_SECRET) {
    console.error("FATAL: JWT_SECRET and JWT_REFRESH_SECRET must be different.");
    process.exit(1);
  }
} else if (WEAK_SECRETS.has(JWT_SECRET) || WEAK_SECRETS.has(JWT_REFRESH_SECRET)) {
  console.warn(
    "WARNING: Using weak/default JWT secrets. Set JWT_SECRET and JWT_REFRESH_SECRET before production.",
  );
}

module.exports = {
  NODE_ENV,
  PORT: Number(process.env.PORT || 3000),
  DATABASE_URL,
  JWT_SECRET: JWT_SECRET || "dev-jwt-secret-local-only-change-me-32",
  JWT_REFRESH_SECRET: JWT_REFRESH_SECRET || "dev-refresh-secret-local-only-change-me",
  JWT_ACCESS_EXPIRES_IN: Number(process.env.JWT_ACCESS_EXPIRES_IN || 3600),
  JWT_REFRESH_EXPIRES_IN: Number(process.env.JWT_REFRESH_EXPIRES_IN || 604800),
  BCRYPT_ROUNDS: Number(process.env.BCRYPT_ROUNDS || 12),
  RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS || 900000),
  RATE_LIMIT_MAX: Number(process.env.RATE_LIMIT_MAX || 20),
  OTP_ON_LOGIN:
    process.env.OTP_ON_LOGIN === "true" ||
    (process.env.OTP_ON_LOGIN !== "false" && process.env.CROPFORT_OTP_ON_LOGIN === "true"),
  TRUST_PROXY: process.env.TRUST_PROXY === "false" ? false : Number(process.env.TRUST_PROXY || 1),
  APP_BASE_URL: process.env.APP_BASE_URL || process.env.CLIENT_URL || "http://localhost:8080",
  CORS_ORIGINS: process.env.CORS_ORIGINS || "",
  MAIL_FROM: process.env.MAIL_FROM || "SPX Farm OS <noreply@localhost>",
  SMTP_HOST: process.env.SMTP_HOST || "",
  SMTP_PORT: (() => {
    const port = Number(process.env.SMTP_PORT || 587);
    return Number.isFinite(port) ? port : 587;
  })(),
  SMTP_SECURE: (() => {
    if (process.env.SMTP_SECURE === "true") return true;
    if (process.env.SMTP_SECURE === "false") return false;
    return Number(process.env.SMTP_PORT || 587) === 465;
  })(),
  SMTP_USER: trimEnv(process.env.SMTP_USER),
  SMTP_PASS: trimEnv(process.env.SMTP_PASS),
  RESEND_API_KEY: process.env.RESEND_API_KEY || "",
  MAIL_TEST_TO: process.env.MAIL_TEST_TO || "",
  MAIL_TEST_REDIRECT: process.env.MAIL_TEST_REDIRECT === "true",
  MAIL_PROVIDER: (process.env.MAIL_PROVIDER || "auto").toLowerCase(),
};
