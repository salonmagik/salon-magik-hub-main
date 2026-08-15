-- Step 4 of the payments-rails rebuild: real customer-side fee math.
--
-- Two separate percentages, both expressed on the true service price:
--   default_platform_service_charge_percentage — the default used when a new
--     Paystack subaccount is created for a salon (tenants.platform_percentage_charge
--     already stores the per-tenant value; this is just the platform-wide default).
--   customer_facing_fee_percentage — a second, always-customer-facing fee that
--     goes entirely to Salon Magik, separate from the platform service charge,
--     regardless of who bears that one.
--
-- Both live in the existing platform_settings key-value table (same pattern as
-- kill_switch / maintenance_banner / promo_trial_bonus), edited from a new
-- backoffice "Fees & Margins" page, gated behind the same real (server-enforced)
-- 2FA step-up challenge used for feature-flag writes — not the weaker
-- client-side-only check used by the maintenance banner.

insert into public.platform_settings (key, value, description)
values (
  'payment_fee_settings',
  jsonb_build_object(
    'default_platform_service_charge_percentage', 0.5,
    'customer_facing_fee_percentage', 0.5
  ),
  'Default platform service charge %% for new salon payout subaccounts, and the separate customer-facing fee %% charged on every booking payment.'
)
on conflict (key) do nothing;

-- Lets a salon push its own platform service charge onto the customer instead
-- of absorbing it (Business Settings toggle, ships in a later step of this
-- same rebuild) — the fee-calculation formula needs this column to exist now
-- since both branches are implemented together.
alter table public.tenants
  add column if not exists platform_service_charge_borne_by_customer boolean not null default false;

create or replace function public.backoffice_update_payment_fee_settings(
  p_default_platform_service_charge_percentage numeric,
  p_customer_facing_fee_percentage numeric,
  p_reason text,
  p_challenge_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_setting_id uuid;
  v_next jsonb;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not public.has_backoffice_role(v_actor, 'super_admin'::backoffice_role) then
    raise exception 'BACKOFFICE_SUPER_ADMIN_REQUIRED';
  end if;

  if p_default_platform_service_charge_percentage is null
    or p_default_platform_service_charge_percentage < 0
    or p_default_platform_service_charge_percentage > 20 then
    raise exception 'INVALID_PERCENTAGE';
  end if;

  if p_customer_facing_fee_percentage is null
    or p_customer_facing_fee_percentage < 0
    or p_customer_facing_fee_percentage > 20 then
    raise exception 'INVALID_PERCENTAGE';
  end if;

  if coalesce(trim(p_reason), '') = '' then
    raise exception 'REASON_REQUIRED';
  end if;

  select id into v_setting_id from public.platform_settings where key = 'payment_fee_settings';
  if v_setting_id is null then
    raise exception 'SETTING_NOT_FOUND';
  end if;

  perform public.consume_backoffice_step_up_challenge(
    p_challenge_id,
    'payment_fee_settings_write',
    v_setting_id
  );

  v_next := jsonb_build_object(
    'default_platform_service_charge_percentage', p_default_platform_service_charge_percentage,
    'customer_facing_fee_percentage', p_customer_facing_fee_percentage
  );

  update public.platform_settings
  set value = v_next,
      updated_by_id = v_actor,
      updated_at = now()
  where id = v_setting_id;

  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, metadata)
  values (
    v_actor,
    'payment_fee_settings_updated',
    'platform_settings',
    v_setting_id,
    jsonb_build_object('reason', p_reason, 'value', v_next)
  );

  return v_next;
end;
$$;

grant execute on function public.backoffice_update_payment_fee_settings(numeric, numeric, text, uuid) to authenticated;
