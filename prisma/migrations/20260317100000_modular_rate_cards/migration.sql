-- Modular catalogs + document rate cards
CREATE TYPE "ModularRateCardStatus" AS ENUM ('draft', 'submitted', 'approved', 'rejected', 'published', 'archived');
CREATE TYPE "RateCardLineCategory" AS ENUM ('labor', 'equipment', 'material');

CREATE TABLE "labor_activities" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultUnit" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "labor_activities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "equipment_resources" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultUnit" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "equipment_resources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "materials" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultUnit" TEXT NOT NULL,
    "stockQuantity" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rate_cards" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ModularRateCardStatus" NOT NULL DEFAULT 'draft',
    "effectiveDate" DATE NOT NULL,
    "endDate" DATE,
    "currency" TEXT NOT NULL DEFAULT 'ETB',
    "createdByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rate_cards_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rate_card_line_items" (
    "id" TEXT NOT NULL,
    "rateCardId" TEXT NOT NULL,
    "category" "RateCardLineCategory" NOT NULL,
    "laborActivityId" TEXT,
    "equipmentResourceId" TEXT,
    "materialId" TEXT,
    "unit" TEXT NOT NULL,
    "rate" DECIMAL(14,4) NOT NULL,
    "overtimeMultiplier" DECIMAL(8,4),
    "minimumQty" DECIMAL(14,4),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rate_card_line_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rate_card_line_items_one_ref"
      CHECK (
        (
          ("category" = 'labor' AND "laborActivityId" IS NOT NULL AND "equipmentResourceId" IS NULL AND "materialId" IS NULL)
          OR ("category" = 'equipment' AND "equipmentResourceId" IS NOT NULL AND "laborActivityId" IS NULL AND "materialId" IS NULL)
          OR ("category" = 'material' AND "materialId" IS NOT NULL AND "laborActivityId" IS NULL AND "equipmentResourceId" IS NULL)
        )
      )
);

CREATE TABLE "rate_card_approval_log" (
    "id" TEXT NOT NULL,
    "rateCardId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rate_card_approval_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "labor_activities_programId_isActive_idx" ON "labor_activities"("programId", "isActive");
CREATE INDEX "labor_activities_programId_name_idx" ON "labor_activities"("programId", "name");
CREATE INDEX "equipment_resources_programId_isActive_idx" ON "equipment_resources"("programId", "isActive");
CREATE INDEX "equipment_resources_programId_name_idx" ON "equipment_resources"("programId", "name");
CREATE INDEX "materials_programId_isActive_idx" ON "materials"("programId", "isActive");
CREATE INDEX "materials_programId_name_idx" ON "materials"("programId", "name");
CREATE INDEX "rate_cards_programId_status_idx" ON "rate_cards"("programId", "status");
CREATE INDEX "rate_cards_programId_effectiveDate_idx" ON "rate_cards"("programId", "effectiveDate");
CREATE INDEX "rate_card_line_items_rateCardId_idx" ON "rate_card_line_items"("rateCardId");
CREATE INDEX "rate_card_line_items_laborActivityId_idx" ON "rate_card_line_items"("laborActivityId");
CREATE INDEX "rate_card_line_items_equipmentResourceId_idx" ON "rate_card_line_items"("equipmentResourceId");
CREATE INDEX "rate_card_line_items_materialId_idx" ON "rate_card_line_items"("materialId");
CREATE INDEX "rate_card_approval_log_rateCardId_createdAt_idx" ON "rate_card_approval_log"("rateCardId", "createdAt");

ALTER TABLE "labor_activities" ADD CONSTRAINT "labor_activities_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "equipment_resources" ADD CONSTRAINT "equipment_resources_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "materials" ADD CONSTRAINT "materials_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rate_card_line_items" ADD CONSTRAINT "rate_card_line_items_rateCardId_fkey" FOREIGN KEY ("rateCardId") REFERENCES "rate_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rate_card_line_items" ADD CONSTRAINT "rate_card_line_items_laborActivityId_fkey" FOREIGN KEY ("laborActivityId") REFERENCES "labor_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rate_card_line_items" ADD CONSTRAINT "rate_card_line_items_equipmentResourceId_fkey" FOREIGN KEY ("equipmentResourceId") REFERENCES "equipment_resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rate_card_line_items" ADD CONSTRAINT "rate_card_line_items_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rate_card_approval_log" ADD CONSTRAINT "rate_card_approval_log_rateCardId_fkey" FOREIGN KEY ("rateCardId") REFERENCES "rate_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rate_card_approval_log" ADD CONSTRAINT "rate_card_approval_log_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
