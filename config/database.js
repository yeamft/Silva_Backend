require("dotenv").config();

const { PrismaClient } = require("@prisma/client");

/** Reuse one client across nodemon reloads when possible. */
const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.__spxPrisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

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
