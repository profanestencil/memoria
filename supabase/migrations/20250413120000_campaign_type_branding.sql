-- Campaign classification + optional branding image URL (watermark applied client-side at mint).
alter table public.campaigns
  add column if not exists campaign_type text not null default 'other';

alter table public.campaigns
  add column if not exists branding_asset_url text;

alter table public.campaigns drop constraint if exists campaigns_campaign_type_check;

alter table public.campaigns add constraint campaigns_campaign_type_check check (
  campaign_type in (
    'festival',
    'conference',
    'show',
    'exhibition',
    'party',
    'scavenger_hunt',
    'challenge',
    'holiday_tour',
    'other'
  )
);
