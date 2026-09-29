const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();

(async () => {
  const material = await p.$queryRawUnsafe("SELECT count(*)::int AS c FROM material_rate_cards");
  const service = await p.$queryRawUnsafe("SELECT count(*)::int AS c FROM service_rate_cards");
  const sample = await p.$queryRawUnsafe(
    'SELECT id, name, unit, "farmEstateId" FROM material_rate_cards LIMIT 5',
  );
  console.log({ material, service, sample });
})()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => p.$disconnect());
