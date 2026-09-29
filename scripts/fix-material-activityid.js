const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

async function run(sql) {
  console.log(">", sql.split("\n")[0].slice(0, 100));
  await p.$executeRawUnsafe(sql);
}

(async () => {
  await run(`ALTER TABLE "material_rate_cards" ADD COLUMN IF NOT EXISTS "activityId" TEXT`);
  await run(`ALTER TABLE "service_rate_cards" ADD COLUMN IF NOT EXISTS "activityId" TEXT`);
  await run(`DELETE FROM "material_rate_cards" WHERE "activityId" IS NULL`);
  await run(`DELETE FROM "service_rate_cards" WHERE "activityId" IS NULL`);
  await run(`ALTER TABLE "material_rate_cards" ALTER COLUMN "activityId" SET NOT NULL`);
  await run(`ALTER TABLE "service_rate_cards" ALTER COLUMN "activityId" SET NOT NULL`);

  await run(`ALTER TABLE "material_rate_cards" DROP CONSTRAINT IF EXISTS "material_rate_cards_activityId_fkey"`);
  await run(`ALTER TABLE "material_rate_cards" ADD CONSTRAINT "material_rate_cards_activityId_fkey"
    FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE`);

  await run(`ALTER TABLE "service_rate_cards" DROP CONSTRAINT IF EXISTS "service_rate_cards_activityId_fkey"`);
  await run(`ALTER TABLE "service_rate_cards" ADD CONSTRAINT "service_rate_cards_activityId_fkey"
    FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE`);

  await run(`CREATE INDEX IF NOT EXISTS "material_rate_cards_farmEstateId_activityId_idx"
    ON "material_rate_cards"("farmEstateId", "activityId")`);
  await run(`CREATE INDEX IF NOT EXISTS "service_rate_cards_farmEstateId_activityId_idx"
    ON "service_rate_cards"("farmEstateId", "activityId")`);

  const cols = await p.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name='material_rate_cards' AND column_name='activityId'`,
  );
  console.log("material activityId present:", cols.length > 0);
})()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
