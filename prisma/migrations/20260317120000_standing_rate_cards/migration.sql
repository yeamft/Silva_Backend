-- Standing material / service rate cards (farm + activity scoped)
CREATE TABLE IF NOT EXISTS "material_rate_cards" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "farmEstateId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "rate" DECIMAL(14,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ETB',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "material_rate_cards_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "service_rate_cards" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "farmEstateId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "rate" DECIMAL(14,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ETB',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "service_rate_cards_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "material_rate_cards_farmEstateId_activityId_idx" ON "material_rate_cards"("farmEstateId", "activityId");
CREATE INDEX IF NOT EXISTS "material_rate_cards_programId_idx" ON "material_rate_cards"("programId");
CREATE INDEX IF NOT EXISTS "service_rate_cards_farmEstateId_activityId_idx" ON "service_rate_cards"("farmEstateId", "activityId");
CREATE INDEX IF NOT EXISTS "service_rate_cards_programId_idx" ON "service_rate_cards"("programId");

ALTER TABLE "material_rate_cards" DROP CONSTRAINT IF EXISTS "material_rate_cards_activityId_fkey";
ALTER TABLE "material_rate_cards" ADD CONSTRAINT "material_rate_cards_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activity_master"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "material_rate_cards" DROP CONSTRAINT IF EXISTS "material_rate_cards_farmEstateId_fkey";
ALTER TABLE "material_rate_cards" ADD CONSTRAINT "material_rate_cards_farmEstateId_fkey" FOREIGN KEY ("farmEstateId") REFERENCES "farm_estates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "material_rate_cards" DROP CONSTRAINT IF EXISTS "material_rate_cards_programId_fkey";
ALTER TABLE "material_rate_cards" ADD CONSTRAINT "material_rate_cards_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "service_rate_cards" DROP CONSTRAINT IF EXISTS "service_rate_cards_activityId_fkey";
ALTER TABLE "service_rate_cards" ADD CONSTRAINT "service_rate_cards_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activity_master"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "service_rate_cards" DROP CONSTRAINT IF EXISTS "service_rate_cards_farmEstateId_fkey";
ALTER TABLE "service_rate_cards" ADD CONSTRAINT "service_rate_cards_farmEstateId_fkey" FOREIGN KEY ("farmEstateId") REFERENCES "farm_estates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "service_rate_cards" DROP CONSTRAINT IF EXISTS "service_rate_cards_programId_fkey";
ALTER TABLE "service_rate_cards" ADD CONSTRAINT "service_rate_cards_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
