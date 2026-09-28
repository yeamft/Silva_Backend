-- Cropfort projects, interventions, plan scenarios + reports redesign

-- ── Projects ────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "CropfortProjectStatus" AS ENUM (
    'draft', 'submitted', 'approved', 'in_progress', 'complete', 'returned'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "cropfort_projects" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "blockId" TEXT,
  "blockCode" TEXT NOT NULL DEFAULT '',
  "vendor" TEXT NOT NULL DEFAULT '',
  "budgetEtb" DECIMAL(14,2) NOT NULL,
  "band" "AfeBand" NOT NULL,
  "status" "CropfortProjectStatus" NOT NULL DEFAULT 'draft',
  "notes" TEXT NOT NULL DEFAULT '',
  "cropfortAfeId" TEXT,
  "returnedComment" TEXT,
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cropfort_projects_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "cropfort_project_milestones" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "done" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "cropfort_project_milestones_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cropfort_projects_programId_code_key"
  ON "cropfort_projects"("programId", "code");
CREATE INDEX IF NOT EXISTS "cropfort_projects_programId_status_idx"
  ON "cropfort_projects"("programId", "status");
CREATE INDEX IF NOT EXISTS "cropfort_project_milestones_projectId_idx"
  ON "cropfort_project_milestones"("projectId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cropfort_projects_programId_fkey') THEN
    ALTER TABLE "cropfort_projects"
      ADD CONSTRAINT "cropfort_projects_programId_fkey"
      FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cropfort_projects_createdByUserId_fkey') THEN
    ALTER TABLE "cropfort_projects"
      ADD CONSTRAINT "cropfort_projects_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cropfort_project_milestones_projectId_fkey') THEN
    ALTER TABLE "cropfort_project_milestones"
      ADD CONSTRAINT "cropfort_project_milestones_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "cropfort_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── Interventions ───────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "CropfortInterventionStatus" AS ENUM (
    'draft', 'active', 'submitted', 'approved', 'complete', 'returned'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "cropfort_interventions" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "blockId" TEXT,
  "blockCode" TEXT NOT NULL DEFAULT '',
  "vendor" TEXT NOT NULL DEFAULT '',
  "costEtb" DECIMAL(14,2) NOT NULL,
  "band" "AfeBand" NOT NULL,
  "status" "CropfortInterventionStatus" NOT NULL DEFAULT 'draft',
  "cropfortAfeId" TEXT,
  "returnedComment" TEXT,
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cropfort_interventions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "cropfort_intervention_steps" (
  "id" TEXT NOT NULL,
  "interventionId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "done" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "cropfort_intervention_steps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cropfort_interventions_programId_code_key"
  ON "cropfort_interventions"("programId", "code");
CREATE INDEX IF NOT EXISTS "cropfort_interventions_programId_status_idx"
  ON "cropfort_interventions"("programId", "status");
CREATE INDEX IF NOT EXISTS "cropfort_intervention_steps_interventionId_idx"
  ON "cropfort_intervention_steps"("interventionId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cropfort_interventions_programId_fkey') THEN
    ALTER TABLE "cropfort_interventions"
      ADD CONSTRAINT "cropfort_interventions_programId_fkey"
      FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cropfort_interventions_createdByUserId_fkey') THEN
    ALTER TABLE "cropfort_interventions"
      ADD CONSTRAINT "cropfort_interventions_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cropfort_intervention_steps_interventionId_fkey') THEN
    ALTER TABLE "cropfort_intervention_steps"
      ADD CONSTRAINT "cropfort_intervention_steps_interventionId_fkey"
      FOREIGN KEY ("interventionId") REFERENCES "cropfort_interventions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ── Plan scenarios ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "cropfort_plan_scenarios" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "snapshotJson" JSONB NOT NULL,
  "includedCount" INTEGER NOT NULL DEFAULT 0,
  "budgetEtb" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "scheduledCount" INTEGER NOT NULL DEFAULT 0,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cropfort_plan_scenarios_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "cropfort_plan_scenarios_programId_idx"
  ON "cropfort_plan_scenarios"("programId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cropfort_plan_scenarios_programId_fkey') THEN
    ALTER TABLE "cropfort_plan_scenarios"
      ADD CONSTRAINT "cropfort_plan_scenarios_programId_fkey"
      FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cropfort_plan_scenarios_createdByUserId_fkey') THEN
    ALTER TABLE "cropfort_plan_scenarios"
      ADD CONSTRAINT "cropfort_plan_scenarios_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ── Reports (redesigned — unused generic model → Cropfort ops reports) ───
DROP TABLE IF EXISTS "reports" CASCADE;
DROP TYPE IF EXISTS "ReportStatus";
DROP TYPE IF EXISTS "ReportType";

CREATE TYPE "ReportStatus" AS ENUM ('draft', 'submitted', 'released', 'returned');
CREATE TYPE "ReportCadence" AS ENUM ('monthly', 'six_month', 'annual');

CREATE TABLE "reports" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT '',
  "cadence" "ReportCadence" NOT NULL DEFAULT 'monthly',
  "periodLabel" TEXT NOT NULL,
  "status" "ReportStatus" NOT NULL DEFAULT 'draft',
  "farmName" TEXT NOT NULL DEFAULT '',
  "programName" TEXT NOT NULL DEFAULT '',
  "authorName" TEXT NOT NULL DEFAULT '',
  "summary" TEXT NOT NULL DEFAULT '',
  "highlights" TEXT NOT NULL DEFAULT '',
  "risks" TEXT NOT NULL DEFAULT '',
  "recommendations" TEXT NOT NULL DEFAULT '',
  "outlook" TEXT NOT NULL DEFAULT '',
  "planEtb" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "actualEtb" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "variancePct" DECIMAL(6,2) NOT NULL DEFAULT 0,
  "metricsJson" JSONB,
  "activityLinesJson" JSONB NOT NULL DEFAULT '[]',
  "blockLinesJson" JSONB NOT NULL DEFAULT '[]',
  "attentionItemsJson" JSONB NOT NULL DEFAULT '[]',
  "missAttributionsJson" JSONB NOT NULL DEFAULT '[]',
  "eventsJson" JSONB NOT NULL DEFAULT '[]',
  "returnedComment" TEXT,
  "submittedAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "releasedTo" TEXT,
  "releasedByUserId" TEXT,
  "visibleToSilva" BOOLEAN NOT NULL DEFAULT false,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reports_programId_code_key" ON "reports"("programId", "code");
CREATE INDEX "reports_programId_status_idx" ON "reports"("programId", "status");
CREATE INDEX "reports_programId_cadence_idx" ON "reports"("programId", "cadence");

ALTER TABLE "reports"
  ADD CONSTRAINT "reports_programId_fkey"
  FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reports"
  ADD CONSTRAINT "reports_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reports"
  ADD CONSTRAINT "reports_releasedByUserId_fkey"
  FOREIGN KEY ("releasedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
