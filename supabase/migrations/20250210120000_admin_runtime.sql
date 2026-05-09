-- Memoria admin + runtime tables (control plane for campaigns, POIs, AR scenes, claims).
-- Use the Supabase service role from Vercel API only. RLS enabled with no permissive policies
-- so anon/authenticated clients cannot read/write these tables; service role bypasses RLS.
-- gen_random_uuid() is built into PostgreSQL 13+ (no uuid-ossp extension).

create table if not exists public.admin_users (
  wallet_address text primary key check (wallet_address ~ '^0x[a-fA-F0-9]{40}$'),
  role text not null default 'admin',
  created_at timestamptz not null default now()
);

create table if not exists public.admin_nonces (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null check (wallet_address ~ '^0x[a-fA-F0-9]{40}$'),
  nonce text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_nonces_wallet on public.admin_nonces (wallet_address);
create index if not exists idx_admin_nonces_expires on public.admin_nonces (expires_at);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  tag text not null default '',
  pin_color text not null default '#C9A227',
  priority int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_geofences (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  shape_type text not null default 'circle' check (shape_type in ('circle')),
  center_lat double precision not null,
  center_lng double precision not null,
  radius_m double precision not null check (radius_m > 0)
);

create index if not exists idx_campaign_geofences_campaign on public.campaign_geofences (campaign_id);

create table if not exists public.campaign_overlays (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  overlay_type text not null default 'image' check (overlay_type in ('image')),
  asset_url text not null,
  position text not null default 'top_left' check (
    position in ('top_left', 'top_right', 'bottom_left', 'bottom_right')
  ),
  opacity double precision not null default 0.85 check (opacity >= 0 and opacity <= 1),
  scale double precision not null default 0.2 check (scale > 0 and scale <= 1),
  created_at timestamptz not null default now()
);

create index if not exists idx_campaign_overlays_campaign on public.campaign_overlays (campaign_id);

create table if not exists public.map_pois (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  lat double precision not null,
  lng double precision not null,
  icon_url text,
  tap_action text not null check (
    tap_action in ('open_ar_scene', 'open_url', 'open_memory_list')
  ),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_map_pois_window on public.map_pois (starts_at, ends_at);

create table if not exists public.ar_scenes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  lat double precision not null,
  lng double precision not null,
  geo_radius_m double precision not null default 50 check (geo_radius_m > 0),
  scene_type text not null check (
    scene_type in ('threejs_config', 'iframe_url', 'external_manifest')
  ),
  scene_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ar_scenes_window on public.ar_scenes (starts_at, ends_at);

create table if not exists public.claim_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  enforcement text not null check (enforcement in ('offchain', 'onchain')),
  eligibility jsonb not null default '{}'::jsonb,
  reward_type text not null check (reward_type in ('erc20', 'nft')),
  reward_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_claim_campaigns_window on public.claim_campaigns (starts_at, ends_at);

create table if not exists public.claim_redemptions (
  id uuid primary key default gen_random_uuid(),
  claim_campaign_id uuid not null references public.claim_campaigns (id) on delete cascade,
  wallet_address text not null check (wallet_address ~ '^0x[a-fA-F0-9]{40}$'),
  redeemed_at timestamptz not null default now(),
  tx_hash text,
  unique (claim_campaign_id, wallet_address)
);

create index if not exists idx_claim_redemptions_campaign on public.claim_redemptions (claim_campaign_id);

alter table public.admin_users enable row level security;
alter table public.admin_nonces enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_geofences enable row level security;
alter table public.campaign_overlays enable row level security;
alter table public.map_pois enable row level security;
alter table public.ar_scenes enable row level security;
alter table public.claim_campaigns enable row level security;
alter table public.claim_redemptions enable row level security;
