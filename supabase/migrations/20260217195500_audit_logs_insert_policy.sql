-- Allow authenticated backoffice users to write audit logs directly from app mutations.
-- This unblocks plan/pricing create flows that insert audit rows from the client.

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_logs'
      and policyname = 'BackOffice users can create audit logs'
  ) then
    create policy "BackOffice users can create audit logs"
      on public.audit_logs
      for insert
      to authenticated
      with check (
        is_backoffice_user(auth.uid())
        and actor_user_id = auth.uid()
      );
  end if;
end $$;
