-- Booking tiers (Priority / Standard / Flexi) and the Flexi texting consent.
-- Safe to run on a live table: new columns have defaults.
alter table bookings
  add column if not exists tier text not null default 'standard'
    check (tier in ('priority', 'standard', 'flexi')),
  add column if not exists pool_consent boolean not null default false,
  -- What the booking engine did with it: booked, outside_area, failed, skipped
  add column if not exists engine_status text,
  add column if not exists engine_job_number int,
  add column if not exists scheduled_for text;
