-- AlterTable
ALTER TABLE "programs" ADD COLUMN IF NOT EXISTS "agreementConfigJson" JSONB;

-- AlterEnum
DO $$ BEGIN
  ALTER TYPE "MessageCounterpartyType" ADD VALUE IF NOT EXISTS 'site_owner';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
