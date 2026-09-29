const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  await p.$executeRawUnsafe(
    `ALTER TABLE "farm_blocks" ADD COLUMN IF NOT EXISTS "mapLat" DOUBLE PRECISION`,
  );
  await p.$executeRawUnsafe(
    `ALTER TABLE "farm_blocks" ADD COLUMN IF NOT EXISTS "mapLng" DOUBLE PRECISION`,
  );
  console.log("farm_blocks mapLat/mapLng ready");
})()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
