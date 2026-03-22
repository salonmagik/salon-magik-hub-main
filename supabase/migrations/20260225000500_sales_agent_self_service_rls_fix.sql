-- Allow capture-client users to bootstrap/manage only their own sales agent profile,
-- and align promo RPC auth with MVP permission keys.

-- Replace broad sales-agent read policy with scoped policies.
drop policy if exists "Sales managers can read agents" on public.sales_agents;

create policy "Sales managers can read agents"
  on public.sales_agents
  for select
  to authenticated
  using (
    has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role)
    or backoffice_user_has_permission(auth.uid(), 'sales.manage_agents_kyc')
  );

drop policy if exists "Sales capture can read own agent" on public.sales_agents;
create policy "Sales capture can read own agent"
  on public.sales_agents
  for select
  to authenticated
  using (
    backoffice_user_has_permission(auth.uid(), 'sales.capture_client')
    and backoffice_user_id = (
      select id from public.backoffice_users where user_id = auth.uid()
    )
  );

-- Keep manager/super full management.
drop policy if exists "Sales managers can manage agents" on public.sales_agents;

create policy "Sales managers can manage agents"
  on public.sales_agents
  for all
  to authenticated
  using (
    has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role)
    or backoffice_user_has_permission(auth.uid(), 'sales.manage_agents_kyc')
  )
  with check (
    has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role)
    or backoffice_user_has_permission(auth.uid(), 'sales.manage_agents_kyc')
  );

-- Allow capture-client users to create/update only their own row (for profile bootstrap).
drop policy if exists "Sales capture can insert own agent" on public.sales_agents;
create policy "Sales capture can insert own agent"
  on public.sales_agents
  for insert
  to authenticated
  with check (
    backoffice_user_has_permission(auth.uid(), 'sales.capture_client')
    and backoffice_user_id = (
      select id from public.backoffice_users where user_id = auth.uid()
    )
  );

drop policy if exists "Sales capture can update own agent" on public.sales_agents;
create policy "Sales capture can update own agent"
  on public.sales_agents
  for update
  to authenticated
  using (
    backoffice_user_has_permission(auth.uid(), 'sales.capture_client')
    and backoffice_user_id = (
      select id from public.backoffice_users where user_id = auth.uid()
    )
  )
  with check (
    backoffice_user_has_permission(auth.uid(), 'sales.capture_client')
    and backoffice_user_id = (
      select id from public.backoffice_users where user_id = auth.uid()
    )
  );

-- Tighten promo-code visibility/management for capture-client users to own rows only.
drop policy if exists "Sales capture can read promo codes" on public.sales_promo_codes;
create policy "Sales capture can read promo codes"
  on public.sales_promo_codes
  for select
  to authenticated
  using (
    has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role)
    or (
      backoffice_user_has_permission(auth.uid(), 'sales.capture_client')
      and agent_id in (
        select sa.id
        from public.sales_agents sa
        join public.backoffice_users bu on bu.id = sa.backoffice_user_id
        where bu.user_id = auth.uid()
      )
    )
  );

drop policy if exists "Sales capture can manage promo codes" on public.sales_promo_codes;
create policy "Sales capture can manage promo codes"
  on public.sales_promo_codes
  for all
  to authenticated
  using (
    has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role)
    or (
      backoffice_user_has_permission(auth.uid(), 'sales.capture_client')
      and agent_id in (
        select sa.id
        from public.sales_agents sa
        join public.backoffice_users bu on bu.id = sa.backoffice_user_id
        where bu.user_id = auth.uid()
      )
    )
  )
  with check (
    has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role)
    or (
      backoffice_user_has_permission(auth.uid(), 'sales.capture_client')
      and agent_id in (
        select sa.id
        from public.sales_agents sa
        join public.backoffice_users bu on bu.id = sa.backoffice_user_id
        where bu.user_id = auth.uid()
      )
    )
  );

-- Align RPC auth with canonical key and enforce non-super self-agent constraint.
create or replace function public.backoffice_generate_sales_promo_code(
  p_campaign_id uuid,
  p_agent_id uuid,
  p_target_email text
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

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.sales_promo_codes (
    campaign_id,
    agent_id,
    code,
    target_email,
    expires_at
  )
  values (
    p_campaign_id,
    p_agent_id,
    v_code,
    lower(trim(p_target_email)),
    now() + interval '24 hours'
  )
  returning * into v_result;

  return v_result;
end;
$$;

-- Keep backward compatibility in case old templates still carry this key.
insert into public.backoffice_permission_keys (key, label, description)
values (
  'sales.capture_client',
  'Capture clients',
  'Generate promo codes for assigned clients'
)
on conflict (key) do nothing;
