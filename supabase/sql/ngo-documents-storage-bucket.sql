-- Supabase Storage bucket for compliance vault + workspace evidence uploads.
-- Run once on your Supabase project (Dashboard → SQL, or migration pipeline).
-- App uploads use the service role; browsers never need direct storage access.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ngo-documents',
  'ngo-documents',
  false,
  52428800,
  null
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;
