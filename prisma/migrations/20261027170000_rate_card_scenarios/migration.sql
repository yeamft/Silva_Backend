-- Rate scenarios on each rate card: Industry average, +25%, +50%, Expert input.
-- planBasis is the scenario chosen as the Chaka Buna plan rate; proposedRate follows it.

ALTER TABLE "rate_card_proposals" ADD COLUMN IF NOT EXISTS "planBasis" TEXT NOT NULL DEFAULT 'expert_input';
ALTER TABLE "rate_card_proposals" ADD COLUMN IF NOT EXISTS "expertRate" DECIMAL(14,4);

-- Existing cards keep their current rate as the expert input
UPDATE "rate_card_proposals" SET "expertRate" = "proposedRate" WHERE "expertRate" IS NULL;
