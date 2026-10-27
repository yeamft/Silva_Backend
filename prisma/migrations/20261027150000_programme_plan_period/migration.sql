-- Core Operations plans can cover the full year or one half of it.
-- annual = Tikimt–Meskerem, first_half = Tikimt–Megabit, second_half = Miyazya–Meskerem.

ALTER TABLE "cropfort_programme_plans" ADD COLUMN IF NOT EXISTS "planPeriod" TEXT NOT NULL DEFAULT 'annual';

-- One live plan per farm area, budget year and period (an annual plan and a half-year plan
-- for the same year are also kept apart by the service).
DROP INDEX IF EXISTS "cropfort_programme_plans_live_year_key";

CREATE UNIQUE INDEX IF NOT EXISTS "cropfort_programme_plans_live_period_key"
  ON "cropfort_programme_plans" ("programId", "farmEstateId", "planYear", "planPeriod")
  WHERE "status" <> 'archived';
