-- Rate scenario bands above the industry average (template Settings: Band 1 / Band 2).
-- Shared by rate cards and the Annual Budget plan; they raise the wage per man-day.
ALTER TABLE "programs" ADD COLUMN IF NOT EXISTS "cropfortScenarioBand1Pct" DECIMAL(5,2) NOT NULL DEFAULT 25;
ALTER TABLE "programs" ADD COLUMN IF NOT EXISTS "cropfortScenarioBand2Pct" DECIMAL(5,2) NOT NULL DEFAULT 50;
