from __future__ import annotations

import csv
import io
import json
import pathlib
import re
import urllib.request
from datetime import datetime, timezone

DATASET_PAGE = "https://data.gov.au/data/dataset/e5ae7059-bfa8-4fa4-a5c0-c13cf3520193"
STUDY_AUSTRALIA_UNIVERSITIES = "https://www.studyaustralia.gov.au/en/plan-your-studies/list-of-australian-universities.html"

RESOURCES = {
    "institutions": "https://data.gov.au/data/dataset/e5ae7059-bfa8-4fa4-a5c0-c13cf3520193/resource/7f6941f3-5327-4db7-b556-5f16d77f63c1/download/cricos-institutions.csv",
    "courses": "https://data.gov.au/data/dataset/e5ae7059-bfa8-4fa4-a5c0-c13cf3520193/resource/48cacf69-2082-415e-9595-f17d0c3a4af0/download/cricos-courses.csv",
    "locations": "https://data.gov.au/data/dataset/e5ae7059-bfa8-4fa4-a5c0-c13cf3520193/resource/45d29535-1360-4486-8242-3850e61b5524/download/cricos-locations.csv",
    "course_locations": "https://data.gov.au/data/dataset/e5ae7059-bfa8-4fa4-a5c0-c13cf3520193/resource/4cd2de02-8ba3-4eb2-bac2-fe272cae3f5f/download/cricos-course-locations.csv",
}

# Study Australia's current 42-university list mapped to current CRICOS registrations.
# Victoria University has two active university registrations covering VIC and NSW/QLD delivery.
PROVIDER_MAP = {
    "04249J": "adelaide-university",
    "00004G": "australian-catholic-university",
    "02650E": "australian-university-of-theology",
    "00120C": "australian-national-university",
    "02731D": "avondale-university",
    "00017B": "bond-university",
    "00300K": "charles-darwin-university",
    "00005F": "charles-sturt-university",
    "00219C": "cq-university",
    "00301J": "curtin-university",
    "00113B": "deakin-university",
    "00279B": "edith-cowan-university",
    "00103D": "federation-university-australia",
    "00114A": "flinders-university",
    "00233E": "griffith-university",
    "00117J": "james-cook-university",
    "00115M": "la-trobe-university",
    "00002J": "macquarie-university",
    "00008C": "monash-university",
    "00125J": "murdoch-university",
    "00213J": "queensland-university-of-technology",
    "00122A": "rmit-university",
    "01241G": "southern-cross-university",
    "00111D": "swinburne-university-of-technology",
    "03389E": "torrens-university-australia",
    "00212K": "university-of-canberra",
    "01037A": "university-of-divinity",
    "00116K": "university-of-melbourne",
    "00003G": "university-of-new-england",
    "00098G": "university-of-new-south-wales",
    "00109J": "university-of-newcastle",
    "01032F": "university-of-notre-dame-australia",
    "00025B": "university-of-queensland",
    "00244B": "university-of-southern-queensland",
    "00026A": "university-of-sydney",
    "00586B": "university-of-tasmania",
    "00099F": "university-of-technology-sydney",
    "01595D": "university-of-the-sunshine-coast",
    "00126G": "university-of-western-australia",
    "00102E": "university-of-wollongong",
    "00124K": "victoria-university",
    "02475D": "victoria-university",
    "00917K": "western-sydney-university",
}


def fetch_csv(url: str) -> tuple[list[dict[str, str]], int, str]:
    request = urllib.request.Request(url, headers={"User-Agent": "UniPath-Australia-Data-Sync/0.1"})
    with urllib.request.urlopen(request, timeout=120) as response:
        raw = response.read()

    for encoding in ("utf-8-sig", "utf-8", "cp1252"):
        try:
            return list(csv.DictReader(io.StringIO(raw.decode(encoding)))), len(raw), encoding
        except UnicodeDecodeError:
            continue

    return list(csv.DictReader(io.StringIO(raw.decode("utf-8", errors="replace")))), len(raw), "utf-8-replace"


def number(value: str | None) -> float | None:
    text = (value or "").replace(",", "").strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def yes(value: str | None) -> bool:
    return (value or "").strip().lower() == "yes"


def field_file_key(broad: str) -> str:
    broad = broad or "00 - Unclassified"
    number_prefix = broad.split(" - ", 1)[0].strip()
    field_name = broad.split(" - ", 1)[-1].strip().lower()
    return f"{number_prefix}-{re.sub(r'[^a-z0-9]+', '-', field_name).strip('-')}"


def write_json(path: pathlib.Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main() -> None:
    datasets: dict[str, list[dict[str, str]]] = {}
    source_meta: dict[str, object] = {}

    for name, url in RESOURCES.items():
        rows, size, encoding = fetch_csv(url)
        datasets[name] = rows
        source_meta[name] = {
            "url": url,
            "download_bytes": size,
            "encoding": encoding,
            "source_rows": len(rows),
        }

    output = pathlib.Path("data/cricos")
    output.mkdir(parents=True, exist_ok=True)

    providers = []
    for row in datasets["institutions"]:
        code = row["CRICOS Provider Code"]
        if code not in PROVIDER_MAP:
            continue
        providers.append(
            {
                "university_slug": PROVIDER_MAP[code],
                "provider_code": code,
                "trading_name": row["Trading Name"] or None,
                "institution_name": row["Institution Name"] or None,
                "institution_type": row["Institution Type"] or None,
                "number_of_students": number(row.get("Number of Students") or row.get("Total Capacity") or row.get("Institution Capacity")),
                "website": row["Website"] or None,
                "postal_address_line_1": row["Postal Address Line 1"] or None,
                "postal_address_line_2": row["Postal Address Line 2"] or None,
                "postal_address_line_3": row["Postal Address Line 3"] or None,
                "postal_address_line_4": row["Postal Address Line 4"] or None,
                "postal_city": (row.get("Postal City") or row.get("Postal Address City")) or None,
                "postal_state": (row.get("Postal State") or row.get("Postal Address State")) or None,
                "postal_postcode": (row.get("Postal Postcode") or row.get("Postal Address Postcode")) or None,
            }
        )

    field_groups: dict[str, list[dict[str, object]]] = {}
    active_course_codes: set[tuple[str, str]] = set()

    for row in datasets["courses"]:
        provider_code = row["CRICOS Provider Code"]
        if provider_code not in PROVIDER_MAP or (row["Expired"] or "").strip().lower() != "no":
            continue

        key = field_file_key(row["Field of Education 1 Broad Field"])
        cricos_code = row["CRICOS Course Code"]
        active_course_codes.add((provider_code, cricos_code))
        field_groups.setdefault(key, []).append(
            {
                "university_slug": PROVIDER_MAP[provider_code],
                "provider_code": provider_code,
                "institution": row["Institution Name"] or None,
                "course_name": row["Course Name"],
                "cricos_code": cricos_code,
                "vet_national_code": row["VET National Code"] or None,
                "dual_qualification": yes(row["Dual Qualification"]),
                "field_1_broad": row["Field of Education 1 Broad Field"] or None,
                "field_1_narrow": row["Field of Education 1 Narrow Field"] or None,
                "field_1_detailed": row["Field of Education 1 Detailed Field"] or None,
                "field_2_broad": row["Field of Education 2 Broad Field"] or None,
                "field_2_narrow": row["Field of Education 2 Narrow Field"] or None,
                "field_2_detailed": row["Field of Education 2 Detailed Field"] or None,
                "course_level": row["Course Level"] or None,
                "foundation_studies": yes(row["Foundation Studies"]),
                "work_component": yes(row["Work Component"]),
                "work_hours_per_week": number(row["Work Component Hours/Week"]),
                "work_weeks": number(row["Work Component Weeks"]),
                "work_total_hours": number(row["Work Component Total Hours"]),
                "language": row["Course Language"] or None,
                "duration_weeks": number(row["Duration (Weeks)"]),
                "tuition_fee_total": number(row["Tuition Fee"]),
                "non_tuition_fee_total": number(row["Non Tuition Fee"]),
                "estimated_total_cost": number(row["Estimated Total Course Cost"]),
                "expired": False,
            }
        )

    locations = []
    for row in datasets["locations"]:
        provider_code = row["CRICOS Provider Code"]
        if provider_code not in PROVIDER_MAP:
            continue
        locations.append(
            {
                "university_slug": PROVIDER_MAP[provider_code],
                "provider_code": provider_code,
                "institution": row["Institution Name"] or None,
                "location_name": row["Location Name"],
                "location_type": row["Location Type"] or None,
                "address_1": row["Address Line 1"] or None,
                "address_2": row["Address Line 2"] or None,
                "address_3": row["Address Line 3"] or None,
                "address_4": row["Address Line 4"] or None,
                "city": row["City"] or None,
                "state": row["State"] or None,
                "postcode": row["Postcode"] or None,
            }
        )

    course_locations = []
    for row in datasets["course_locations"]:
        provider_code = row["CRICOS Provider Code"]
        cricos_code = row["CRICOS Course Code"]
        if (provider_code, cricos_code) not in active_course_codes:
            continue
        course_locations.append(
            {
                "provider_code": provider_code,
                "cricos_code": cricos_code,
                "location_name": row["Location Name"],
            }
        )

    write_json(output / "providers.json", providers)
    write_json(output / "locations.json", locations)
    write_json(output / "course-locations.json", course_locations)

    course_manifest = []
    for key, rows in sorted(field_groups.items()):
        filename = f"courses-{key}.json"
        write_json(output / filename, rows)
        course_manifest.append({"file": filename, "records": len(rows), "bytes": (output / filename).stat().st_size})

    manifest = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dataset": "Commonwealth Register of Institutions and Courses for Overseas Students (CRICOS)",
        "dataset_page": DATASET_PAGE,
        "university_scope_source": STUDY_AUSTRALIA_UNIVERSITIES,
        "scope": "Active CRICOS courses from the 42 universities currently listed by Study Australia, with Victoria University's second CRICOS registration mapped to the same university.",
        "provider_records": len(providers),
        "university_count": len(set(PROVIDER_MAP.values())),
        "active_course_records": sum(len(rows) for rows in field_groups.values()),
        "location_records": len(locations),
        "course_location_records": len(course_locations),
        "sources": source_meta,
        "course_files": course_manifest,
    }
    write_json(output / "manifest.json", manifest)
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
