-- Align material/service standing rate cards with Prisma activity-scoped model.
-- Older modular tables were kept by CREATE IF NOT EXISTS and never gained activityId.

ALTER TABLE "material_rate_cards" ADD COLUMN IF NOT EXISTS "activityId" TEXT;
ALTER TABLE "service_rate_cards" ADD COLUMN IF NOT EXISTS "activityId" TEXT;

-- Legacy modular rows used free-text "name" and cannot map to platform activities.
DELETE FROM "material_rate_cards" WHERE "activityId" IS NULL;
DELETE FROM "service_rate_cards" WHERE "activityId" IS NULL;

ALTER TABLE "material_rate_cards" ALTER COLUMN "activityId" SET NOT NULL;
ALTER TABLE "service_rate_cards" ALTER COLUMN "activityId" SET NOT NULL;

ALTER TABLE "material_rate_cards" DROP CONSTRAINT IF EXISTS "material_rate_cards_activityId_fkey";
ALTER TABLE "material_rate_cards" ADD CONSTRAINT "material_rate_cards_activityId_fkey"
  FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "service_rate_cards" DROP CONSTRAINT IF EXISTS "service_rate_cards_activityId_fkey";
ALTER TABLE "service_rate_cards" ADD CONSTRAINT "service_rate_cards_activityId_fkey"
  FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "material_rate_cards_farmEstateId_activityId_idx"
  ON "material_rate_cards"("farmEstateId", "activityId");
CREATE INDEX IF NOT EXISTS "service_rate_cards_farmEstateId_activityId_idx"
  ON "service_rate_cards"("farmEstateId", "activityId");
