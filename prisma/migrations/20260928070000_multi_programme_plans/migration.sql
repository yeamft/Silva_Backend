-- Multi programme plans per farm area + budget year
-- Preserve existing rows; drop uniqueness on (programId, farmEstateId, planYear)

ALTER TABLE "cropfort_programme_plans" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "cropfort_programme_plans" ADD COLUMN IF NOT EXISTS "code" TEXT NOT NULL DEFAULT '';
ALTER TABLE "cropfort_programme_plans" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "cropfort_programme_plans" ADD COLUMN IF NOT EXISTS "planningCycleLabel" TEXT NOT NULL DEFAULT '';
ALTER TABLE "cropfort_programme_plans" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

-- Backfill names for existing single-plan rows
UPDATE "cropfort_programme_plans" p
SET
  "name" = CASE
    WHEN COALESCE(TRIM(p."name"), '') = '' THEN
      COALESCE(NULLIF(TRIM(p."budgetYearLabel"), ''), CONCAT('Programme ', p."planYear"::text))
    ELSE p."name"
  END,
  "code" = CASE
    WHEN COALESCE(TRIM(p."code"), '') = '' THEN CONCAT('PP-', UPPER(SUBSTRING(p."id" FROM LENGTH(p."id") - 5)))
    ELSE p."code"
  END,
  "planningCycleLabel" = CASE
    WHEN COALESCE(TRIM(p."planningCycleLabel"), '') = '' THEN CONCAT(p."planYear"::text, ' Programme')
    ELSE p."planningCycleLabel"
  END
WHERE COALESCE(TRIM(p."name"), '') = ''
   OR COALESCE(TRIM(p."code"), '') = ''
   OR COALESCE(TRIM(p."planningCycleLabel"), '') = '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cropfort_programme_plans_programId_farmEstateId_planYear_key'
  ) THEN
    ALTER TABLE "cropfort_programme_plans"
      DROP CONSTRAINT "cropfort_programme_plans_programId_farmEstateId_planYear_key";
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "cropfort_programme_plans_programId_planYear_idx"
  ON "cropfort_programme_plans"("programId", "planYear");
CREATE INDEX IF NOT EXISTS "cropfort_programme_plans_programId_name_idx"
  ON "cropfort_programme_plans"("programId", "name");
