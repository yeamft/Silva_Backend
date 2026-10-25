-- Farm Assessment: structured fields, standalone (no mandatory plan dependency)
-- Make planId nullable so assessments can exist before a Core Operations plan
ALTER TABLE "cropfort_farm_assessments"
  ALTER COLUMN "planId" DROP NOT NULL;

-- New structured fields
ALTER TABLE "cropfort_farm_assessments"
  ADD COLUMN IF NOT EXISTS "farmEstateId"      TEXT,
  ADD COLUMN IF NOT EXISTS "programId"         TEXT,
  ADD COLUMN IF NOT EXISTS "planningCycle"     TEXT,
  ADD COLUMN IF NOT EXISTS "assessmentDate"    DATE,
  ADD COLUMN IF NOT EXISTS "assessorName"      TEXT,
  ADD COLUMN IF NOT EXISTS "assessmentPurpose" TEXT NOT NULL DEFAULT 'annual_baseline',
  ADD COLUMN IF NOT EXISTS "assessedAreaHa"    DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "cropStage"         TEXT,
  ADD COLUMN IF NOT EXISTS "generalCondition"  TEXT,
  ADD COLUMN IF NOT EXISTS "recommendedOps"    JSONB NOT NULL DEFAULT '[]';

-- Allow standalone assessments (no plan) — use a surrogate PK
-- For existing rows planId remains the PK; new standalone rows get a uuid id
ALTER TABLE "cropfort_farm_assessments"
  ADD COLUMN IF NOT EXISTS "id" TEXT;

-- Backfill id from planId for existing rows
UPDATE "cropfort_farm_assessments" SET "id" = "planId" WHERE "id" IS NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS "farm_assessments_farmEstateId_idx" ON "cropfort_farm_assessments"("farmEstateId");
CREATE INDEX IF NOT EXISTS "farm_assessments_programId_idx"    ON "cropfort_farm_assessments"("programId");
