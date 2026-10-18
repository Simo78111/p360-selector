-- Keeps the reason an email or Fergus step failed, shown on the booking page
-- in the dashboard. Empty when everything went through.
alter table public.bookings add column if not exists notify_error text;
