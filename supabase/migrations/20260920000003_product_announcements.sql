-- Product announcements are global, targeted notices shown in the application shell.
-- Drafts and scheduling metadata remain private to Backoffice; authenticated users
-- can only read announcements that are published/scheduled and currently in date.

create table if not exists public.product_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null,
  body text,
  icon text not null default 'sparkles',
  cta_label text,
  cta_url text,
  platforms text[] not null default array['salon_admin', 'client_portal']::text[],
  status text not null default 'draft' check (status in ('draft', 'scheduled', 'published', 'archived')),
  publish_at timestamptz,
  expires_at timestamptz,
  created_by_id uuid references auth.users(id) on delete set null,
  updated_by_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_announcements_platforms_check check (
    platforms <@ array['salon_admin', 'client_portal', 'backoffice']::text[]
    and cardinality(platforms) > 0
  ),
  constraint product_announcements_dates_check check (
    expires_at is null or publish_at is null or expires_at > publish_at
  ),
  constraint product_announcements_cta_check check (
    cta_url is null
    or (cta_url like '/%' and cta_url not like '//%')
    or cta_url ~* '^https?://'
  )
);

create index if not exists idx_product_announcements_active
  on public.product_announcements (status, publish_at, expires_at);

create table if not exists public.product_announcement_events (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.product_announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('viewed', 'clicked', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (announcement_id, user_id, event_type)
);

create index if not exists idx_product_announcement_events_user
  on public.product_announcement_events (user_id, created_at desc);

drop trigger if exists update_product_announcements_updated_at on public.product_announcements;
create trigger update_product_announcements_updated_at
  before update on public.product_announcements
  for each row execute function public.update_updated_at_column();

alter table public.product_announcements enable row level security;
alter table public.product_announcement_events enable row level security;

drop policy if exists "Authenticated users can read active product announcements" on public.product_announcements;
create policy "Authenticated users can read active product announcements"
  on public.product_announcements
  for select to authenticated
  using (
    status in ('published', 'scheduled')
    and coalesce(publish_at, '-infinity'::timestamptz) <= now()
    and (expires_at is null or expires_at > now())
  );

drop policy if exists "Backoffice users can read all product announcements" on public.product_announcements;
create policy "Backoffice users can read all product announcements"
  on public.product_announcements
  for select to authenticated
  using (
    exists (
      select 1 from public.backoffice_users bu
      where bu.user_id = auth.uid()
    )
  );

drop policy if exists "Super admins can create product announcements" on public.product_announcements;
create policy "Super admins can create product announcements"
  on public.product_announcements
  for insert to authenticated
  with check (public.has_backoffice_role(auth.uid(), 'super_admin'::public.backoffice_role));

drop policy if exists "Super admins can update product announcements" on public.product_announcements;
create policy "Super admins can update product announcements"
  on public.product_announcements
  for update to authenticated
  using (public.has_backoffice_role(auth.uid(), 'super_admin'::public.backoffice_role))
  with check (public.has_backoffice_role(auth.uid(), 'super_admin'::public.backoffice_role));

drop policy if exists "Super admins can delete product announcements" on public.product_announcements;
create policy "Super admins can delete product announcements"
  on public.product_announcements
  for delete to authenticated
  using (public.has_backoffice_role(auth.uid(), 'super_admin'::public.backoffice_role));

drop policy if exists "Users can read own product announcement events" on public.product_announcement_events;
create policy "Users can read own product announcement events"
  on public.product_announcement_events
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can record own product announcement events" on public.product_announcement_events;
create policy "Users can record own product announcement events"
  on public.product_announcement_events
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Super admins can read product announcement analytics" on public.product_announcement_events;
create policy "Super admins can read product announcement analytics"
  on public.product_announcement_events
  for select to authenticated
  using (public.has_backoffice_role(auth.uid(), 'super_admin'::public.backoffice_role));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'product_announcements'
  ) then
    alter publication supabase_realtime add table public.product_announcements;
  end if;
end;
$$;
