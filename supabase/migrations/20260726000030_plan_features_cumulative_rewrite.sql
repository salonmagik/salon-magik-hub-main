-- plan_features was non-cumulative (Studio/Chain only listed 2-3 bullets each,
-- omitting everything Solo already has) and had stale numbers (Solo said
-- "Up to 2 staff members" / "30 messages/month" against real plan_limits of
-- 3 staff / 20 messages). Rewrite so each tier's list reads as a complete,
-- accurate picture of what that tier includes — Studio = Solo's list with
-- updated capacity + additions, Chain = Studio's list with its own additions.
do $$
declare
  v_solo_id uuid;
  v_studio_id uuid;
  v_chain_id uuid;
begin
  select id into v_solo_id from public.plans where slug = 'solo';
  select id into v_studio_id from public.plans where slug = 'studio';
  select id into v_chain_id from public.plans where slug = 'chain';

  delete from public.plan_features where plan_id in (v_solo_id, v_studio_id, v_chain_id);

  insert into public.plan_features (plan_id, feature_text, sort_order) values
    (v_solo_id, '1 location', 0),
    (v_solo_id, 'Up to 3 staff accounts', 1),
    (v_solo_id, '20 messages/month', 2),
    (v_solo_id, 'Up to 5 active services, products, packages & vouchers', 3),
    (v_solo_id, 'Online booking page', 4),
    (v_solo_id, 'Appointment management', 5),
    (v_solo_id, 'Client SMS reminders', 6),
    (v_solo_id, 'Payment tracking & sales reports', 7),
    (v_solo_id, 'Daily digest email', 8),
    (v_solo_id, 'Email & chat support', 9);

  insert into public.plan_features (plan_id, feature_text, sort_order) values
    (v_studio_id, '1 location', 0),
    (v_studio_id, 'Up to 6 staff accounts', 1),
    (v_studio_id, '50 messages/month', 2),
    (v_studio_id, 'Unlimited services, products, packages & vouchers', 3),
    (v_studio_id, 'Online booking page', 4),
    (v_studio_id, 'Appointment management', 5),
    (v_studio_id, 'Client SMS reminders', 6),
    (v_studio_id, 'Payment tracking & sales reports', 7),
    (v_studio_id, 'Daily digest email', 8),
    (v_studio_id, 'Email & chat support', 9),
    (v_studio_id, 'Staff role management & permission controls', 10),
    (v_studio_id, 'Staff performance reports', 11),
    (v_studio_id, 'Staff Operations add-on available (check-ins, time-off, approvals)', 12);

  insert into public.plan_features (plan_id, feature_text, sort_order) values
    (v_chain_id, '1 location included (add more as you grow)', 0),
    (v_chain_id, 'Up to 12 staff accounts', 1),
    (v_chain_id, '200 messages/month', 2),
    (v_chain_id, 'Unlimited services, products, packages & vouchers', 3),
    (v_chain_id, 'Online booking page', 4),
    (v_chain_id, 'Appointment management', 5),
    (v_chain_id, 'Client SMS reminders', 6),
    (v_chain_id, 'Payment tracking & sales reports', 7),
    (v_chain_id, 'Daily digest email', 8),
    (v_chain_id, 'Staff role management & permission controls', 9),
    (v_chain_id, 'Staff performance reports', 10),
    (v_chain_id, 'Staff Operations add-on available (check-ins, time-off, approvals)', 11),
    (v_chain_id, 'Multi-location dashboard & cross-branch cashflow', 12),
    (v_chain_id, 'Team management across branches', 13),
    (v_chain_id, 'Priority support & dedicated onboarding', 14);
end $$;
