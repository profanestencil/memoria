-- Additional admin wallet (/admin API Bearer flow)
insert into public.admin_users (wallet_address, role)
values (lower('0xa8122340f53c8043488335705191AF5C5bd069C0'), 'admin')
on conflict (wallet_address) do nothing;
