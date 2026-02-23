-- Private storage bucket for sales-agent KYC documents + backoffice policies.

insert into storage.buckets (id, name, public)
values ('sales-agent-kyc-docs', 'sales-agent-kyc-docs', false)
on conflict (id) do nothing;

drop policy if exists "Backoffice can read sales agent kyc docs" on storage.objects;
create policy "Backoffice can read sales agent kyc docs"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'sales-agent-kyc-docs'
  and is_backoffice_user(auth.uid())
);

drop policy if exists "Super admins can manage sales agent kyc docs" on storage.objects;
create policy "Super admins can manage sales agent kyc docs"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'sales-agent-kyc-docs'
  and has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role)
)
with check (
  bucket_id = 'sales-agent-kyc-docs'
  and has_backoffice_role(auth.uid(), 'super_admin'::backoffice_role)
);
