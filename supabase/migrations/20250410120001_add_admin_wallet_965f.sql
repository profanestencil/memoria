-- Additional admin wallet (Memoria /admin API Bearer flow)
insert into public.admin_users (wallet_address, role)
values (lower('0x965f2225bc4657ad9E1A892e6299Db312f2d5588'), 'admin')
on conflict (wallet_address) do nothing;
