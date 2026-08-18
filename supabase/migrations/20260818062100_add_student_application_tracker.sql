create table if not exists public.student_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  status text not null default 'considering' check (status in ('considering','preparing','submitted','offer_received','accepted','declined','withdrawn')),
  application_reference text,
  target_intake text,
  deadline date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, course_id)
);

create index if not exists student_applications_user_idx on public.student_applications(user_id, updated_at desc);
create index if not exists student_applications_course_idx on public.student_applications(course_id);

alter table public.student_applications enable row level security;
grant select,insert,update,delete on public.student_applications to authenticated;

create policy "users read own applications" on public.student_applications for select to authenticated using ((select auth.uid()) = user_id);
create policy "users insert own applications" on public.student_applications for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users update own applications" on public.student_applications for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users delete own applications" on public.student_applications for delete to authenticated using ((select auth.uid()) = user_id);
