-- Anonymous website activity for the owner dashboard: page views and job
-- finder clicks. No names, emails or IP addresses are stored.
-- Run after 0001_bookings.sql: SQL Editor → New query → paste → Run.

create table if not exists public.events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  session_id  text not null,
  name        text not null,
  path        text not null default '',
  props       jsonb not null default '{}'
);

create index if not exists events_created_at_idx on public.events (created_at desc);
create index if not exists events_name_created_at_idx on public.events (name, created_at desc);

alter table public.events enable row level security;
