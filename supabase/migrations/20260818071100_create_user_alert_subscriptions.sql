create table if not exists public.alert_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete cascade,
  university_id uuid references public.universities(id) on delete cascade,
  alert_type text not null check (alert_type in ('course_fee','course_details','scholarship','university','migration')),
  enabled boolean not null default true,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (course_id is not null and university_id is null and alert_type in ('course_fee','course_details','scholarship')) or
    (course_id is null and university_id is not null and alert_type in ('university','scholarship')) or
    (course_id is null and university_id is null and alert_type = 'migration')
  )
);

create table if not exists public.alert_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid references public.alert_subscriptions(id) on delete cascade,
  event_type text not null,
  title text not null,
  body text not null,
  source_url text,
  source_verified_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists alert_subscriptions_course_unique on public.alert_subscriptions(user_id, course_id, alert_type) where course_id is not null;
create unique index if not exists alert_subscriptions_university_unique on public.alert_subscriptions(user_id, university_id, alert_type) where university_id is not null and course_id is null;
create unique index if not exists alert_subscriptions_migration_unique on public.alert_subscriptions(user_id, alert_type) where alert_type = 'migration' and course_id is null and university_id is null;
create index if not exists alert_subscriptions_user_idx on public.alert_subscriptions(user_id, created_at desc);
create index if not exists alert_notifications_user_idx on public.alert_notifications(user_id, created_at desc);
create index if not exists alert_notifications_unread_idx on public.alert_notifications(user_id, read_at) where read_at is null;

alter table public.alert_subscriptions enable row level security;
alter table public.alert_notifications enable row level security;

grant select, insert, update, delete on public.alert_subscriptions to authenticated;
grant select, update, delete on public.alert_notifications to authenticated;

create policy "users read own alert subscriptions" on public.alert_subscriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy "users insert own alert subscriptions" on public.alert_subscriptions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users update own alert subscriptions" on public.alert_subscriptions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users delete own alert subscriptions" on public.alert_subscriptions for delete to authenticated using ((select auth.uid()) = user_id);

create policy "users read own alert notifications" on public.alert_notifications for select to authenticated using ((select auth.uid()) = user_id);
create policy "users update own alert notifications" on public.alert_notifications for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users delete own alert notifications" on public.alert_notifications for delete to authenticated using ((select auth.uid()) = user_id);

comment on table public.alert_subscriptions is 'User-owned subscriptions for source-backed UniPath data changes. Notification generation is server/admin controlled.';
comment on table public.alert_notifications is 'User-visible alert events generated from verified data changes; authenticated clients cannot insert notifications directly.';
