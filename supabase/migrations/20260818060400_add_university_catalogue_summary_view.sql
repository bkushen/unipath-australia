create or replace view public.university_catalogue_summary
with (security_invoker = true)
as
select
  u.id,
  u.name,
  u.slug,
  u.website,
  u.cricos_code,
  count(distinct c.id) filter (where c.cricos_code is not null) as course_count,
  count(distinct cp.id) as campus_count,
  count(distinct cp.id) filter (where cp.regional_verified and cp.regional) as regional_campus_count,
  count(distinct cp.state) as state_count,
  min(c.cricos_tuition_fee_total) filter (where c.cricos_tuition_fee_total > 100) as min_verified_total_tuition,
  max(c.cricos_tuition_fee_total) filter (where c.cricos_tuition_fee_total > 100) as max_verified_total_tuition
from public.universities u
left join public.courses c on c.university_id = u.id
left join public.campuses cp on cp.university_id = u.id
group by u.id, u.name, u.slug, u.website, u.cricos_code;

grant select on public.university_catalogue_summary to anon, authenticated;
