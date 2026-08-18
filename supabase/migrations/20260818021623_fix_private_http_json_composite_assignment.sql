-- Mirrors the production Supabase migration applied on 2026-08-18.
-- Fixes assignment of the pgsql-http composite response so CRICOS snapshot imports
-- read status/content from the returned http_response row correctly.

create or replace function private.http_json(url text)
returns jsonb
language plpgsql
as $function$
declare
  response extensions.http_response;
begin
  response := extensions.http_get(url::varchar);

  if response.status < 200 or response.status >= 300 then
    raise exception 'HTTP fetch failed for % with status %', url, response.status;
  end if;

  return response.content::jsonb;
end;
$function$;
