-- Adds provenance for live CRICOS fee enrichment and a private snapshot sync helper.
-- CRICOS fees are whole-course values and remain separate from university-specific annual fees.

alter table public.courses
  add column if not exists cricos_fee_source_url text,
  add column if not exists cricos_fee_verified_at timestamptz;

create or replace function private.sync_cricos_fee_snapshot(snapshot_url text)
returns integer
language plpgsql
set search_path = private, public, extensions, pg_temp
as $function$
declare
  payload jsonb;
  affected integer := 0;
begin
  payload := private.http_json(snapshot_url);

  with fee_rows as (
    select
      upper(trim(item->>'cricos_code')) as cricos_code,
      nullif(regexp_replace(coalesce(item->>'tuition_fee_total',''), '[^0-9.]', '', 'g'), '')::numeric as tuition_fee_total,
      nullif(regexp_replace(coalesce(item->>'non_tuition_fee_total',''), '[^0-9.]', '', 'g'), '')::numeric as non_tuition_fee_total,
      nullif(regexp_replace(coalesce(item->>'estimated_total_cost',''), '[^0-9.]', '', 'g'), '')::numeric as estimated_total_cost,
      nullif(item->>'source_url','') as source_url,
      coalesce(nullif(item->>'verified_at','')::timestamptz, now()) as verified_at
    from jsonb_array_elements(payload) item
    where nullif(trim(item->>'cricos_code'),'') is not null
  )
  update public.courses c
  set cricos_tuition_fee_total = f.tuition_fee_total,
      cricos_non_tuition_fee_total = f.non_tuition_fee_total,
      cricos_estimated_total_cost = f.estimated_total_cost,
      cricos_fee_source_url = f.source_url,
      cricos_fee_verified_at = f.verified_at,
      updated_at = now()
  from fee_rows f
  where c.cricos_code = f.cricos_code
    and f.tuition_fee_total is not null;

  get diagnostics affected = row_count;
  return affected;
end;
$function$;

revoke all on function private.sync_cricos_fee_snapshot(text) from public, anon, authenticated;
grant execute on function private.sync_cricos_fee_snapshot(text) to postgres, service_role;
