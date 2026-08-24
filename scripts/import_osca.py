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


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


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
    values: list[str] = []
    for si in root.findall("a:si", ns):
        values.append("".join(t.text or "" for t in si.iterfind(".//a:t", ns)))
    return values


def cell_value(cell: ET.Element, strings: list[str], ns: dict[str, str]) -> str:
    cell_type = cell.attrib.get("t")
    value_el = cell.find("a:v", ns)
    if value_el is None:
        parts = [item.text or "" for item in cell.findall(".//a:is//a:t", ns)]
        return "".join(parts).strip()
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


def normalise_header(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def find_header_map(rows: list[dict[str, str]], required_words: tuple[str, ...]) -> tuple[int, dict[str, str]] | None:
    for index, row in enumerate(rows[:80]):
        headers = {column: normalise_header(value) for column, value in row.items()}
        joined = " ".join(headers.values())
        if all(word in joined for word in required_words):
            return index, headers
    return None


def find_column(headers: dict[str, str], *needles: str) -> str | None:
    for column, header in headers.items():
        if all(needle in header for needle in needles):
            return column
    return None


def extract_structure(xlsx: Path) -> dict[str, dict[str, object]]:
    records: dict[str, dict[str, object]] = {}
    for row in workbook_rows(xlsx):
        values = list(row.values())
        code = next((value for value in values if CODE_RE.fullmatch(value)), None)
        if not code:
            continue
        code_position = values.index(code)
        candidates = [value for value in values[code_position + 1 :] if not re.fullmatch(r"\d+(?:\.\d+)?", value)]
        if not candidates:
            continue
        name = candidates[0].strip()
        if len(name) < 2:
            continue
        source_url = f"{ABS_BROWSE_BASE}/{code[0]}/{code[:2]}/{code[:3]}/{code[:4]}/{code}"
        records[code] = {
            "code": code,
            "name": name,
            "classification_level": "occupation",
            "source_url": source_url,
            "source_release": ABS_RELEASE,
            "description": None,
            "alternative_titles": [],
            "specialisations": [],
        }
    return records


def extract_descriptions(xlsx: Path) -> dict[str, str]:
    rows = workbook_rows(xlsx)
    descriptions: dict[str, str] = {}
    header = find_header_map(rows, ("code",))
    if not header:
        return descriptions
    header_index, headers = header
    code_col = find_column(headers, "code")
    description_col = find_column(headers, "description") or find_column(headers, "definition")

    for row in rows[header_index + 1 :]:
        code = row.get(code_col, "") if code_col else next((v for v in row.values() if CODE_RE.fullmatch(v)), "")
        if not CODE_RE.fullmatch(code):
            continue
        description = row.get(description_col, "").strip() if description_col else ""
        if not description:
            values = [v.strip() for v in row.values() if v.strip() and v != code]
            prose = [v for v in values if len(v) >= 40 and not CODE_RE.fullmatch(v)]
            description = prose[0] if prose else ""
        if description:
            descriptions[code] = description
    return descriptions


def extract_titles(xlsx: Path) -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    rows = workbook_rows(xlsx)
    alternatives: dict[str, list[str]] = defaultdict(list)
    specialisations: dict[str, list[str]] = defaultdict(list)
    header = find_header_map(rows, ("code", "title"))
    if not header:
        return dict(alternatives), dict(specialisations)

    header_index, headers = header
    code_col = find_column(headers, "code")
    type_col = find_column(headers, "type") or find_column(headers, "category")
    title_col = find_column(headers, "title")

    for row in rows[header_index + 1 :]:
        code = row.get(code_col, "") if code_col else next((v for v in row.values() if CODE_RE.fullmatch(v)), "")
        if not CODE_RE.fullmatch(code):
            continue
        kind = row.get(type_col, "").strip().lower() if type_col else ""
        title = row.get(title_col, "").strip() if title_col else ""

        if not title or title == code:
            text_values = [v.strip() for v in row.values() if v.strip() and v != code]
            type_like = next((v for v in text_values if any(word in v.lower() for word in ("alternative", "specialisation", "specialization", "principal", "nec"))), "")
            if not kind and type_like:
                kind = type_like.lower()
            title_candidates = [v for v in text_values if v != type_like and len(v) > 1]
            title = title_candidates[-1] if title_candidates else ""

        if not title:
            continue
        if "alternative" in kind:
            if title not in alternatives[code]:
                alternatives[code].append(title)
        elif "specialisation" in kind or "specialization" in kind:
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
        descriptions = extract_descriptions(descriptions_file)
        alternatives, specialisations = extract_titles(index_file)

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

    # The structure import must remain useful even if ABS changes the optional
    # enrichment workbook layout, but report zero-match enrichments clearly.
    if description_count == 0:
        print("Warning: no occupation descriptions were matched; ABS workbook layout may have changed.", file=sys.stderr)
    if alternative_count == 0 and specialisation_count == 0:
        print("Warning: no alternative titles/specialisations were matched; ABS workbook layout may have changed.", file=sys.stderr)

    upsert(supabase_url, service_key, list(records.values()))
    print("OSCA import and enrichment complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
