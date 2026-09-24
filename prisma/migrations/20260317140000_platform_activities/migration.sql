-- Platform-owned Activity taxonomy (not tenant-scoped)
CREATE TABLE IF NOT EXISTS "activities" (
    "id" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitOfMeasure" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "activities_tier_idx" ON "activities"("tier");
CREATE INDEX IF NOT EXISTS "activities_category_idx" ON "activities"("category");
CREATE INDEX IF NOT EXISTS "activities_tier_category_idx" ON "activities"("tier", "category");

-- Standing rate cards now reference platform activities (tables are empty / safe to re-point)
ALTER TABLE "labor_rate_cards" DROP CONSTRAINT IF EXISTS "labor_rate_cards_activityId_fkey";
ALTER TABLE "labor_rate_cards" ADD CONSTRAINT "labor_rate_cards_activityId_fkey"
  FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "material_rate_cards" DROP CONSTRAINT IF EXISTS "material_rate_cards_activityId_fkey";
ALTER TABLE "material_rate_cards" ADD CONSTRAINT "material_rate_cards_activityId_fkey"
  FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "service_rate_cards" DROP CONSTRAINT IF EXISTS "service_rate_cards_activityId_fkey";
ALTER TABLE "service_rate_cards" ADD CONSTRAINT "service_rate_cards_activityId_fkey"
  FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "benchmark_surveys" DROP CONSTRAINT IF EXISTS "benchmark_surveys_activityId_fkey";
ALTER TABLE "benchmark_surveys" ADD CONSTRAINT "benchmark_surveys_activityId_fkey"
  FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
