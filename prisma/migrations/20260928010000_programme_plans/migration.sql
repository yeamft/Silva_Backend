-- Programme plans (Core Ops wizard persistence)

CREATE TYPE "ProgrammePlanStatus" AS ENUM (
  'draft',
  'ready_for_review',
  'submitted',
  'returned',
  'approved',
  'active',
  'closed',
  'archived'
);

CREATE TYPE "ProgrammeRateStatus" AS ENUM (
  'VALID',
  'MISSING',
  'EXPIRED',
  'UNAPPROVED',
  'OVERRIDDEN'
);

CREATE TABLE "cropfort_programme_plans" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "farmEstateId" TEXT NOT NULL,
  "planYear" INTEGER NOT NULL,
  "budgetYearLabel" TEXT NOT NULL DEFAULT '',
  "status" "ProgrammePlanStatus" NOT NULL DEFAULT 'draft',
  "notes" TEXT,
  "totalHa" DECIMAL(10,2),
  "vendorLabel" TEXT NOT NULL DEFAULT '',
  "programBandSetId" TEXT,
  "applicableBlockIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "plannedCostEtb" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "resolvedBand" "AfeBand",
  "approvalRequirement" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "submittedByUserId" TEXT,
  "reviewedByUserId" TEXT,
  "submittedAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "returnedComment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "cropfort_programme_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cropfort_programme_plan_lines" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "activityId" TEXT NOT NULL,
  "activityCode" TEXT NOT NULL,
  "activityName" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT '',
  "uom" TEXT NOT NULL DEFAULT '',
  "scope" TEXT NOT NULL DEFAULT 'block',
  "included" BOOLEAN NOT NULL DEFAULT false,
  "plannedQty" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "unitRateEtb" DECIMAL(14,4),
  "rateCardId" TEXT,
  "rateSource" TEXT,
  "rateStatus" "ProgrammeRateStatus" NOT NULL DEFAULT 'MISSING',
  "plannedCostEtb" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "intensities" JSONB NOT NULL DEFAULT '{}',
  "blockAllocations" JSONB NOT NULL DEFAULT '[]',
  "manualsRef" TEXT NOT NULL DEFAULT '',
  "serviceType" TEXT NOT NULL DEFAULT 'core_ops',
  "notes" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "cropfort_programme_plan_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cropfort_programme_plans_programId_farmEstateId_planYear_key"
  ON "cropfort_programme_plans"("programId", "farmEstateId", "planYear");

CREATE INDEX "cropfort_programme_plans_programId_status_idx"
  ON "cropfort_programme_plans"("programId", "status");

CREATE INDEX "cropfort_programme_plans_farmEstateId_planYear_idx"
  ON "cropfort_programme_plans"("farmEstateId", "planYear");

CREATE INDEX "cropfort_programme_plans_programId_farmEstateId_status_idx"
  ON "cropfort_programme_plans"("programId", "farmEstateId", "status");

CREATE UNIQUE INDEX "cropfort_programme_plan_lines_planId_activityId_key"
  ON "cropfort_programme_plan_lines"("planId", "activityId");

CREATE INDEX "cropfort_programme_plan_lines_planId_included_idx"
  ON "cropfort_programme_plan_lines"("planId", "included");

CREATE INDEX "cropfort_programme_plan_lines_activityId_idx"
  ON "cropfort_programme_plan_lines"("activityId");

ALTER TABLE "cropfort_programme_plans"
  ADD CONSTRAINT "cropfort_programme_plans_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cropfort_programme_plans"
  ADD CONSTRAINT "cropfort_programme_plans_submittedByUserId_fkey"
  FOREIGN KEY ("submittedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cropfort_programme_plans"
  ADD CONSTRAINT "cropfort_programme_plans_reviewedByUserId_fkey"
  FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "cropfort_programme_plans"
  ADD CONSTRAINT "cropfort_programme_plans_farmEstateId_fkey"
  FOREIGN KEY ("farmEstateId") REFERENCES "farm_estates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cropfort_programme_plans"
  ADD CONSTRAINT "cropfort_programme_plans_programId_fkey"
  FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cropfort_programme_plan_lines"
  ADD CONSTRAINT "cropfort_programme_plan_lines_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "cropfort_programme_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cropfort_programme_plan_lines"
  ADD CONSTRAINT "cropfort_programme_plan_lines_activityId_fkey"
  FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
