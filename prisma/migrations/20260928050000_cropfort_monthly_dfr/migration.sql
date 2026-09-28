-- Cropfort monthly work orders + daily field records

CREATE TYPE "CropfortMonthlyWoStatus" AS ENUM ('draft', 'submitted', 'approved', 'returned', 'active');
CREATE TYPE "CropfortDfrStatus" AS ENUM ('draft', 'submitted', 'site_checked', 'validated', 'returned');

CREATE TABLE IF NOT EXISTS "cropfort_monthly_work_orders" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "farmId" TEXT,
  "farmName" TEXT NOT NULL DEFAULT '',
  "ethiopianMonth" TEXT NOT NULL,
  "yearGc" INTEGER NOT NULL,
  "status" "CropfortMonthlyWoStatus" NOT NULL DEFAULT 'draft',
  "sourcePlanId" TEXT,
  "outOfPlanReason" TEXT NOT NULL DEFAULT '',
  "loop" TEXT NOT NULL DEFAULT 'none',
  "totalEtb" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "lastMonthInsights" TEXT NOT NULL DEFAULT '',
  "structuredInsightsJson" JSONB,
  "recommendedAdjustmentsJson" JSONB NOT NULL DEFAULT '[]',
  "note" TEXT NOT NULL DEFAULT '',
  "returnedComment" TEXT,
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "activatedAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cropfort_monthly_work_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "cropfort_monthly_wo_lines" (
  "id" TEXT NOT NULL,
  "monthlyWoId" TEXT NOT NULL,
  "activityId" TEXT,
  "activityCode" TEXT NOT NULL DEFAULT '',
  "activityName" TEXT NOT NULL,
  "blockId" TEXT,
  "blockCode" TEXT NOT NULL DEFAULT '',
  "plannedQty" DECIMAL(14,2) NOT NULL,
  "unit" TEXT NOT NULL DEFAULT '',
  "etb" DECIMAL(14,2) NOT NULL,
  "manualsRef" TEXT NOT NULL DEFAULT '',
  "inPlan" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cropfort_monthly_wo_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "cropfort_daily_field_records" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "weeklyPlanId" TEXT,
  "weeklyPlanLineId" TEXT,
  "monthlyWoId" TEXT,
  "monthlyWoCode" TEXT NOT NULL DEFAULT '',
  "monthlyLineId" TEXT,
  "workOrderId" TEXT,
  "date" DATE NOT NULL,
  "blockId" TEXT,
  "blockCode" TEXT NOT NULL DEFAULT '',
  "activityId" TEXT,
  "activityCode" TEXT NOT NULL DEFAULT '',
  "activityName" TEXT NOT NULL,
  "plannedQty" DECIMAL(14,2) NOT NULL,
  "actualQty" DECIMAL(14,2) NOT NULL,
  "unit" TEXT NOT NULL DEFAULT '',
  "laborHours" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "materialsUsedJson" JSONB NOT NULL DEFAULT '[]',
  "notes" TEXT NOT NULL DEFAULT '',
  "status" "CropfortDfrStatus" NOT NULL DEFAULT 'draft',
  "variancePct" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "linkedTicketId" TEXT,
  "pctDone" DECIMAL(8,2),
  "qualityScore" DECIMAL(8,2),
  "version" INTEGER NOT NULL DEFAULT 1,
  "supersedesId" TEXT,
  "failedCriteriaJson" JSONB NOT NULL DEFAULT '[]',
  "entrySource" TEXT NOT NULL DEFAULT 'bagro_platform',
  "missCause" TEXT,
  "loop" TEXT NOT NULL DEFAULT 'none',
  "validationNotes" TEXT NOT NULL DEFAULT '',
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cropfort_daily_field_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cropfort_monthly_work_orders_programId_code_key"
  ON "cropfort_monthly_work_orders"("programId", "code");
CREATE INDEX IF NOT EXISTS "cropfort_monthly_work_orders_programId_status_idx"
  ON "cropfort_monthly_work_orders"("programId", "status");
CREATE INDEX IF NOT EXISTS "cropfort_monthly_work_orders_programId_ethiopianMonth_yearGc_idx"
  ON "cropfort_monthly_work_orders"("programId", "ethiopianMonth", "yearGc");
CREATE INDEX IF NOT EXISTS "cropfort_monthly_wo_lines_monthlyWoId_idx"
  ON "cropfort_monthly_wo_lines"("monthlyWoId");

CREATE UNIQUE INDEX IF NOT EXISTS "cropfort_daily_field_records_programId_code_key"
  ON "cropfort_daily_field_records"("programId", "code");
CREATE INDEX IF NOT EXISTS "cropfort_daily_field_records_programId_status_idx"
  ON "cropfort_daily_field_records"("programId", "status");
CREATE INDEX IF NOT EXISTS "cropfort_daily_field_records_weeklyPlanId_idx"
  ON "cropfort_daily_field_records"("weeklyPlanId");
CREATE INDEX IF NOT EXISTS "cropfort_daily_field_records_monthlyWoId_idx"
  ON "cropfort_daily_field_records"("monthlyWoId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cropfort_monthly_work_orders_programId_fkey') THEN
    ALTER TABLE "cropfort_monthly_work_orders"
      ADD CONSTRAINT "cropfort_monthly_work_orders_programId_fkey"
      FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cropfort_monthly_work_orders_createdByUserId_fkey') THEN
    ALTER TABLE "cropfort_monthly_work_orders"
      ADD CONSTRAINT "cropfort_monthly_work_orders_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cropfort_monthly_wo_lines_monthlyWoId_fkey') THEN
    ALTER TABLE "cropfort_monthly_wo_lines"
      ADD CONSTRAINT "cropfort_monthly_wo_lines_monthlyWoId_fkey"
      FOREIGN KEY ("monthlyWoId") REFERENCES "cropfort_monthly_work_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cropfort_daily_field_records_programId_fkey') THEN
    ALTER TABLE "cropfort_daily_field_records"
      ADD CONSTRAINT "cropfort_daily_field_records_programId_fkey"
      FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cropfort_daily_field_records_createdByUserId_fkey') THEN
    ALTER TABLE "cropfort_daily_field_records"
      ADD CONSTRAINT "cropfort_daily_field_records_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cropfort_daily_field_records_supersedesId_fkey') THEN
    ALTER TABLE "cropfort_daily_field_records"
      ADD CONSTRAINT "cropfort_daily_field_records_supersedesId_fkey"
      FOREIGN KEY ("supersedesId") REFERENCES "cropfort_daily_field_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
