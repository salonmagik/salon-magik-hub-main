-- VIP is a categorization (a star), not a mutually-exclusive status. Convert
-- any existing status='vip' customers into starred + active customers so the
-- new is_starred flag is the single source of truth for VIP.
update public.customers
set is_starred = true,
    status = 'active'
where status = 'vip';
