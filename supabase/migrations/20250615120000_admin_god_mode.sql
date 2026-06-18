alter table public.admin_users
  add column if not exists god_mode boolean not null default false;
