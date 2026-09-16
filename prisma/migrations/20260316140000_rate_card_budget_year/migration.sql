-- Add budget year + archive support for rate card lines
ALTER TABLE "rate_card_lines" ADD COLUMN IF NOT EXISTS "budgetYear" INTEGER;
ALTER TABLE "rate_card_lines" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

-- Backfill existing rows to FY 2025/26 (Jul 2025 – Jun 2026)
UPDATE "rate_card_lines" SET "budgetYear" = 2025 WHERE "budgetYear" IS NULL;

ALTER TABLE "rate_card_lines" ALTER COLUMN "budgetYear" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "rate_card_lines_programId_budgetYear_idx" ON "rate_card_lines"("programId", "budgetYear");
CREATE INDEX IF NOT EXISTS "rate_card_lines_programId_archivedAt_idx" ON "rate_card_lines"("programId", "archivedAt");
