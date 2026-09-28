-- Link work orders to Cropfort AFEs

ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "cropfortAfeId" TEXT;

CREATE INDEX IF NOT EXISTS "work_orders_cropfortAfeId_idx" ON "work_orders"("cropfortAfeId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'work_orders_cropfortAfeId_fkey'
  ) THEN
    ALTER TABLE "work_orders"
      ADD CONSTRAINT "work_orders_cropfortAfeId_fkey"
      FOREIGN KEY ("cropfortAfeId") REFERENCES "cropfort_afes"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
