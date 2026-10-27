-- One live programme plan per farm area + budget year; archived plans don't count.
-- 20260928070000_multi_programme_plans tried to drop this as a constraint, but Prisma created it
-- as a unique index, so it survived and blocked new plans for years that only had archived plans.

DROP INDEX IF EXISTS "cropfort_programme_plans_programId_farmEstateId_planYear_key";

CREATE UNIQUE INDEX IF NOT EXISTS "cropfort_programme_plans_live_year_key"
  ON "cropfort_programme_plans" ("programId", "farmEstateId", "planYear")
  WHERE "status" <> 'archived';
