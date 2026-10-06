-- Additive fix: schema.sql documented a `vision` column in section 1 but it
-- was never actually added. Give Discover profile pages carry real vision
-- text distinct from mission, so we need somewhere to put it.
alter table public.ngos
  add column if not exists vision text;
