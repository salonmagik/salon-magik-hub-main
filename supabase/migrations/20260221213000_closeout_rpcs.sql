create or replace function public.backoffice_create_role_template(
  p_name text,
  p_description text,
  p_permission_keys text[] default '{}'::text[],
  p_page_keys text[] default '{}'::text[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_template_id uuid;
  v_permission text;
  v_page text;
begin
  if v_actor is null or not has_backoffice_role(v_actor, 'super_admin'::backoffice_role) then
    raise exception 'SUPER_ADMIN_REQUIRED';
  end if;

  insert into public.backoffice_role_templates (name, description, is_system, is_active, created_by)
  values (trim(p_name), nullif(trim(coalesce(p_description, '')), ''), false, true, v_actor)
  returning id into v_template_id;

  foreach v_permission in array coalesce(p_permission_keys, '{}'::text[])
  loop
    insert into public.backoffice_role_template_permissions (template_id, permission_key)
    values (v_template_id, v_permission)
    on conflict do nothing;
  end loop;

  foreach v_page in array coalesce(p_page_keys, '{}'::text[])
  loop
    insert into public.backoffice_role_template_pages (template_id, page_key)
    values (v_template_id, v_page)
    on conflict do nothing;
  end loop;

  return v_template_id;
end;
$$;

grant execute on function public.backoffice_create_role_template(text, text, text[], text[]) to authenticated;

create or replace function public.backoffice_update_role_template(
  p_template_id uuid,
  p_name text,
  p_description text,
  p_permission_keys text[] default '{}'::text[],
  p_page_keys text[] default '{}'::text[],
  p_is_active boolean default true
)
returns public.backoffice_role_templates
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_template public.backoffice_role_templates;
  v_permission text;
  v_page text;
begin
  if v_actor is null or not has_backoffice_role(v_actor, 'super_admin'::backoffice_role) then
    raise exception 'SUPER_ADMIN_REQUIRED';
  end if;

  update public.backoffice_role_templates
  set
    name = trim(p_name),
    description = nullif(trim(coalesce(p_description, '')), ''),
    is_active = p_is_active,
    updated_at = now()
  where id = p_template_id
    and is_system = false
  returning * into v_template;

  if v_template.id is null then
    raise exception 'ROLE_TEMPLATE_NOT_FOUND';
  end if;

  delete from public.backoffice_role_template_permissions where template_id = p_template_id;
  delete from public.backoffice_role_template_pages where template_id = p_template_id;

  foreach v_permission in array coalesce(p_permission_keys, '{}'::text[])
  loop
    insert into public.backoffice_role_template_permissions (template_id, permission_key)
    values (p_template_id, v_permission)
    on conflict do nothing;
  end loop;

  foreach v_page in array coalesce(p_page_keys, '{}'::text[])
  loop
    insert into public.backoffice_role_template_pages (template_id, page_key)
    values (p_template_id, v_page)
    on conflict do nothing;
  end loop;

  select * into v_template from public.backoffice_role_templates where id = p_template_id;
  return v_template;
end;
$$;

grant execute on function public.backoffice_update_role_template(uuid, text, text, text[], text[], boolean) to authenticated;

create or replace function public.backoffice_assign_user_template(
  p_backoffice_user_id uuid,
  p_role_template_id uuid
)
returns public.backoffice_user_role_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_result public.backoffice_user_role_assignments;
begin
  if v_actor is null or not has_backoffice_role(v_actor, 'super_admin'::backoffice_role) then
    raise exception 'SUPER_ADMIN_REQUIRED';
  end if;

  insert into public.backoffice_user_role_assignments (
    backoffice_user_id,
    role_template_id,
    assigned_by
  )
  values (
    p_backoffice_user_id,
    p_role_template_id,
    v_actor
  )
  on conflict (backoffice_user_id)
  do update set
    role_template_id = excluded.role_template_id,
    assigned_by = v_actor,
    updated_at = now()
  returning * into v_result;

  return v_result;
end;
$$;

grant execute on function public.backoffice_assign_user_template(uuid, uuid) to authenticated;

create or replace function public.evaluate_tenant_annual_lockin_offer(
  p_tenant_id uuid,
  p_now_ts timestamptz default now()
)
returns table (
  eligible boolean,
  annual_offer_id uuid,
  eligible_until timestamptz,
  bonus_trial_days integer,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_offer public.annual_lockin_offers;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not (belongs_to_tenant(v_actor, p_tenant_id) or is_backoffice_user(v_actor)) then
    raise exception 'TENANT_ACCESS_DENIED';
  end if;

  select *
  into v_offer
  from public.annual_lockin_offers
  where tenant_id = p_tenant_id
  limit 1;

  if v_offer.id is null then
    return query select false, null::uuid, null::timestamptz, 0, 'offer_missing'::text;
    return;
  end if;

  if v_offer.status <> 'eligible' then
    return query select false, v_offer.id, v_offer.eligible_until, v_offer.bonus_trial_days, 'offer_not_active'::text;
    return;
  end if;

  if p_now_ts > v_offer.eligible_until then
    update public.annual_lockin_offers
    set status = 'expired', updated_at = now()
    where id = v_offer.id and status = 'eligible';

    return query select false, v_offer.id, v_offer.eligible_until, v_offer.bonus_trial_days, 'offer_expired'::text;
    return;
  end if;

  return query select true, v_offer.id, v_offer.eligible_until, v_offer.bonus_trial_days, 'eligible'::text;
end;
$$;

grant execute on function public.evaluate_tenant_annual_lockin_offer(uuid, timestamptz) to authenticated;

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

  select *
  into v_redemption
  from public.sales_promo_redemptions
  where tenant_id = p_tenant_id
    and status = 'provisional'
  order by created_at desc
  limit 1;

  if p_status in ('paid', 'succeeded', 'success') then
    if v_redemption.id is not null then
      update public.sales_promo_redemptions
      set
        status = 'finalized',
        provider_reference = coalesce(p_payment_ref, provider_reference),
        finalized_at = coalesce(p_paid_at, now())
      where id = v_redemption.id;

      select * into v_promo from public.sales_promo_codes where id = v_redemption.promo_code_id;
      if v_promo.id is not null then
        update public.sales_promo_codes
        set status = 'redeemed', redeemed_at = coalesce(p_paid_at, now())
        where id = v_promo.id;

        select * into v_campaign from public.sales_promo_campaigns where id = v_promo.campaign_id;
        v_commission := coalesce(v_campaign.commission_amount, 0);
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

    select * into v_offer
    from public.annual_lockin_offers
    where tenant_id = p_tenant_id
      and status = 'eligible'
      and eligible_until >= coalesce(p_paid_at, now())
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
      set trial_ends_at = greatest(coalesce(trial_ends_at, now()), coalesce(p_paid_at, now())) + make_interval(days => coalesce(v_offer.bonus_trial_days, 0))
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

grant execute on function public.finalize_sales_conversion_from_webhook(text, uuid, text, numeric, text, timestamptz) to authenticated;
