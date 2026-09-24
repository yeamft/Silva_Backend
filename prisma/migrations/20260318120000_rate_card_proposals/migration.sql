-- Benchmark survey evidence fields
ALTER TABLE "benchmark_surveys" ADD COLUMN IF NOT EXISTS "sourceEvidence" TEXT;
ALTER TABLE "benchmark_surveys" ADD COLUMN IF NOT EXISTS "notes" TEXT;

-- Rate card proposals (SPX → Silva approval → standing)
CREATE TABLE IF NOT EXISTS "rate_card_proposals" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "farmEstateId" TEXT NOT NULL,
    "budgetYear" INTEGER NOT NULL,
    "blockId" TEXT,
    "activityId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "sourceSurveyId" TEXT,
    "recommendedRate" DECIMAL(14,4),
    "proposedRate" DECIMAL(14,4) NOT NULL,
    "norm" DECIMAL(14,6),
    "fallbackRate" DECIMAL(14,4),
    "sourceBasis" TEXT NOT NULL DEFAULT '',
    "availableFrom" DATE,
    "availableTo" DATE,
    "justificationNote" TEXT,
    "sourceEvidence" TEXT,
    "notes" TEXT,
    "status" "CropfortLineStatus" NOT NULL DEFAULT 'draft',
    "returnedComment" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_card_proposals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "rate_card_proposals_programId_status_idx" ON "rate_card_proposals"("programId", "status");
CREATE INDEX IF NOT EXISTS "rate_card_proposals_farmEstateId_status_idx" ON "rate_card_proposals"("farmEstateId", "status");
CREATE INDEX IF NOT EXISTS "rate_card_proposals_programId_budgetYear_idx" ON "rate_card_proposals"("programId", "budgetYear");
CREATE INDEX IF NOT EXISTS "rate_card_proposals_sourceSurveyId_idx" ON "rate_card_proposals"("sourceSurveyId");
CREATE INDEX IF NOT EXISTS "rate_card_proposals_archivedAt_idx" ON "rate_card_proposals"("archivedAt");

DO $$ BEGIN
  ALTER TABLE "rate_card_proposals" ADD CONSTRAINT "rate_card_proposals_activityId_fkey"
    FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "rate_card_proposals" ADD CONSTRAINT "rate_card_proposals_approvedByUserId_fkey"
    FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "rate_card_proposals" ADD CONSTRAINT "rate_card_proposals_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "rate_card_proposals" ADD CONSTRAINT "rate_card_proposals_farmEstateId_fkey"
    FOREIGN KEY ("farmEstateId") REFERENCES "farm_estates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "rate_card_proposals" ADD CONSTRAINT "rate_card_proposals_programId_fkey"
    FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "rate_card_proposals" ADD CONSTRAINT "rate_card_proposals_sourceSurveyId_fkey"
    FOREIGN KEY ("sourceSurveyId") REFERENCES "benchmark_surveys"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
