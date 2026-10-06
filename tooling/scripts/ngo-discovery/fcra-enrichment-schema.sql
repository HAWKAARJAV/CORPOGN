-- Additive schema support for scripts/ngo-discovery/enrich-fcra.mjs.

alter table if exists public.discovered_ngos
  add column if not exists verified boolean not null default false;

alter table if exists public.discovered_ngos
  add column if not exists last_checked timestamptz;

alter table if exists public.discovered_ngo_sources
  add column if not exists metadata jsonb not null default '{}';

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'discovered_ngo_sources'
  ) then
    alter table public.discovered_ngo_sources
      drop constraint if exists discovered_ngo_sources_source_type_check;

    alter table public.discovered_ngo_sources
      add constraint discovered_ngo_sources_source_type_check
      check (source_type in (
        'give_discover_listing',
        'give_discover_profile',
        'wikipedia',
        'official_website',
        'fcra_online_portal',
        'robots_txt'
      ));
  end if;
end $$;
