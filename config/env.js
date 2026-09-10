const path = require("path");

function trimEnv(value) {
  const v = String(value ?? "").trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

module.exports = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT || 3000),
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET || process.env.JWT_ACCESS_SECRET || "dev-jwt-secret",
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || "dev-refresh-secret",
  JWT_ACCESS_EXPIRES_IN: Number(process.env.JWT_ACCESS_EXPIRES_IN || 3600),
  JWT_REFRESH_EXPIRES_IN: Number(process.env.JWT_REFRESH_EXPIRES_IN || 604800),
  BCRYPT_ROUNDS: Number(process.env.BCRYPT_ROUNDS || 10),
  RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS || 900000),
  RATE_LIMIT_MAX: Number(process.env.RATE_LIMIT_MAX || 20),
  /** When true, require TOTP on login. Alias: CROPFORT_OTP_ON_LOGIN */
  OTP_ON_LOGIN:
    process.env.OTP_ON_LOGIN === "true" ||
    (process.env.OTP_ON_LOGIN !== "false" && process.env.CROPFORT_OTP_ON_LOGIN === "true"),
  TRUST_PROXY: process.env.TRUST_PROXY === "false" ? false : Number(process.env.TRUST_PROXY || 1),
  APP_BASE_URL: process.env.APP_BASE_URL || process.env.CLIENT_URL || "http://localhost:3001",
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
