-- Public read helper for marketing master feature toggles.
-- Marketing should not depend on direct table reads that are blocked by backoffice-only RLS.

create or replace function public.get_feature_master_state(
  p_feature_key text
)
returns table (
  feature_key text,
  enabled boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    pf.feature_key,
    coalesce(ff.is_enabled, pf.default_enabled, false) as enabled
  from public.platform_features pf
  left join public.feature_flags ff
    on ff.feature_id = pf.id
   and ff.scope = 'feature'::public.feature_flag_scope
  where lower(pf.feature_key) = lower(trim(p_feature_key))
    and pf.status <> 'deprecated'
  order by ff.updated_at desc nulls last
  limit 1;
$$;

grant execute on function public.get_feature_master_state(text) to anon, authenticated;
