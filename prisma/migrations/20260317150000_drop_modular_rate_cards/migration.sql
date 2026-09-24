-- Drop legacy modular period rate cards + catalogs (not in Cropfort Excel model)
DROP TABLE IF EXISTS "rate_card_approval_log" CASCADE;
DROP TABLE IF EXISTS "rate_card_line_items" CASCADE;
DROP TABLE IF EXISTS "rate_cards" CASCADE;
DROP TABLE IF EXISTS "labor_activities" CASCADE;
DROP TABLE IF EXISTS "equipment_resources" CASCADE;
DROP TABLE IF EXISTS "materials" CASCADE;

DROP TYPE IF EXISTS "ModularRateCardStatus";
DROP TYPE IF EXISTS "RateCardLineCategory";
