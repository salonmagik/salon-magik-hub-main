-- Multi-salon owner identity (AD-2). Relaxes the single-owner-per-identity
-- rule as a reviewed, durable exception rather than a relaxed default:
-- trg_enforce_single_owner_tenant keeps refusing a second active ownership
-- unless a matching, unrevoked grant row exists here. No backfill — every
-- existing identity owns at most one salon by construction, so the "every
-- multi-owner has an approval record" invariant is true from the first row.

-- 1. The authorisation record (AD-2, AD-4).
create table public.owner_multi_salon_grants (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  tenant_id     uuid references public.tenants(id) on delete set null,  -- null until consumed (unbound, AD-4)
  approved_by   uuid not null,                 -- backoffice user id (actor_user_id convention)
  reason        text not null check (length(btrim(reason)) >= 10),
  standing_snapshot jsonb not null,            -- what the reviewer saw (requirement 29)
  granted_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '30 days',
  consumed_at   timestamptz,
  revoked_at    timestamptz,
  revoked_by    uuid,
  revoke_reason text,
  check (revoked_at is null or consumed_at is null)   -- consumed grants are immutable history
);

-- The trigger's hot path: "is there a live grant for this identity (and maybe this tenant)?"
create index owner_multi_salon_grants_live_idx
  on public.owner_multi_salon_grants (user_id, tenant_id)
  where revoked_at is null;

create index owner_multi_salon_grants_unbound_idx
  on public.owner_multi_salon_grants (user_id)
  where tenant_id is null and consumed_at is null and revoked_at is null;

alter table public.owner_multi_salon_grants enable row level security;
-- No policies, deliberately: reachable only through security-definer
-- functions and service_role (Security Considerations).
revoke all on public.owner_multi_salon_grants from public, authenticated;

-- 2. Standing assessment (AD-5). compute_owner_multi_salon_standing is the
-- one definition of "good standing" — a plain internal helper with no gate
-- of its own, so create_owner_multi_salon_grant (service_role, no caller
-- session / auth.uid()) can reuse it without hitting the super-admin gate
-- meant for the browser-facing RPC below. assess_owner_multi_salon_standing
-- is that gated RPC, called directly by the backoffice dialog.
create or replace function public.compute_owner_multi_salon_standing(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'allGood', coalesce(bool_and(t.subscription_status = 'active'), false),
    'salons', coalesce(jsonb_agg(jsonb_build_object(
        'tenantId', t.id,
        'name', t.name,
        'plan', t.plan,
        'subscriptionStatus', t.subscription_status,
        'inGoodStanding', t.subscription_status = 'active'
      ) order by t.name), '[]'::jsonb)
  )
  from public.user_roles ur
  join public.tenants t on t.id = ur.tenant_id
  where ur.user_id = p_user_id and ur.role = 'owner' and coalesce(ur.is_active, true);
$$;
revoke all on function public.compute_owner_multi_salon_standing(uuid) from public, authenticated;
grant execute on function public.compute_owner_multi_salon_standing(uuid) to service_role;

create or replace function public.assess_owner_multi_salon_standing(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not has_backoffice_role(auth.uid(), 'super_admin'::public.backoffice_role) then
    raise exception 'BACKOFFICE_ACCESS_DENIED' using errcode = 'P0001';
  end if;
  return public.compute_owner_multi_salon_standing(p_user_id);
end;
$$;
grant execute on function public.assess_owner_multi_salon_standing(uuid) to authenticated;

-- 3. Transactional grant creation (AD-2, AD-5, AD-6). service_role only —
-- p_approved_by is passed explicitly rather than read from auth.uid(),
-- matching grant_tenant_co_owner's convention for the same reason.
create or replace function public.create_owner_multi_salon_grant(
  p_user_id uuid,
  p_tenant_id uuid,
  p_approved_by uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_standing jsonb;
  v_all_good boolean;
  v_first_bad jsonb;
  v_grant_id uuid;
  v_target_status text;
begin
  if length(v_reason) < 10 then
    raise exception 'MULTI_SALON_REASON_TOO_SHORT' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.user_roles
    where user_id = p_user_id and role = 'owner' and coalesce(is_active, true)
  ) then
    raise exception 'MULTI_SALON_NOT_AN_OWNER' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.owner_multi_salon_grants
    where user_id = p_user_id and revoked_at is null and consumed_at is null and expires_at > now()
  ) then
    raise exception 'MULTI_SALON_GRANT_ALREADY_OPEN' using errcode = 'P0001';
  end if;

  -- Re-run inside the transaction rather than trusting what the reviewer
  -- was shown (AD-5) — closes the window between review and confirmation.
  v_standing := public.compute_owner_multi_salon_standing(p_user_id);
  v_all_good := coalesce((v_standing->>'allGood')::boolean, false);

  if not v_all_good then
    select s into v_first_bad
    from jsonb_array_elements(v_standing->'salons') s
    where coalesce((s->>'inGoodStanding')::boolean, false) = false
    limit 1;
    raise exception 'MULTI_SALON_STANDING_FAILED:%', coalesce(v_first_bad->>'tenantId', '')
      using errcode = 'P0001';
  end if;

  if p_tenant_id is not null then
    select subscription_status into v_target_status
    from public.tenants where id = p_tenant_id;

    if v_target_status is null then
      raise exception 'MULTI_SALON_TARGET_NOT_FOUND' using errcode = 'P0001';
    end if;

    if v_target_status = 'trialing' then
      raise exception 'MULTI_SALON_TARGET_IN_TRIAL' using errcode = 'P0001';
    end if;

    if exists (
      select 1 from public.user_roles
      where user_id = p_user_id and tenant_id = p_tenant_id
        and role = 'owner' and coalesce(is_active, true)
    ) then
      raise exception 'MULTI_SALON_ALREADY_OWNER_HERE' using errcode = 'P0001';
    end if;
  end if;

  insert into public.owner_multi_salon_grants (
    user_id, tenant_id, approved_by, reason, standing_snapshot
  ) values (
    p_user_id, p_tenant_id, p_approved_by, v_reason, v_standing
  ) returning id into v_grant_id;

  return jsonb_build_object(
    'grantId', v_grant_id,
    'bound', p_tenant_id is not null,
    'standing', v_standing
  );
end;
$$;
revoke all on function public.create_owner_multi_salon_grant(uuid, uuid, uuid, text) from public, authenticated;
grant execute on function public.create_owner_multi_salon_grant(uuid, uuid, uuid, text) to service_role;

-- 4. Revocation (AD-2). Unconsumed grants only — a consumed grant is
-- immutable history (table check constraint, edge case 5); ending the
-- resulting ownership is owner-removal-support's job, not this one's.
create or replace function public.revoke_owner_multi_salon_grant(
  p_grant_id uuid,
  p_revoked_by uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated public.owner_multi_salon_grants;
begin
  update public.owner_multi_salon_grants
  set revoked_at = now(), revoked_by = p_revoked_by, revoke_reason = btrim(coalesce(p_reason, ''))
  where id = p_grant_id and revoked_at is null and consumed_at is null
  returning * into v_updated;

  if v_updated.id is null then
    raise exception 'MULTI_SALON_GRANT_NOT_REVOCABLE' using errcode = 'P0001';
  end if;

  return jsonb_build_object('grantId', v_updated.id, 'revokedAt', v_updated.revoked_at);
end;
$$;
revoke all on function public.revoke_owner_multi_salon_grant(uuid, uuid, text) from public, authenticated;
grant execute on function public.revoke_owner_multi_salon_grant(uuid, uuid, text) to service_role;

-- 5. The trigger becomes grant-aware (AD-3). Shape, errcode and exact
-- message text unchanged — backoffice-add-tenant-co-owner distinguishes
-- this exception from its own named ones by substring-matching
-- "already owns another salon" (prior AD-9), and changing the text would
-- silently downgrade that 409 to a generic 500.
create or replace function public.enforce_single_owner_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conflicting boolean;
  v_bound_grant_id uuid;
  v_unbound_grant_id uuid;
  v_original_ownership_permitted boolean;
begin
  if new.role = 'owner' and coalesce(new.is_active, true) then
    select exists (
      select 1 from public.user_roles ur
      where ur.user_id = new.user_id
        and ur.role = 'owner'
        and coalesce(ur.is_active, true)
        and ur.tenant_id <> new.tenant_id
        and ur.id <> new.id
    ) into v_conflicting;

    if v_conflicting then
      -- Clause one, bound case: an unrevoked grant already tied to this
      -- exact tenant (a fresh match, or a reactivation of a previously
      -- consumed grant — edge case 1). expires_at only gates the first
      -- consumption; a grant already consumed stays valid forever as
      -- history.
      select id into v_bound_grant_id
      from public.owner_multi_salon_grants
      where user_id = new.user_id
        and tenant_id = new.tenant_id
        and revoked_at is null
        and (consumed_at is not null or expires_at > now())
      for update skip locked;

      if v_bound_grant_id is not null then
        update public.owner_multi_salon_grants
        set consumed_at = coalesce(consumed_at, now())
        where id = v_bound_grant_id;
        return new;
      end if;

      -- Clause one, unbound case: consume the identity's open unbound
      -- grant, binding it to this tenant now (AD-4). skip locked means a
      -- concurrent second attempt (edge case 4) sees no available grant
      -- and falls through to clause two, which fails until the winner's
      -- transaction commits.
      select id into v_unbound_grant_id
      from public.owner_multi_salon_grants
      where user_id = new.user_id
        and tenant_id is null
        and consumed_at is null
        and revoked_at is null
        and expires_at > now()
      order by granted_at asc
      for update skip locked
      limit 1;

      if v_unbound_grant_id is not null then
        update public.owner_multi_salon_grants
        set tenant_id = new.tenant_id, consumed_at = now()
        where id = v_unbound_grant_id;
        return new;
      end if;

      -- Clause two: this row is the identity's original, ungranted
      -- ownership — permitted only if every OTHER active ownership it
      -- holds is itself covered by a consumed, unrevoked grant (so a
      -- support reactivation of the original row, or grant_tenant_co_owner's
      -- on-conflict update, doesn't get refused just because "another
      -- salon" is now owned).
      select not exists (
        select 1 from public.user_roles ur
        where ur.user_id = new.user_id
          and ur.role = 'owner'
          and coalesce(ur.is_active, true)
          and ur.tenant_id <> new.tenant_id
          and ur.id <> new.id
          and not exists (
            select 1 from public.owner_multi_salon_grants g
            where g.user_id = new.user_id
              and g.tenant_id = ur.tenant_id
              and g.revoked_at is null
              and g.consumed_at is not null
          )
      ) into v_original_ownership_permitted;

      if not v_original_ownership_permitted then
        raise exception 'This account already owns another salon. Each owner can only own one active salon at a time.'
          using errcode = 'P0001';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- Trigger definition itself is unchanged (AD-3) — recreated only so this
-- migration is self-contained if run against a fresh database.
drop trigger if exists trg_enforce_single_owner_tenant on public.user_roles;
create trigger trg_enforce_single_owner_tenant
  before insert or update on public.user_roles
  for each row
  execute function public.enforce_single_owner_tenant();

-- Supporting index for the trigger's two extra lookups above (Database
-- Changes / Performance Considerations) — added only if a prior deploy
-- doesn't already have it.
create index if not exists user_roles_user_active_owner_idx
  on public.user_roles (user_id)
  where role = 'owner' and coalesce(is_active, true);

-- 6. No trial and no promotional pricing on an additional salon (AD-6),
-- enforced server-side because the trial is written client-side in a raw
-- tenants insert (OnboardingPage.tsx) with no server check today.
create or replace function public.enforce_no_trial_for_additional_salon()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'owner' and coalesce(is_active, true)
  ) then
    new.trial_ends_at := null;
    new.subscription_status := 'past_due';
    new.billing_grace_ends_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_no_trial_for_additional_salon on public.tenants;
create trigger trg_enforce_no_trial_for_additional_salon
  before insert on public.tenants
  for each row
  execute function public.enforce_no_trial_for_additional_salon();

create or replace function public.enforce_no_trial_on_granted_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.owner_multi_salon_grants
    where tenant_id = new.id and consumed_at is not null and revoked_at is null
  ) then
    if new.subscription_status = 'trialing'
      or (new.trial_ends_at is not null and new.trial_ends_at is distinct from old.trial_ends_at)
    then
      raise exception 'MULTI_SALON_TRIAL_NOT_ALLOWED' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_no_trial_on_granted_tenant on public.tenants;
create trigger trg_enforce_no_trial_on_granted_tenant
  before update on public.tenants
  for each row
  execute function public.enforce_no_trial_on_granted_tenant();

create or replace function public.validate_sales_promo_code_for_email(
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_email text;
  v_promo public.sales_promo_codes;
  v_campaign public.sales_promo_campaigns;
begin
  if v_actor is null then
    return jsonb_build_object('valid', false, 'message', 'Authentication required');
  end if;

  -- No promotional pricing on an additional salon (AD-6, requirement 27) —
  -- refused outright before any campaign/code lookup.
  if exists (
    select 1 from public.user_roles
    where user_id = v_actor and role = 'owner' and coalesce(is_active, true)
  ) then
    return jsonb_build_object('valid', false, 'message', 'Promotional codes aren''t available on an additional salon.');
  end if;

  select lower(trim(coalesce(email, '')))
  into v_email
  from auth.users
  where id = v_actor;

  select * into v_promo
  from public.sales_promo_codes
  where upper(code) = upper(trim(coalesce(p_code, '')));

  if v_promo.id is null then
    return jsonb_build_object('valid', false, 'message', 'Invalid promo code');
  end if;

  select * into v_campaign
  from public.sales_promo_campaigns
  where id = v_promo.campaign_id;

  if v_campaign.id is null or v_campaign.is_active is not true or v_campaign.ends_at <= now() then
    return jsonb_build_object('valid', false, 'message', 'This promo campaign is no longer active');
  end if;

  if v_promo.invalidated_at is not null or v_promo.status in ('invalidated', 'cancelled', 'expired', 'redeemed', 'consumed') then
    return jsonb_build_object('valid', false, 'message', 'This promo code is no longer valid');
  end if;

  if v_promo.claimed_tenant_id is not null and v_promo.status in ('claimed', 'redeemed', 'consumed') then
    return jsonb_build_object('valid', false, 'message', 'This promo code has already been claimed');
  end if;

  if lower(trim(coalesce(v_promo.target_email, ''))) <> v_email then
    return jsonb_build_object('valid', false, 'message', 'This promo code is reserved for a different email address');
  end if;

  return jsonb_build_object(
    'valid', true,
    'promo_code_id', v_promo.id,
    'code', v_promo.code,
    'campaign_name', v_campaign.name,
    'discount_type', v_campaign.discount_type,
    'discount_value', v_campaign.discount_value,
    'billing_targets', v_campaign.billing_targets,
    'max_uses_per_tenant', v_campaign.max_uses_per_tenant,
    'expires_at', v_promo.expires_at,
    'campaign_ends_at', v_campaign.ends_at
  );
end;
$$;
grant execute on function public.validate_sales_promo_code_for_email(text) to authenticated;

-- tenant_trial_overrides gains the same refusal for grant-bound tenants
-- (AD-6 item 4) — a gifted-trial override must not be usable to route
-- around the no-trial guard above.
create or replace function public.enforce_no_trial_override_on_granted_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' and exists (
    select 1 from public.owner_multi_salon_grants
    where tenant_id = new.tenant_id and consumed_at is not null and revoked_at is null
  ) then
    raise exception 'MULTI_SALON_TRIAL_NOT_ALLOWED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_no_trial_override_on_granted_tenant on public.tenant_trial_overrides;
create trigger trg_enforce_no_trial_override_on_granted_tenant
  before insert or update on public.tenant_trial_overrides
  for each row
  execute function public.enforce_no_trial_override_on_granted_tenant();

-- 7. Consumers (AD-2, AD-7). check_owner_invite_email's
-- already_owner_other_tenant is suppressed when a grant already covers the
-- target tenant (bound to it, or an open unbound grant) — the trigger and
-- RPC both defer to the grant, so this is messaging only (Validation
-- notes), not the safety boundary.
create or replace function public.check_owner_invite_email(
  p_email text, p_tenant_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_uid uuid;
  v_is_owner_here boolean;
  v_is_owner_elsewhere boolean;
  v_is_member_here boolean;
  v_grant_covers_target boolean;
begin
  if v_email is null then
    return jsonb_build_object('available', true);
  end if;

  select u.id into v_uid from auth.users u where lower(u.email) = v_email limit 1;
  if v_uid is null then
    return jsonb_build_object('available', true);
  end if;

  if p_tenant_id is null then
    if exists (
      select 1 from public.user_roles r
      where r.user_id = v_uid
        and r.role = 'owner'
        and coalesce(r.is_active, true)
    ) then
      return jsonb_build_object('available', false, 'reason', 'already_owner');
    end if;

    return jsonb_build_object('available', false, 'reason', 'existing_account');
  end if;

  select exists (
    select 1 from public.user_roles r
    where r.user_id = v_uid
      and r.role = 'owner'
      and coalesce(r.is_active, true)
      and r.tenant_id = p_tenant_id
  ) into v_is_owner_here;

  if v_is_owner_here then
    return jsonb_build_object('available', false, 'reason', 'already_owner_this_tenant');
  end if;

  select exists (
    select 1 from public.user_roles r
    where r.user_id = v_uid
      and r.role = 'owner'
      and coalesce(r.is_active, true)
      and r.tenant_id <> p_tenant_id
  ) into v_is_owner_elsewhere;

  if v_is_owner_elsewhere then
    select exists (
      select 1 from public.owner_multi_salon_grants g
      where g.user_id = v_uid
        and g.revoked_at is null
        and (
          (g.tenant_id = p_tenant_id and g.consumed_at is null and g.expires_at > now())
          or (g.tenant_id is null and g.consumed_at is null and g.expires_at > now())
        )
    ) into v_grant_covers_target;

    if not v_grant_covers_target then
      return jsonb_build_object('available', false, 'reason', 'already_owner_other_tenant');
    end if;
    -- else: an open grant covers this target — fall through to the
    -- member/existing_account checks below (AC-6).
  end if;

  select exists (
    select 1 from public.user_roles r
    where r.user_id = v_uid
      and r.role <> 'owner'
      and coalesce(r.is_active, true)
      and r.tenant_id = p_tenant_id
  ) into v_is_member_here;

  if v_is_member_here then
    return jsonb_build_object('available', true, 'note', 'existing_member');
  end if;

  return jsonb_build_object('available', false, 'reason', 'existing_account');
end;
$$;
grant execute on function public.check_owner_invite_email(text, uuid) to authenticated, service_role;

-- get_salon_owners (AD-7): salon-admin's own roster surface, distinct from
-- backoffice's get_tenant_owners (which stays exactly as it is). Owner-
-- gated on the caller's own ownership of the tenant asked about, so a
-- person owning salons A and B can't read B's owners while acting in A,
-- and a manager can't read them at all (AC-24, AC-25).
create or replace function public.get_salon_owners(p_tenant_id uuid)
returns table (user_id uuid, full_name text, email text, granted_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not is_tenant_owner(auth.uid(), p_tenant_id) then
    raise exception 'OWNER_ACCESS_DENIED' using errcode = 'P0001';
  end if;
  return query
    select ur.user_id, p.full_name, u.email::text, ur.created_at
    from public.user_roles ur
    join auth.users u on u.id = ur.user_id
    left join public.profiles p on p.user_id = ur.user_id
    where ur.tenant_id = p_tenant_id and ur.role = 'owner' and coalesce(ur.is_active, true)
    order by ur.created_at asc;   -- display order only; confers no precedence
end $$;
grant execute on function public.get_salon_owners(uuid) to authenticated;
