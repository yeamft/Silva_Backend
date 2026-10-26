function withPrismaConnectionLimit(databaseUrl, configuredLimit = process.env.PRISMA_CONNECTION_LIMIT) {
  const url = new URL(databaseUrl);
  if (url.searchParams.has("connection_limit")) return url.toString();

  const connectionLimit = configuredLimit == null || configuredLimit === ""
    ? 3
    : Number(configuredLimit);
  if (!Number.isInteger(connectionLimit) || connectionLimit < 1) {
    throw new Error("PRISMA_CONNECTION_LIMIT must be a positive integer.");
  }

  url.searchParams.set("connection_limit", String(connectionLimit));
  return url.toString();
}

module.exports = { withPrismaConnectionLimit };
