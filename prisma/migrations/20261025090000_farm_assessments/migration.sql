CREATE TABLE "cropfort_farm_assessments" (
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "findings" TEXT NOT NULL DEFAULT '',
    "reportName" TEXT,
    "reportData" BYTEA,
    "reportSize" INTEGER,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "submittedByUserId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "history" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "cropfort_farm_assessments_pkey" PRIMARY KEY ("planId"),
    CONSTRAINT "cropfort_farm_assessments_status_check" CHECK ("status" IN ('draft', 'submitted', 'approved', 'changes_requested')),
    CONSTRAINT "cropfort_farm_assessments_planId_fkey" FOREIGN KEY ("planId") REFERENCES "cropfort_programme_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
