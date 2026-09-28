-- Cropfort weekly plans (Execution weekly submissions)

CREATE TYPE "CropfortWeeklyPlanStatus" AS ENUM ('draft', 'submitted', 'approved', 'returned', 'active');

CREATE TABLE IF NOT EXISTS "cropfort_weekly_plans" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "weekLabel" TEXT NOT NULL,
  "monthlyWoId" TEXT,
  "monthlyWoCode" TEXT,
  "status" "CropfortWeeklyPlanStatus" NOT NULL DEFAULT 'draft',
  "loop" TEXT NOT NULL DEFAULT 'none',
  "note" TEXT NOT NULL DEFAULT '',
  "bridgedWorkOrderIds" JSONB NOT NULL DEFAULT '[]',
  "directInstructionIds" JSONB NOT NULL DEFAULT '[]',
  "returnedComment" TEXT,
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "activatedAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cropfort_weekly_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "cropfort_weekly_plan_lines" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "monthlyLineId" TEXT,
  "activityId" TEXT,
  "activityCode" TEXT NOT NULL DEFAULT '',
  "activityName" TEXT NOT NULL,
  "blockId" TEXT,
  "blockCode" TEXT NOT NULL DEFAULT '',
  "qty" DECIMAL(14,2) NOT NULL,
  "unit" TEXT NOT NULL DEFAULT '',
  "crew" TEXT NOT NULL DEFAULT '',
  "materials" TEXT NOT NULL DEFAULT '',
  "manualsRef" TEXT NOT NULL DEFAULT '',
  "etb" DECIMAL(14,2) NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cropfort_weekly_plan_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cropfort_weekly_plans_programId_code_key"
  ON "cropfort_weekly_plans"("programId", "code");
CREATE INDEX IF NOT EXISTS "cropfort_weekly_plans_programId_status_idx"
  ON "cropfort_weekly_plans"("programId", "status");
CREATE INDEX IF NOT EXISTS "cropfort_weekly_plans_programId_weekLabel_idx"
  ON "cropfort_weekly_plans"("programId", "weekLabel");
CREATE INDEX IF NOT EXISTS "cropfort_weekly_plan_lines_planId_idx"
  ON "cropfort_weekly_plan_lines"("planId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cropfort_weekly_plans_programId_fkey'
  ) THEN
    ALTER TABLE "cropfort_weekly_plans"
      ADD CONSTRAINT "cropfort_weekly_plans_programId_fkey"
      FOREIGN KEY ("programId") REFERENCES "programs"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cropfort_weekly_plans_createdByUserId_fkey'
  ) THEN
    ALTER TABLE "cropfort_weekly_plans"
      ADD CONSTRAINT "cropfort_weekly_plans_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cropfort_weekly_plan_lines_planId_fkey'
  ) THEN
    ALTER TABLE "cropfort_weekly_plan_lines"
      ADD CONSTRAINT "cropfort_weekly_plan_lines_planId_fkey"
      FOREIGN KEY ("planId") REFERENCES "cropfort_weekly_plans"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
