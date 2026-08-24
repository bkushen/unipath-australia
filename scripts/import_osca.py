#!/usr/bin/env python3
"""Import and enrich official ABS OSCA 2024 Version 1.0 occupations.

Uses only the Python standard library. The script downloads the official ABS
OSCA structure, category descriptions, and occupation-title index workbooks,
extracts six-digit occupation records, and upserts them into
public.osca_occupations.

Required in .env.local:
  NEXT_PUBLIC_SUPABASE_URL=...
  SUPABASE_SERVICE_ROLE_KEY=...

Never commit, paste, or share the service-role key.
"""

from __future__ import annotations

import json
import os
import re
import sys
import tempfile
import urllib.request
import zipfile
from collections import defaultdict
from pathlib import Path
from xml.etree import ElementTree as ET

ABS_RELEASE = "OSCA 2024 Version 1.0"
ABS_DOWNLOAD_BASE = "https://www.abs.gov.au/statistics/classifications/osca-occupation-standard-classification-australia/2024-version-1-0/data-downloads"
ABS_STRUCTURE_XLSX = f"{ABS_DOWNLOAD_BASE}/OSCA%20structure.xlsx"
ABS_DESCRIPTIONS_XLSX = f"{ABS_DOWNLOAD_BASE}/OSCA%20Category%20Descriptions.xlsx"
ABS_INDEX_XLSX = f"{ABS_DOWNLOAD_BASE}/OSCA%20index%20of%20principal%20titles%20alternative%20titles%20and%20specialisations.xlsx"
ABS_BROWSE_BASE = "https://www.abs.gov.au/statistics/classifications/osca-occupation-standard-classification-australia/2024-version-1-0/browse-classification"
CODE_RE = re.compile(r"^\d{6}$")
CELL_REF_RE = re.compile(r"^([A-Z]+)\d+$")
NUMBER_RE = re.compile(r"^\d+(?:\.\d+)?$")


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def download(url: str, target: Path, label: str) -> None:
    print(f"Downloading official ABS {label} workbook...")
    req = urllib.request.Request(url, headers={"User-Agent": "UniPath-Australia/1.0"})
    with urllib.request.urlopen(req, timeout=90) as response, target.open("wb") as out:
        out.write(response.read())


def shared_strings(zf: zipfile.ZipFile) -> list[str]:
    try:
        root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    ns = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    return ["".join(t.text or "" for t in si.iterfind(".//a:t", ns)) for si in root.findall("a:si", ns)]


def cell_value(cell: ET.Element, strings: list[str], ns: dict[str, str]) -> str:
    cell_type = cell.attrib.get("t")
    value_el = cell.find("a:v", ns)
    if value_el is None:
        return "".join(item.text or "" for item in cell.findall(".//a:is//a:t", ns)).strip()
    raw = (value_el.text or "").strip()
    if cell_type == "s" and raw.isdigit():
        idx = int(raw)
        return strings[idx].strip() if idx < len(strings) else ""
    return raw


def workbook_rows(xlsx: Path) -> list[dict[str, str]]:
    ns = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    output: list[dict[str, str]] = []
    with zipfile.ZipFile(xlsx) as zf:
        strings = shared_strings(zf)
        sheets = sorted(name for name in zf.namelist() if name.startswith("xl/worksheets/sheet") and name.endswith(".xml"))
        for sheet in sheets:
            root = ET.fromstring(zf.read(sheet))
            for row in root.findall(".//a:row", ns):
                values: dict[str, str] = {}
                for cell in row.findall("a:c", ns):
                    ref = cell.attrib.get("r", "")
                    match = CELL_REF_RE.match(ref)
                    column = match.group(1) if match else str(len(values))
                    value = cell_value(cell, strings, ns).strip()
                    if value:
                        values[column] = value
                if values:
                    output.append(values)
    return output


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def extract_structure(xlsx: Path) -> dict[str, dict[str, object]]:
    records: dict[str, dict[str, object]] = {}
    for row in workbook_rows(xlsx):
        values = [clean_text(v) for v in row.values() if clean_text(v)]
        code = next((value for value in values if CODE_RE.fullmatch(value)), None)
        if not code:
            continue
        code_position = values.index(code)
        candidates = [value for value in values[code_position + 1 :] if not NUMBER_RE.fullmatch(value)]
        if not candidates:
            continue
        name = candidates[0]
        if len(name) < 2:
            continue
        records[code] = {
            "code": code,
            "name": name,
            "classification_level": "occupation",
            "source_url": f"{ABS_BROWSE_BASE}/{code[0]}/{code[:2]}/{code[:3]}/{code[:4]}/{code}",
            "source_release": ABS_RELEASE,
            "description": None,
            "alternative_titles": [],
            "specialisations": [],
        }
    return records


def extract_descriptions(xlsx: Path, records: dict[str, dict[str, object]]) -> dict[str, str]:
    """Extract occupation lead statements without relying on a fixed ABS header layout."""
    descriptions: dict[str, str] = {}
    for row in workbook_rows(xlsx):
        values = [clean_text(v) for v in row.values() if clean_text(v)]
        code = next((value for value in values if CODE_RE.fullmatch(value)), None)
        if not code or code not in records:
            continue
        principal = str(records[code]["name"]).lower()
        candidates: list[str] = []
        for value in values:
            lower = value.lower()
            if value == code or lower == principal or NUMBER_RE.fullmatch(value):
                continue
            if lower in {"occupation", "principal title", "lead statement", "description", "skill level"}:
                continue
            # Occupation lead statements are prose. This avoids selecting short labels,
            # category names, or skill-level values if the workbook layout changes.
            if len(value) >= 30 and (" " in value):
                candidates.append(value)
        if candidates:
            descriptions[code] = max(candidates, key=len)
    return descriptions


def extract_titles(xlsx: Path, records: dict[str, dict[str, object]]) -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    """Extract alternative titles and specialisations from any column order.

    ABS title-index workbooks have changed layout across releases, so this parser
    identifies the six-digit occupation code and title-type marker per row rather
    than depending on one exact header row.
    """
    alternatives: dict[str, list[str]] = defaultdict(list)
    specialisations: dict[str, list[str]] = defaultdict(list)

    for row in workbook_rows(xlsx):
        values = [clean_text(v) for v in row.values() if clean_text(v)]
        code = next((value for value in values if CODE_RE.fullmatch(value)), None)
        if not code or code not in records:
            continue

        kind_value = next(
            (
                value for value in values
                if any(marker in value.lower() for marker in (
                    "alternative title", "alternative", "specialisation", "specialization",
                    "principal title", "occupation in nec", " nec "
                ))
            ),
            "",
        )
        kind = kind_value.lower()
        if "alternative" not in kind and "specialisation" not in kind and "specialization" not in kind:
            continue

        principal = str(records[code]["name"]).lower()
        title_candidates = [
            value for value in values
            if value != code
            and value != kind_value
            and value.lower() != principal
            and not NUMBER_RE.fullmatch(value)
            and value.lower() not in {"code", "title", "type", "occupation code", "occupation title"}
        ]
        if not title_candidates:
            continue

        # The title is normally the compact human-readable text in the row.
        title = min(title_candidates, key=lambda value: (len(value), value.lower()))
        if len(title) < 2:
            continue

        if "alternative" in kind:
            if title not in alternatives[code]:
                alternatives[code].append(title)
        else:
            if title not in specialisations[code]:
                specialisations[code].append(title)

    return dict(alternatives), dict(specialisations)


def upsert(url: str, service_key: str, rows: list[dict[str, object]]) -> None:
    endpoint = url.rstrip("/") + "/rest/v1/osca_occupations?on_conflict=code"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
        "User-Agent": "UniPath-Australia/1.0",
    }
    batch_size = 200
    for start in range(0, len(rows), batch_size):
        batch = rows[start : start + batch_size]
        req = urllib.request.Request(endpoint, data=json.dumps(batch).encode("utf-8"), headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=90) as response:
            if response.status not in (200, 201, 204):
                raise RuntimeError(f"Supabase returned HTTP {response.status}")
        print(f"Imported {min(start + batch_size, len(rows))}/{len(rows)}")


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    load_env(repo_root / ".env.local")
    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not supabase_url or not service_key:
        print("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.", file=sys.stderr)
        print("Keep SUPABASE_SERVICE_ROLE_KEY local only; never commit or share it.", file=sys.stderr)
        return 1

    with tempfile.TemporaryDirectory() as temp_dir:
        temp = Path(temp_dir)
        structure_file = temp / "osca_structure.xlsx"
        descriptions_file = temp / "osca_descriptions.xlsx"
        index_file = temp / "osca_index.xlsx"
        download(ABS_STRUCTURE_XLSX, structure_file, "structure")
        download(ABS_DESCRIPTIONS_XLSX, descriptions_file, "category descriptions")
        download(ABS_INDEX_XLSX, index_file, "title index")

        records = extract_structure(structure_file)
        descriptions = extract_descriptions(descriptions_file, records)
        alternatives, specialisations = extract_titles(index_file, records)

    if len(records) < 500:
        print(f"Safety check failed: only {len(records)} six-digit occupations were found.", file=sys.stderr)
        return 2

    for code, record in records.items():
        record["description"] = descriptions.get(code)
        record["alternative_titles"] = alternatives.get(code, [])
        record["specialisations"] = specialisations.get(code, [])

    description_count = sum(1 for row in records.values() if row["description"])
    alternative_count = sum(1 for row in records.values() if row["alternative_titles"])
    specialisation_count = sum(1 for row in records.values() if row["specialisations"])

    print(f"Found {len(records)} official six-digit OSCA occupations.")
    print(f"Descriptions matched: {description_count}")
    print(f"Occupations with alternative titles: {alternative_count}")
    print(f"Occupations with specialisations: {specialisation_count}")

    # Fail enrichment safely instead of overwriting good metadata with empty data.
    if description_count == 0:
        print("Safety check failed: no occupation descriptions were matched.", file=sys.stderr)
        return 3
    if alternative_count == 0 and specialisation_count == 0:
        print("Safety check failed: no alternative titles or specialisations were matched.", file=sys.stderr)
        return 4

    upsert(supabase_url, service_key, list(records.values()))
    print("OSCA import and enrichment complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
