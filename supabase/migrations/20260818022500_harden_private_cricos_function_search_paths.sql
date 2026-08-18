-- Hardens private CRICOS importer helpers against mutable search_path resolution.
-- Mirrors the production Supabase migration applied after the bulk catalogue import.

alter function private.http_json(text) set search_path = private, public, extensions, pg_temp;
alter function private.safe_slug(text) set search_path = private, public, extensions, pg_temp;
alter function private.ensure_cricos_fields(jsonb) set search_path = private, public, extensions, pg_temp;
alter function private.sync_cricos_providers(text) set search_path = private, public, extensions, pg_temp;
alter function private.sync_cricos_locations(text) set search_path = private, public, extensions, pg_temp;
alter function private.sync_cricos_courses(text) set search_path = private, public, extensions, pg_temp;
alter function private.sync_cricos_course_locations(text) set search_path = private, public, extensions, pg_temp;
