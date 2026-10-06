-- Add progress % to workspace milestones (14-module project workspace).
-- Safe to run multiple times.

alter table public.milestones
  add column if not exists progress integer not null default 0
    check (progress >= 0 and progress <= 100);
