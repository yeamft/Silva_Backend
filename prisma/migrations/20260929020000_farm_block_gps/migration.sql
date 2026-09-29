-- Optional GPS for farm blocks (Farm Map uses these when present)
ALTER TABLE "farm_blocks" ADD COLUMN IF NOT EXISTS "mapLat" DOUBLE PRECISION;
ALTER TABLE "farm_blocks" ADD COLUMN IF NOT EXISTS "mapLng" DOUBLE PRECISION;
