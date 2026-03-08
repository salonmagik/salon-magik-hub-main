set check_function_bodies = off;

create or replace function public.permanently_delete_catalog_bin_item(
  p_tenant_id uuid,
  p_item_type text,
  p_item_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_item_type text := lower(trim(coalesce(p_item_type, '')));
  v_deleted_count bigint := 0;
begin
  if p_tenant_id is null or p_item_id is null then
    raise exception 'tenant id and item id are required';
  end if;

  if v_actor_id is null then
    raise exception 'authentication required';
  end if;

  if not exists (
    select 1
    from public.user_roles ur
    where ur.user_id = v_actor_id
      and ur.tenant_id = p_tenant_id
      and ur.is_active = true
  ) then
    raise exception 'not authorized for tenant';
  end if;

  if v_item_type = 'service' then
    delete from public.package_items where service_id = p_item_id;
    delete from public.service_locations where service_id = p_item_id;
    delete from public.services
    where id = p_item_id and tenant_id = p_tenant_id and deleted_at is not null;
    get diagnostics v_deleted_count = row_count;
    if v_deleted_count > 0 and exists (
      select 1 from public.services
      where id = p_item_id and tenant_id = p_tenant_id
    ) then
      raise exception 'service was not permanently deleted';
    end if;
  elsif v_item_type = 'product' then
    delete from public.package_items where product_id = p_item_id;
    delete from public.product_locations where product_id = p_item_id;
    delete from public.products
    where id = p_item_id and tenant_id = p_tenant_id and deleted_at is not null;
    get diagnostics v_deleted_count = row_count;
    if v_deleted_count > 0 and exists (
      select 1 from public.products
      where id = p_item_id and tenant_id = p_tenant_id
    ) then
      raise exception 'product was not permanently deleted';
    end if;
  elsif v_item_type = 'package' then
    delete from public.package_items where package_id = p_item_id;
    delete from public.package_locations where package_id = p_item_id;
    delete from public.packages
    where id = p_item_id and tenant_id = p_tenant_id and deleted_at is not null;
    get diagnostics v_deleted_count = row_count;
    if v_deleted_count > 0 and exists (
      select 1 from public.packages
      where id = p_item_id and tenant_id = p_tenant_id
    ) then
      raise exception 'package was not permanently deleted';
    end if;
  elsif v_item_type = 'voucher' then
    delete from public.voucher_locations where voucher_id = p_item_id;
    delete from public.vouchers
    where id = p_item_id and tenant_id = p_tenant_id and deleted_at is not null;
    get diagnostics v_deleted_count = row_count;
    if v_deleted_count > 0 and exists (
      select 1 from public.vouchers
      where id = p_item_id and tenant_id = p_tenant_id
    ) then
      raise exception 'voucher was not permanently deleted';
    end if;
  else
    raise exception 'unsupported item type: %', v_item_type;
  end if;

  if v_deleted_count = 0 then
    return false;
  end if;

  insert into public.audit_logs (
    tenant_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    p_tenant_id,
    v_actor_id,
    'catalog.bin_item_permanently_deleted',
    v_item_type,
    p_item_id,
    jsonb_build_object(
      'deleted_from_bin', true,
      'deleted_by_user_id', v_actor_id
    )
  );

  return true;
end;
$$;

revoke all on function public.permanently_delete_catalog_bin_item(uuid, text, uuid) from public;
grant execute on function public.permanently_delete_catalog_bin_item(uuid, text, uuid) to authenticated;
