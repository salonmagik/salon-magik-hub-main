-- Add per-campaign configurable promo code expiry (in hours, default 24).
alter table public.sales_promo_campaigns
  add column if not exists code_expiry_hours integer not null default 24
    check (code_expiry_hours >= 1 and code_expiry_hours <= 8760);

-- Update the generate function to use campaign's code_expiry_hours instead of hardcoded 24h.
create or replace function public.backoffice_generate_sales_promo_code(
  p_campaign_id uuid,
  p_agent_id uuid,
  p_target_email text,
  p_target_first_name text default null
)
returns public.sales_promo_codes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_code text;
  v_result public.sales_promo_codes;
  v_is_super_admin boolean;
  v_campaign public.sales_promo_campaigns;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  v_is_super_admin := has_backoffice_role(v_actor, 'super_admin'::backoffice_role);

  if not (
    v_is_super_admin
    or backoffice_user_has_permission(v_actor, 'sales.capture_client')
  ) then
    raise exception 'ACCESS_DENIED';
  end if;

  if not v_is_super_admin then
    if not exists (
      select 1
      from public.sales_agents sa
      join public.backoffice_users bu on bu.id = sa.backoffice_user_id
      where sa.id = p_agent_id
        and bu.user_id = v_actor
    ) then
      raise exception 'AGENT_SCOPE_DENIED';
    end if;
  end if;

  select * into v_campaign
  from public.sales_promo_campaigns
  where id = p_campaign_id;

  if v_campaign.id is null then
    raise exception 'CAMPAIGN_NOT_FOUND';
  end if;

  if v_campaign.ends_at <= now() then
    raise exception 'CAMPAIGN_ENDED';
  end if;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.sales_promo_codes (
    campaign_id,
    agent_id,
    code,
    target_first_name,
    target_email,
    expires_at
  )
  values (
    p_campaign_id,
    p_agent_id,
    v_code,
    nullif(trim(coalesce(p_target_first_name, '')), ''),
    lower(trim(p_target_email)),
    least(v_campaign.ends_at, now() + (v_campaign.code_expiry_hours || ' hours')::interval)
  )
  returning * into v_result;

  return v_result;
end;
$$;
