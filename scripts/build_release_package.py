#!/usr/bin/env python3
"""Build the one-file GitHub Pages deployment package for Chemion Quest."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import zipfile

from verify_release_package import verify_package

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "chemion-release.zip"
SITE_FILES = [
    ".nojekyll",
    "index.html",
    "manifest.webmanifest",
    "version.json",
    "sw.js",
    "icons/icon-192.png",
    "icons/icon-512.png",
    "icons/icon-maskable-512.png",
    "icons/apple-touch-icon.png",
    "assets/audio/chemion-normal-bgm.mp3",
    "assets/audio/chemion-difficult-bgm.mp3",
    "assets/audio/chemion-stage10-au-boss-v16-loop.mp3",
]


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def zip_info(name: str) -> zipfile.ZipInfo:
    info = zipfile.ZipInfo(name, date_time=(2026, 7, 17, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    info.create_system = 3
    info.external_attr = (0o100644 & 0xFFFF) << 16
    return info


def main() -> int:
    release = json.loads((ROOT / "config/release.json").read_text(encoding="utf-8"))
    published = json.loads((ROOT / "version.json").read_text(encoding="utf-8"))
    for key in ("version", "releaseDate", "saveVersion"):
        if release[key] != published[key]:
            raise SystemExit(f"config/release.json and version.json differ for {key}")

    payload: dict[str, bytes] = {}
    records: dict[str, dict[str, int | str]] = {}
    build = hashlib.sha256()
    for relative in sorted(SITE_FILES):
        source = ROOT / relative
        if not source.is_file():
            raise SystemExit(f"site file missing: {relative}")
        name = f"site/{relative}"
        raw = source.read_bytes()
        sha = digest(raw)
        payload[name] = raw
        records[name] = {"sha256": sha, "bytes": len(raw)}
        build.update(name.encode("utf-8"))
        build.update(b"\0")
        build.update(sha.encode("ascii"))
        build.update(b"\n")

    manifest = {
        "schemaVersion": 1,
        "application": "Chemion Quest",
        "deploymentMode": "verified-single-package",
        "version": release["version"],
        "releaseDate": release["releaseDate"],
        "saveVersion": release["saveVersion"],
        "siteRoot": "site",
        "buildId": build.hexdigest()[:20],
        "totalBytes": sum(record["bytes"] for record in records.values()),
        "requiredEntrypoints": sorted(["index.html", "version.json", "sw.js", "manifest.webmanifest"]),
        "files": records,
    }
    manifest_bytes = (json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8")

    OUTPUT.unlink(missing_ok=True)
    with zipfile.ZipFile(OUTPUT, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        archive.writestr(zip_info("release-manifest.json"), manifest_bytes)
        for name in sorted(payload):
            archive.writestr(zip_info(name), payload[name])

    result = verify_package(OUTPUT)
    print(
        f"Built {OUTPUT}: Chemion Quest v{result['version']}, "
        f"build {result['buildId']}, SHA-256 {result['packageSha256']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
