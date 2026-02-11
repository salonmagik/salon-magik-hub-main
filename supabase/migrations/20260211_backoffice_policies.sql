-- Allow backoffice users to update their own row (for temp password / 2FA flags)
alter table if exists public.backoffice_users enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies 
    where tablename = 'backoffice_users' and policyname = 'backoffice_users self update'
  ) then
    create policy "backoffice_users self update"
      on public.backoffice_users
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end$$;
