ALTER TABLE "cropfort_programme_plans"
ADD COLUMN IF NOT EXISTS "annualPlanData" JSONB;

ALTER TABLE "cropfort_programme_plan_lines"
ADD COLUMN IF NOT EXISTS "normMdPerUnit" DECIMAL(14, 6);

ALTER TABLE "activities"
ADD COLUMN IF NOT EXISTS "defaultAnnualFrequency" DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS "planningCategory" TEXT,
ADD COLUMN IF NOT EXISTS "planningNotes" TEXT;

CREATE TABLE IF NOT EXISTS "cropfort_annual_benchmark_sets" (
	"id" TEXT NOT NULL,
	"version" TEXT NOT NULL,
	"sourceFile" TEXT NOT NULL,
	"importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "cropfort_annual_benchmark_sets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "cropfort_annual_benchmark_activities" (
	"id" TEXT NOT NULL,
	"benchmarkSetId" TEXT NOT NULL,
	"taxonomyActivityId" TEXT,
	"code" TEXT NOT NULL,
	"category" TEXT NOT NULL,
	"subgroup" TEXT NOT NULL DEFAULT '',
	"activityName" TEXT NOT NULL,
	"unit" TEXT NOT NULL,
	"farms" JSONB NOT NULL,
	"dataNotes" TEXT NOT NULL DEFAULT '',
	"sourceRow" INTEGER NOT NULL,
	CONSTRAINT "cropfort_annual_benchmark_activities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cropfort_annual_benchmark_sets_version_key"
ON "cropfort_annual_benchmark_sets"("version");

CREATE INDEX IF NOT EXISTS "cropfort_annual_benchmark_sets_importedAt_idx"
ON "cropfort_annual_benchmark_sets"("importedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "cropfort_annual_benchmark_activities_set_code_key"
ON "cropfort_annual_benchmark_activities"("benchmarkSetId", "code");

CREATE INDEX IF NOT EXISTS "cropfort_annual_benchmark_activities_taxonomyActivityId_idx"
ON "cropfort_annual_benchmark_activities"("taxonomyActivityId");

ALTER TABLE "cropfort_annual_benchmark_activities"
ADD CONSTRAINT "cropfort_annual_benchmark_activities_set_fkey"
FOREIGN KEY ("benchmarkSetId") REFERENCES "cropfort_annual_benchmark_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cropfort_annual_benchmark_activities"
ADD CONSTRAINT "cropfort_annual_benchmark_activities_activity_fkey"
FOREIGN KEY ("taxonomyActivityId") REFERENCES "activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;