-- Vendors report the outcome of an issued work order: done (it moves to complete) or not done, with a reason.
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "vendorOutcome" TEXT;
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "vendorNote" TEXT;
ALTER TABLE "work_orders" ADD COLUMN IF NOT EXISTS "vendorReportedAt" TIMESTAMP(3);
