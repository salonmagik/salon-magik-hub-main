-- Resolve function validation failures discovered while auditing backoffice flows.

create or replace function public.get_effective_trial_window(
  p_tenant_id uuid
)
returns table (
  starts_at timestamptz,
  ends_at timestamptz,
  source text
)
language plpgsql
stable
as $$
declare
  v_override record;
  v_default_days int;
  v_tenant_created_at timestamptz;
begin
  select trial_override.*
  into v_override
  from public.tenant_trial_overrides as trial_override
  where trial_override.tenant_id = p_tenant_id
    and trial_override.status = 'active'
    and now() between trial_override.starts_at and trial_override.ends_at
  order by trial_override.starts_at desc
  limit 1;

  if found then
    return query
    select v_override.starts_at, v_override.ends_at, 'tenant_override'::text;
    return;
  end if;

  select tenant.created_at
  into v_tenant_created_at
  from public.tenants as tenant
  where tenant.id = p_tenant_id;

  select coalesce((setting.value->>'days')::int, 14)
  into v_default_days
  from public.platform_settings as setting
  where setting.key = 'default_trial_days';

  if v_tenant_created_at is null then
    return;
  end if;

  return query
  select
    v_tenant_created_at,
    v_tenant_created_at + make_interval(days => greatest(0, coalesce(v_default_days, 14))),
    'global_default'::text;
end;
$$;

create or replace function public.finalize_sales_conversion_from_webhook(
  p_payment_ref text,
  p_tenant_id uuid,
  p_status text,
  p_amount numeric,
  p_currency text,
  p_paid_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_redemption public.sales_promo_redemptions;
  v_promo public.sales_promo_codes;
  v_campaign public.sales_promo_campaigns;
  v_commission numeric := 0;
  v_bonus numeric := 0;
  v_offer public.annual_lockin_offers;
begin
  if p_tenant_id is null then
    return jsonb_build_object('updated', false, 'reason', 'tenant_required');
  end if;

  select redemption.*
  into v_redemption
  from public.sales_promo_redemptions as redemption
  where redemption.tenant_id = p_tenant_id
    and redemption.status = 'provisional'
  order by redemption.created_at desc
  limit 1;

  if p_status in ('paid', 'succeeded', 'success') then
    if v_redemption.id is not null then
      update public.sales_promo_redemptions
      set
        status = 'finalized',
        provider_reference = coalesce(p_payment_ref, provider_reference),
        finalized_at = coalesce(p_paid_at, now())
      where id = v_redemption.id;

      select promo.*
      into v_promo
      from public.sales_promo_codes as promo
      where promo.id = v_redemption.promo_code_id;

      if v_promo.id is not null then
        update public.sales_promo_codes
        set status = 'redeemed', redeemed_at = coalesce(p_paid_at, now())
        where id = v_promo.id;

        select campaign.*
        into v_campaign
        from public.sales_promo_campaigns as campaign
        where campaign.id = v_promo.campaign_id;

        -- Campaigns currently configure customer discounts, not agent commission
        -- amounts. Keep the ledger valid at zero until commission rules are added.
        v_commission := 0;
        if coalesce(v_campaign.enable_trial_extension, false) then
          v_bonus := greatest(coalesce(v_campaign.trial_extension_days, 0), 0);
        end if;

        insert into public.sales_commission_ledger (
          agent_id,
          tenant_id,
          promo_code_id,
          payment_reference,
          base_commission,
          bonus_amount,
          total_amount,
          status
        )
        values (
          v_promo.agent_id,
          p_tenant_id,
          v_promo.id,
          p_payment_ref,
          v_commission,
          0,
          v_commission,
          'accrued'
        )
        on conflict do nothing;
      end if;
    end if;

    select offer.*
    into v_offer
    from public.annual_lockin_offers as offer
    where offer.tenant_id = p_tenant_id
      and offer.status = 'eligible'
      and offer.eligible_until >= coalesce(p_paid_at, now())
    limit 1;

    if v_offer.id is not null then
      update public.annual_lockin_offers
      set status = 'claimed', updated_at = now()
      where id = v_offer.id;

      insert into public.annual_lockin_events (
        annual_offer_id,
        tenant_id,
        payment_provider,
        provider_reference,
        amount,
        currency,
        status,
        occurred_at
      )
      values (
        v_offer.id,
        p_tenant_id,
        'webhook',
        p_payment_ref,
        p_amount,
        p_currency,
        'paid',
        coalesce(p_paid_at, now())
      );

      update public.tenants
      set trial_ends_at =
        greatest(coalesce(trial_ends_at, now()), coalesce(p_paid_at, now()))
        + make_interval(days => coalesce(v_offer.bonus_trial_days, 0))
      where id = p_tenant_id;
    end if;

    return jsonb_build_object('updated', true, 'status', 'finalized');
  end if;

  if v_redemption.id is not null then
    update public.sales_promo_redemptions
    set
      status = 'rejected',
      provider_reference = coalesce(p_payment_ref, provider_reference)
    where id = v_redemption.id
      and status = 'provisional';
  end if;

  if p_payment_ref is not null then
    update public.sales_commission_ledger
    set status = 'cancelled'
    where payment_reference = p_payment_ref
      and status in ('pending', 'accrued');
  end if;

  insert into public.annual_lockin_events (
    tenant_id,
    payment_provider,
    provider_reference,
    amount,
    currency,
    status,
    occurred_at
  )
  values (
    p_tenant_id,
    'webhook',
    p_payment_ref,
    p_amount,
    p_currency,
    'failed',
    coalesce(p_paid_at, now())
  );

  return jsonb_build_object('updated', true, 'status', 'rejected');
end;
$$;

grant execute on function public.finalize_sales_conversion_from_webhook(
  text,
  uuid,
  text,
  numeric,
  text,
  timestamptz
) to authenticated;

create or replace function public.create_wallet_reversal(
  p_original_entry_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_original_entry record;
  v_reversal_entry_type public.wallet_entry_type;
  v_wallet_id uuid;
  v_balance_before numeric(12, 2);
  v_balance_after numeric(12, 2);
  v_reversal_amount numeric(12, 2);
  v_ledger_entry_id uuid;
  v_existing_entry_id uuid;
begin
  select ledger.id
  into v_existing_entry_id
  from public.wallet_ledger_entries as ledger
  where ledger.idempotency_key = p_idempotency_key
  limit 1;

  if v_existing_entry_id is not null then
    return v_existing_entry_id;
  end if;

  select ledger.*
  into v_original_entry
  from public.wallet_ledger_entries as ledger
  where ledger.id = p_original_entry_id;

  if v_original_entry.id is null then
    raise exception 'Original ledger entry not found with ID %', p_original_entry_id;
  end if;

  if v_original_entry.wallet_type = 'customer' then
    v_reversal_entry_type := 'customer_purse_reversal';
  elsif v_original_entry.wallet_type = 'salon' then
    v_reversal_entry_type := 'salon_purse_reversal';
  else
    raise exception 'Unknown wallet_type %', v_original_entry.wallet_type;
  end if;

  v_reversal_amount := -1 * v_original_entry.amount;

  if v_original_entry.wallet_type = 'customer' then
    select purse.id, purse.balance
    into v_wallet_id, v_balance_before
    from public.customer_purses as purse
    where purse.id = v_original_entry.wallet_id
    for update;

    if v_wallet_id is null then
      raise exception 'Customer purse not found with ID %', v_original_entry.wallet_id;
    end if;

    v_balance_after := v_balance_before + v_reversal_amount;

    update public.customer_purses
    set balance = v_balance_after,
        updated_at = now()
    where id = v_wallet_id;
  elsif v_original_entry.wallet_type = 'salon' then
    select wallet.id, wallet.balance
    into v_wallet_id, v_balance_before
    from public.salon_wallets as wallet
    where wallet.id = v_original_entry.wallet_id
    for update;

    if v_wallet_id is null then
      raise exception 'Salon wallet not found with ID %', v_original_entry.wallet_id;
    end if;

    v_balance_after := v_balance_before + v_reversal_amount;

    update public.salon_wallets
    set balance = v_balance_after,
        updated_at = now()
    where id = v_wallet_id;
  end if;

  insert into public.wallet_ledger_entries (
    tenant_id,
    wallet_type,
    wallet_id,
    entry_type,
    currency,
    amount,
    balance_before,
    balance_after,
    reference_type,
    reference_id,
    gateway,
    gateway_reference,
    idempotency_key,
    metadata,
    created_at
  )
  values (
    v_original_entry.tenant_id,
    v_original_entry.wallet_type,
    v_original_entry.wallet_id,
    v_reversal_entry_type,
    v_original_entry.currency,
    v_reversal_amount,
    v_balance_before,
    v_balance_after,
    'reversal',
    v_original_entry.id,
    null,
    null,
    p_idempotency_key,
    jsonb_build_object(
      'reason', p_reason,
      'original_entry_id', v_original_entry.id,
      'original_amount', v_original_entry.amount,
      'original_entry_type', v_original_entry.entry_type
    ),
    now()
  )
  returning id into v_ledger_entry_id;

  return v_ledger_entry_id;
end;
$$;

comment on function public.create_wallet_reversal(uuid, text, text) is
  'Reverses a wallet transaction by creating a reversal ledger entry and adjusting wallet balance.';
