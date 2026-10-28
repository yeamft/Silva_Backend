require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const { withPrismaConnectionLimit } = require("./prisma-connection-url");
const authContextCache = require("../utils/authContextCache");
const realtime = require("../utils/realtime");

/** Reuse one client across nodemon reloads when possible. */
const globalForPrisma = globalThis;

/** Tables authenticateJWT builds req.user from — writes to them invalidate the auth cache. */
const AUTH_CONTEXT_MODELS = new Set([
  "users",
  "refresh_sessions",
  "organizations",
  "cropfort_user_roles",
  "program_memberships",
]);
const WRITE_OPERATIONS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
]);

function createClient() {
  return new PrismaClient({
    datasources: {
      db: {
        url: withPrismaConnectionLimit(process.env.DATABASE_URL),
      },
    },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  }).$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const result = await query(args);
          if (AUTH_CONTEXT_MODELS.has(model) && WRITE_OPERATIONS.has(operation)) {
            authContextCache.clear();
          }
          // Tell open screens this programme's data changed (server push)
          if (WRITE_OPERATIONS.has(operation)) realtime.announce(model, args, result);
          return result;
        },
      },
    },
  });
}

const prisma = globalForPrisma.__spxPrisma || createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__spxPrisma = prisma;
}

async function connectWithRetry(maxAttempts = 8, delayMs = 2500) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await prisma.$connect();
      if (attempt > 1) {
        console.log(`Database connected on attempt ${attempt}.`);
      }
      return;
    } catch (err) {
      const isLast = attempt === maxAttempts;
      const msg = err.code || err.message || String(err);
      console.error(`Database connection attempt ${attempt}/${maxAttempts} failed:`, msg);
      if (isLast) {
        console.error(
          "Could not reach the database. Check DATABASE_URL, Supabase pool size, and that only one API process is running.",
        );
        process.exit(1);
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function disconnectPrisma() {
  try {
    await prisma.$disconnect();
  } catch {
    /* ignore */
  }
}

if (process.env.NODE_ENV !== "test") {
  connectWithRetry().catch((err) => {
    console.error("Failed to connect to database:", err);
    process.exit(1);
  });

  // Release the session-pool slot on nodemon restart / Ctrl+C.
  const release = () => {
    void disconnectPrisma();
  };
  process.once("SIGINT", release);
  process.once("SIGTERM", release);
  process.once("SIGUSR2", release); // nodemon (unix)
}

module.exports = prisma;
