-- Fix: promote `id` to primary key on cropfort_farm_assessments.
-- The original table used planId as PK. Phase 2 added an `id` column but
-- never swapped the PK, so Prisma queries using `where: { id }` fail on prod.

-- 1. Ensure every row has a non-null id (backfill any stragglers)
UPDATE "cropfort_farm_assessments"
SET "id" = "planId"
WHERE "id" IS NULL AND "planId" IS NOT NULL;

-- 2. Make id NOT NULL
ALTER TABLE "cropfort_farm_assessments"
  ALTER COLUMN "id" SET NOT NULL;

-- 3. Drop the old planId primary key constraint
ALTER TABLE "cropfort_farm_assessments"
  DROP CONSTRAINT "cropfort_farm_assessments_pkey";

-- 4. Promote id as the new primary key
ALTER TABLE "cropfort_farm_assessments"
  ADD CONSTRAINT "cropfort_farm_assessments_pkey" PRIMARY KEY ("id");

-- 5. Add UNIQUE constraint on planId (nullable one-to-one with programme_plans)
--    Only add if it doesn't already exist.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cropfort_farm_assessments_planId_key'
  ) THEN
    ALTER TABLE "cropfort_farm_assessments"
      ADD CONSTRAINT "cropfort_farm_assessments_planId_key" UNIQUE ("planId");
  END IF;
END $$;

-- 6. Re-add the FK from planId → cropfort_programme_plans (was CASCADE on old PK)
--    Drop first in case it still exists from the original migration.
ALTER TABLE "cropfort_farm_assessments"
  DROP CONSTRAINT IF EXISTS "cropfort_farm_assessments_planId_fkey";

ALTER TABLE "cropfort_farm_assessments"
  ADD CONSTRAINT "cropfort_farm_assessments_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "cropfort_programme_plans"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 7. Add FK for farmEstateId (nullable)
ALTER TABLE "cropfort_farm_assessments"
  DROP CONSTRAINT IF EXISTS "farm_assessments_farmEstateId_fkey";

ALTER TABLE "cropfort_farm_assessments"
  ADD CONSTRAINT "farm_assessments_farmEstateId_fkey"
  FOREIGN KEY ("farmEstateId") REFERENCES "farm_estates"("id")
  ON DELETE SET NULL ON UPDATE CASCADE
  NOT VALID;
