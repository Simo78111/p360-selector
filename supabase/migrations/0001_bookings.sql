-- Bookings from the website, plus a private bucket for customer photos.
-- Run once in Supabase: SQL Editor → New query → paste → Run.
--
-- Row Level Security is on with no policies, so the public anon key cannot read
-- or write anything. The website's server uses the service role key.

create table if not exists public.bookings (
  id               uuid primary key default gen_random_uuid(),
  reference        text not null unique,
  created_at       timestamptz not null default now(),

  -- new             → no payment needed (payments switched off)
  -- pending_payment → sent to Stripe, waiting for the deposit
  -- paid            → deposit received
  status           text not null default 'new'
                   check (status in ('new', 'pending_payment', 'paid', 'cancelled', 'completed')),

  -- What the job finder worked out
  answers          text not null,
  outcome_id       text not null,
  outcome_title    text not null,
  service          text not null,
  urgency          text not null,
  price_label      text not null,

  -- Customer and job details
  description      text not null,
  street           text not null,
  suburb           text not null,
  postcode         text not null,
  relationship     text not null,
  access           text not null default '',
  name             text not null,
  phone            text not null,
  email            text not null,
  days             text[] not null,
  time_of_day      text not null,
  photo_paths      text[] not null default '{}',

  -- Payment
  deposit_amount   numeric(10, 2) not null default 0,
  payment_id       text,
  paid_at          timestamptz,

  -- Follow-up
  notified_at      timestamptz,
  fergus_enquiry_id text
);

create index if not exists bookings_created_at_idx on public.bookings (created_at desc);
create index if not exists bookings_status_idx on public.bookings (status);

alter table public.bookings enable row level security;

-- Private bucket: photos are only reachable through short-lived signed links.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('booking-photos', 'booking-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;
