-- Optional map location for claim campaigns (pins on world map when set).
alter table public.claim_campaigns
  add column if not exists lat double precision,
  add column if not exists lng double precision;
