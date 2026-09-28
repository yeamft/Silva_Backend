-- Work orders: optional AFE, display fields, indexes for execution APIs

ALTER TABLE "work_orders" ALTER COLUMN "afeId" DROP NOT NULL;
ALTER TABLE "work_orders" ALTER COLUMN "tier" SET DEFAULT 'retainer';

ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "title" TEXT;
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "plannedCostEtb" DECIMAL(14,2);
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "farmEstateId" TEXT;
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "instructions" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "work_orders_programId_code_key"
  ON "work_orders"("programId", "code");

CREATE INDEX IF NOT EXISTS "work_orders_afeId_idx" ON "work_orders"("afeId");
CREATE INDEX IF NOT EXISTS "work_orders_assignedVendorId_idx" ON "work_orders"("assignedVendorId");
CREATE INDEX IF NOT EXISTS "work_orders_farmEstateId_idx" ON "work_orders"("farmEstateId");

CREATE INDEX IF NOT EXISTS "field_tickets_workOrderId_idx" ON "field_tickets"("workOrderId");
CREATE INDEX IF NOT EXISTS "field_tickets_submittedByUserId_idx" ON "field_tickets"("submittedByUserId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'work_orders_farmEstateId_fkey'
  ) THEN
    ALTER TABLE "work_orders"
      ADD CONSTRAINT "work_orders_farmEstateId_fkey"
      FOREIGN KEY ("farmEstateId") REFERENCES "farm_estates"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
