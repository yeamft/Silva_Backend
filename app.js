const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const requestId = require("./middleware/requestId");
const errorHandler = require("./middleware/errorHandler");
const prisma = require("./config/database");
const env = require("./config/env");
const { corsOptions, allowedOrigins } = require("./config/cors");

const authRoutes = require("./routes/auth.routes");
const usersRoutes = require("./routes/users.routes");
const orgMapRoutes = require("./routes/orgMap.routes");

const app = express();

if (env.TRUST_PROXY !== false) {
  app.set("trust proxy", env.TRUST_PROXY);
}

app.use(cors(corsOptions));
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(requestId);

app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ data: { ok: true, db: true } });
  } catch {
    res.status(503).json({ data: { ok: false, db: false } });
  }
});
app.get("/api/v1/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ data: { ok: true, db: true } });
  } catch {
    res.status(503).json({ data: { ok: false, db: false } });
  }
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/contact", require("./routes/contact.routes"));
app.use("/api/v1/activities", require("./routes/activities.routes"));
app.use("/api/v1/farms", require("./routes/farms.routes"));
app.use("/api/v1/benchmark-surveys", require("./routes/benchmarkSurveys.routes"));
app.use("/api/v1/rate-card-proposals", require("./routes/rateCardProposals.routes"));
app.use("/api/v1/users", usersRoutes);
app.use("/api/v1/org-map", orgMapRoutes);
app.use("/api/v1/programs", require("./routes/programs.routes"));
app.use("/api/v1/notifications", require("./routes/notifications.routes"));

// Legacy modular period rate cards + catalogs retired (Cropfort Excel model).
function goneModular(req, res) {
  res.status(410).json({
    error: {
      code: "GONE",
      message:
        "Period rate cards and catalogs were removed. Use /api/v1/activities, /api/v1/farms/:farmId/*-rate-cards, /api/v1/benchmark-surveys, and /api/v1/rate-card-proposals.",
      details: [],
    },
  });
}
app.use("/api/v1/labor-activities", goneModular);
app.use("/api/v1/equipment-resources", goneModular);
app.use("/api/v1/materials", goneModular);
app.use("/api/v1/rate-cards", goneModular);
app.use("/api/v1/rate-card", goneModular);



app.use((req, res) => {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: "Route not found.", details: [] },
    requestId: req.requestId,
  });
});

app.use(errorHandler);

async function shutdown() {
  try {
    await prisma.$disconnect();
  } finally {
    process.exit(0);
  }
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

if (require.main === module) {
  const PORT = env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} (${env.NODE_ENV})`);
    console.log(`Trust proxy: ${env.TRUST_PROXY}`);
    if (allowedOrigins.length) {
      console.log(`CORS allowed origins: ${allowedOrigins.join(", ")}`);
    } else {
      console.warn("CORS: no allowed origins configured — set CORS_ORIGINS or APP_BASE_URL");
    }
    if (env.SMTP_HOST && env.SMTP_USER) {
      console.log(`Mail: SMTP ${env.SMTP_USER} @ ${env.SMTP_HOST}:${env.SMTP_PORT}`);
    } else {
      console.warn("Mail: SMTP not configured — add SMTP_* to server/.env");
    }
  });
}

module.exports = app;
