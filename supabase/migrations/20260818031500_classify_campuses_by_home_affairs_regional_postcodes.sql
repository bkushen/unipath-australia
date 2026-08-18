-- Classifies CRICOS campuses against the current Home Affairs designated-regional postcode list.
-- Source: https://immi.homeaffairs.gov.au/visas/working-in-australia/skill-occupation-list/regional-postcodes
-- Category 1 is not designated regional. Categories 2 and 3 receive regional incentives.
-- Future Home Affairs list changes must be applied through a new dated migration rather than silently changing historical provenance.

create or replace function private.home_affairs_regional_category(state_code text, postcode_text text)
returns text
language plpgsql
immutable
set search_path = private, public, pg_temp
as $function$
declare
  s text := upper(trim(state_code));
  p integer;
begin
  if postcode_text is null or trim(postcode_text) !~ '^[0-9]{4}$' then
    return null;
  end if;
  p := trim(postcode_text)::integer;

  case s
    when 'ACT' then
      return 'CATEGORY_2_CITIES_AND_MAJOR_REGIONAL_CENTRES';
    when 'NT' then
      return 'CATEGORY_3_REGIONAL_CENTRES_AND_OTHER_REGIONAL_AREAS';
    when 'WA' then
      if (p between 6000 and 6038) or (p between 6050 and 6083) or (p between 6090 and 6182)
         or (p between 6208 and 6211) or p = 6214 or (p between 6556 and 6558) then
        return 'CATEGORY_2_CITIES_AND_MAJOR_REGIONAL_CENTRES';
      end if;
      return 'CATEGORY_3_REGIONAL_CENTRES_AND_OTHER_REGIONAL_AREAS';
    when 'SA' then
      if (p between 5000 and 5171) or (p between 5173 and 5174) or (p between 5231 and 5235)
         or (p between 5240 and 5252) or p = 5351 or (p between 5950 and 5960) then
        return 'CATEGORY_2_CITIES_AND_MAJOR_REGIONAL_CENTRES';
      end if;
      return 'CATEGORY_3_REGIONAL_CENTRES_AND_OTHER_REGIONAL_AREAS';
    when 'TAS' then
      if p = 7000 or (p between 7004 and 7026) or (p between 7030 and 7109)
         or (p between 7140 and 7151) or (p between 7170 and 7177) then
        return 'CATEGORY_2_CITIES_AND_MAJOR_REGIONAL_CENTRES';
      end if;
      return 'CATEGORY_3_REGIONAL_CENTRES_AND_OTHER_REGIONAL_AREAS';
    when 'VIC' then
      if (p between 3211 and 3232) or p = 3235 or p = 3240 or p = 3328
         or (p between 3330 and 3333) or p = 3340 or p = 3342 then
        return 'CATEGORY_2_CITIES_AND_MAJOR_REGIONAL_CENTRES';
      end if;
      if (p between 3097 and 3099) or p = 3139 or (p between 3233 and 3234)
         or (p between 3236 and 3239) or (p between 3241 and 3325) or p = 3329
         or p = 3334 or p = 3341 or (p between 3345 and 3424) or (p between 3430 and 3799)
         or (p between 3809 and 3909) or (p between 3912 and 3971) or (p between 3978 and 3996) then
        return 'CATEGORY_3_REGIONAL_CENTRES_AND_OTHER_REGIONAL_AREAS';
      end if;
      return 'CATEGORY_1_MAJOR_CITY_NOT_DESIGNATED_REGIONAL';
    when 'NSW' then
      if p = 2259 or (p between 2264 and 2308) or (p between 2500 and 2526)
         or (p between 2528 and 2535) or p = 2574 then
        return 'CATEGORY_2_CITIES_AND_MAJOR_REGIONAL_CENTRES';
      end if;
      if (p between 2250 and 2258) or (p between 2260 and 2263) or (p between 2311 and 2490)
         or p = 2527 or (p between 2536 and 2551) or (p between 2575 and 2739)
         or (p between 2753 and 2754) or (p between 2756 and 2758) or (p between 2773 and 2898) then
        return 'CATEGORY_3_REGIONAL_CENTRES_AND_OTHER_REGIONAL_AREAS';
      end if;
      return 'CATEGORY_1_MAJOR_CITY_NOT_DESIGNATED_REGIONAL';
    when 'QLD' then
      if (p between 4019 and 4022) or p = 4025 or p = 4037 or p = 4074 or (p between 4076 and 4078)
         or (p between 4207 and 4275) or (p between 4300 and 4301) or (p between 4303 and 4305)
         or (p between 4500 and 4506) or (p between 4508 and 4512) or (p between 4514 and 4519)
         or p = 4521 or (p between 4550 and 4551) or (p between 4553 and 4562)
         or (p between 4564 and 4569) or (p between 4571 and 4575) then
        return 'CATEGORY_2_CITIES_AND_MAJOR_REGIONAL_CENTRES';
      end if;
      if (p between 4124 and 4125) or p = 4133 or (p between 4183 and 4184)
         or (p between 4280 and 4287) or (p between 4306 and 4498) or p = 4507
         or p = 4552 or p = 4563 or p = 4570 or (p between 4580 and 4895) then
        return 'CATEGORY_3_REGIONAL_CENTRES_AND_OTHER_REGIONAL_AREAS';
      end if;
      return 'CATEGORY_1_MAJOR_CITY_NOT_DESIGNATED_REGIONAL';
    else
      return null;
  end case;
end;
$function$;

revoke all on function private.home_affairs_regional_category(text, text) from public, anon, authenticated;
grant execute on function private.home_affairs_regional_category(text, text) to postgres, service_role;

with classified as (
  select id, private.home_affairs_regional_category(state, postcode) as category
  from public.campuses
  where cricos_location_name is not null
)
update public.campuses c
set regional = classified.category in (
      'CATEGORY_2_CITIES_AND_MAJOR_REGIONAL_CENTRES',
      'CATEGORY_3_REGIONAL_CENTRES_AND_OTHER_REGIONAL_AREAS'
    ),
    regional_verified = classified.category is not null,
    regional_classification = classified.category,
    regional_source_url = 'https://immi.homeaffairs.gov.au/visas/working-in-australia/skill-occupation-list/regional-postcodes',
    regional_verified_at = now()
from classified
where c.id = classified.id
  and classified.category is not null;
