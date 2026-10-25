-- Phase 2: Farm Assessment independence
-- Adds title, assessorUserId, blockIds, planYear to cropfort_farm_assessments.
-- Backfills title and planYear from linked programme plans where possible.
-- Preserves all existing rows, PDFs, and history.

-- 1. New columns
ALTER TABLE "cropfort_farm_assessments"
  ADD COLUMN IF NOT EXISTS "title"          TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "assessorUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "blockIds"       TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "planYear"       INTEGER,
  ADD COLUMN IF NOT EXISTS "returnedComment" TEXT;

-- 2. Backfill title from linked plan name
UPDATE "cropfort_farm_assessments" fa
SET "title" = COALESCE(
  NULLIF(TRIM(pp.name), ''),
  COALESCE(fa."planningCycle", '') || ' Farm Assessment'
)
FROM "cropfort_programme_plans" pp
WHERE fa."planId" = pp.id
  AND (fa."title" IS NULL OR fa."title" = '');

-- 3. Backfill planYear from linked plan
UPDATE "cropfort_farm_assessments" fa
SET "planYear" = pp."planYear"
FROM "cropfort_programme_plans" pp
WHERE fa."planId" = pp.id
  AND fa."planYear" IS NULL;

-- 4. Backfill farmEstateId from linked plan where missing
UPDATE "cropfort_farm_assessments" fa
SET "farmEstateId" = pp."farmEstateId"
FROM "cropfort_programme_plans" pp
WHERE fa."planId" = pp.id
  AND fa."farmEstateId" IS NULL;

-- 5. Backfill programId from linked plan where missing
UPDATE "cropfort_farm_assessments" fa
SET "programId" = pp."programId"
FROM "cropfort_programme_plans" pp
WHERE fa."planId" = pp.id
  AND fa."programId" IS NULL;

-- 6. FK for assessorUserId (nullable — assessor may be a free-text name for legacy rows)
ALTER TABLE "cropfort_farm_assessments"
  ADD CONSTRAINT "farm_assessments_assessorUserId_fkey"
  FOREIGN KEY ("assessorUserId") REFERENCES "users"("id") ON DELETE SET NULL
  NOT VALID;

-- 7. Index on planYear for register filtering
CREATE INDEX IF NOT EXISTS "farm_assessments_planYear_idx"
  ON "cropfort_farm_assessments"("planYear");

CREATE INDEX IF NOT EXISTS "farm_assessments_status_idx"
  ON "cropfort_farm_assessments"("status");
