from __future__ import annotations

import json
import pathlib

COURSE_CHUNK_SIZE = 150
LOCATION_CHUNK_SIZE = 400


def read_json(path: pathlib.Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: pathlib.Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def chunk_records(records: list, size: int):
    for start in range(0, len(records), size):
        yield records[start : start + size]


def main() -> None:
    source_dir = pathlib.Path("data/cricos")
    output_dir = source_dir / "chunks"
    output_dir.mkdir(parents=True, exist_ok=True)

    for existing in output_dir.glob("*.json"):
        existing.unlink()

    manifest = {
        "course_chunk_size": COURSE_CHUNK_SIZE,
        "course_location_chunk_size": LOCATION_CHUNK_SIZE,
        "course_groups": [],
        "course_location_chunks": [],
    }

    for source in sorted(source_dir.glob("courses-*.json")):
        records = read_json(source)
        group = {"source": source.name, "records": len(records), "chunks": []}
        stem = source.stem
        for index, chunk in enumerate(chunk_records(records, COURSE_CHUNK_SIZE), start=1):
            filename = f"{stem}-{index:03d}.json"
            path = output_dir / filename
            write_json(path, chunk)
            group["chunks"].append({"file": filename, "records": len(chunk), "bytes": path.stat().st_size})
        manifest["course_groups"].append(group)

    location_records = read_json(source_dir / "course-locations.json")
    for index, chunk in enumerate(chunk_records(location_records, LOCATION_CHUNK_SIZE), start=1):
        filename = f"course-locations-{index:03d}.json"
        path = output_dir / filename
        write_json(path, chunk)
        manifest["course_location_chunks"].append({"file": filename, "records": len(chunk), "bytes": path.stat().st_size})

    write_json(output_dir / "manifest.json", manifest)

    course_chunk_count = sum(len(group["chunks"]) for group in manifest["course_groups"])
    print(f"Generated {course_chunk_count} course chunks and {len(manifest['course_location_chunks'])} course-location chunks")


if __name__ == "__main__":
    main()
