-- Cropfort direct instructions

DO $$ BEGIN
  CREATE TYPE "CropfortDirectInstructionStatus" AS ENUM (
    'draft', 'issued', 'confirmed', 'rolled_into_weekly', 'escalated'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "cropfort_direct_instructions" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "monthlyWoId" TEXT,
  "monthlyWoCode" TEXT,
  "weeklyPlanId" TEXT,
  "weeklyPlanLineId" TEXT,
  "workOrderId" TEXT,
  "blockId" TEXT,
  "blockCode" TEXT NOT NULL DEFAULT '',
  "amountEtb" DECIMAL(14,2) NOT NULL,
  "overThreshold" BOOLEAN NOT NULL DEFAULT false,
  "oralPendingConfirm" BOOLEAN NOT NULL DEFAULT false,
  "status" "CropfortDirectInstructionStatus" NOT NULL DEFAULT 'issued',
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt" TIMESTAMP(3),
  "rolledIntoWeeklyPlanId" TEXT,
  "note" TEXT NOT NULL DEFAULT '',
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cropfort_direct_instructions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "cropfort_direct_instructions_programId_code_key"
  ON "cropfort_direct_instructions"("programId", "code");
CREATE INDEX IF NOT EXISTS "cropfort_direct_instructions_programId_status_idx"
  ON "cropfort_direct_instructions"("programId", "status");
CREATE INDEX IF NOT EXISTS "cropfort_direct_instructions_monthlyWoId_idx"
  ON "cropfort_direct_instructions"("monthlyWoId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cropfort_direct_instructions_programId_fkey') THEN
    ALTER TABLE "cropfort_direct_instructions"
      ADD CONSTRAINT "cropfort_direct_instructions_programId_fkey"
      FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cropfort_direct_instructions_createdByUserId_fkey') THEN
    ALTER TABLE "cropfort_direct_instructions"
      ADD CONSTRAINT "cropfort_direct_instructions_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
