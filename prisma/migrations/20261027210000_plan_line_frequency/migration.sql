-- Frequency per year on each Core Operations plan line (a planning assumption, not part of the rate card).
-- Annual quantity = quantity per round × frequency; existing lines stay at 1 (unchanged cost).
ALTER TABLE "cropfort_programme_plan_lines" ADD COLUMN IF NOT EXISTS "frequency" DECIMAL(8,2) NOT NULL DEFAULT 1;
