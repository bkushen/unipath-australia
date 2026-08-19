#!/usr/bin/env python3
"""Import official ABS OSCA 2024 Version 1.0 occupations into Supabase.

Uses only the Python standard library. The script downloads the official ABS
OSCA structure workbook, extracts 6-digit occupation rows, and upserts them
into public.osca_occupations.

Required in .env.local:
  NEXT_PUBLIC_SUPABASE_URL=...
  SUPABASE_SERVICE_ROLE_KEY=...

Never commit the service-role key.
"""

from __future__ import annotations

import json
import os
import re
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

ABS_XLSX = "https://www.abs.gov.au/statistics/classifications/osca-occupation-standard-classification-australia/2024-version-1-0/data-downloads/OSCA%20structure.xlsx"
ABS_RELEASE = "OSCA 2024 Version 1.0"
ABS_BASE = "https://www.abs.gov.au/statistics/classifications/osca-occupation-standard-classification-australia/2024-version-1-0/browse-classification"
CODE_RE = re.compile(r"^\d{6}$")


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


def download(url: str, target: Path) -> None:
    print("Downloading official ABS OSCA workbook...")
    req = urllib.request.Request(url, headers={"User-Agent": "UniPath-Australia/1.0"})
    with urllib.request.urlopen(req, timeout=60) as response, target.open("wb") as out:
        out.write(response.read())


def shared_strings(zf: zipfile.ZipFile) -> list[str]:
    try:
        root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    ns = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    values: list[str] = []
    for si in root.findall("a:si", ns):
        text = "".join(t.text or "" for t in si.iterfind(".//a:t", ns))
        values.append(text)
    return values


def cell_value(cell: ET.Element, strings: list[str], ns: dict[str, str]) -> str:
    cell_type = cell.attrib.get("t")
    value_el = cell.find("a:v", ns)
    if value_el is None:
        inline = cell.find("a:is/a:t", ns)
        return (inline.text or "").strip() if inline is not None else ""
    raw = (value_el.text or "").strip()
    if cell_type == "s" and raw.isdigit():
        idx = int(raw)
        return strings[idx].strip() if idx < len(strings) else ""
    return raw


def extract_occupations(xlsx: Path) -> list[dict[str, object]]:
    ns = {"a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    rows: dict[str, str] = {}
    with zipfile.ZipFile(xlsx) as zf:
        strings = shared_strings(zf)
        worksheets = sorted(name for name in zf.namelist() if name.startswith("xl/worksheets/sheet") and name.endswith(".xml"))
        for sheet in worksheets:
            root = ET.fromstring(zf.read(sheet))
            for row in root.findall(".//a:row", ns):
                values = [cell_value(cell, strings, ns) for cell in row.findall("a:c", ns)]
                values = [v.strip() for v in values if v and v.strip()]
                if not values:
                    continue
                code_index = next((i for i, value in enumerate(values) if CODE_RE.fullmatch(value)), None)
                if code_index is None:
                    continue
                code = values[code_index]
                candidates = [v for v in values[code_index + 1 :] if not re.fullmatch(r"\d+(?:\.\d+)?", v)]
                if not candidates:
                    continue
                name = candidates[0].strip()
                if len(name) < 2:
                    continue
                rows[code] = name

    occupations = []
    for code, name in sorted(rows.items()):
        source_url = f"{ABS_BASE}/{code[0]}/{code[:2]}/{code[:3]}/{code[:4]}/{code}"
        occupations.append({
            "code": code,
            "name": name,
            "classification_level": "occupation",
            "source_url": source_url,
            "source_release": ABS_RELEASE,
        })
    return occupations


def upsert(url: str, service_key: str, rows: list[dict[str, object]]) -> None:
    endpoint = url.rstrip("/") + "/rest/v1/osca_occupations?on_conflict=code"
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
        "User-Agent": "UniPath-Australia/1.0",
    }
    batch_size = 250
    for start in range(0, len(rows), batch_size):
        batch = rows[start : start + batch_size]
        req = urllib.request.Request(endpoint, data=json.dumps(batch).encode("utf-8"), headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=60) as response:
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
        xlsx = Path(temp_dir) / "osca_structure.xlsx"
        download(ABS_XLSX, xlsx)
        occupations = extract_occupations(xlsx)

    if len(occupations) < 500:
        print(f"Safety check failed: only {len(occupations)} 6-digit occupations were found.", file=sys.stderr)
        return 2

    print(f"Found {len(occupations)} official 6-digit OSCA occupations.")
    upsert(supabase_url, service_key, occupations)
    print("OSCA import complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
