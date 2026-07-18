#!/usr/bin/env python3
"""Verify and optionally extract a Chemion Quest deployment package.

The package is intentionally self-contained. A release is accepted only when:
- every path is safe and unique;
- the archive contains exactly the files declared by release-manifest.json;
- every declared size and SHA-256 digest matches;
- required web entry points are present;
- version.json, index.html, sw.js, and the release manifest agree.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import tempfile
import zipfile

MAX_ARCHIVE_BYTES = 32 * 1024 * 1024
MAX_TOTAL_UNCOMPRESSED = 64 * 1024 * 1024
MAX_SINGLE_FILE = 48 * 1024 * 1024
MAX_FILE_COUNT = 128
MANIFEST_NAME = "release-manifest.json"
SITE_PREFIX = "site/"
REQUIRED_SITE_FILES = {
    "site/.nojekyll",
    "site/index.html",
    "site/manifest.webmanifest",
    "site/version.json",
    "site/sw.js",
    "site/icons/icon-192.png",
    "site/icons/icon-512.png",
    "site/icons/icon-maskable-512.png",
    "site/icons/apple-touch-icon.png",
    "site/assets/audio/chemion-normal-bgm.mp3",
    "site/assets/audio/chemion-difficult-bgm.mp3",
    "site/assets/audio/chemion-milestone-stage-bgm-v3.mp3",
    "site/assets/audio/chemion-stage10-au-boss-v16-loop.mp3",
}


class PackageVerificationError(RuntimeError):
    pass


def fail(message: str) -> None:
    raise PackageVerificationError(message)


def safe_member_name(name: str) -> str:
    if not name or "\\" in name or "\x00" in name:
        fail(f"unsafe archive path: {name!r}")
    path = PurePosixPath(name)
    if path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts):
        fail(f"unsafe archive path: {name!r}")
    normalized = path.as_posix()
    if normalized != name.rstrip("/"):
        fail(f"non-canonical archive path: {name!r}")
    return normalized


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _read_json_bytes(raw: bytes, label: str) -> dict:
    try:
        value = json.loads(raw.decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        fail(f"{label} is not valid UTF-8 JSON: {exc}")
    if not isinstance(value, dict):
        fail(f"{label} must contain a JSON object")
    return value


def verify_package(package_path: Path | str, extract_to: Path | str | None = None) -> dict:
    package = Path(package_path).resolve()
    if not package.is_file():
        fail(f"deployment package not found: {package}")
    if package.stat().st_size > MAX_ARCHIVE_BYTES:
        fail(f"deployment package is unexpectedly large: {package.stat().st_size} bytes")

    extraction_parent: Path | None = None
    target: Path | None = None
    if extract_to is not None:
        target = Path(extract_to).resolve()
        extraction_parent = target.parent
        extraction_parent.mkdir(parents=True, exist_ok=True)
        work_dir = Path(tempfile.mkdtemp(prefix=f".{target.name}-verify-", dir=extraction_parent))
    else:
        work_dir = Path(tempfile.mkdtemp(prefix="chemion-release-verify-"))

    try:
        with zipfile.ZipFile(package, "r") as archive:
            infos = archive.infolist()
            if len(infos) > MAX_FILE_COUNT:
                fail(f"too many archive entries: {len(infos)}")

            seen: set[str] = set()
            file_infos: dict[str, zipfile.ZipInfo] = {}
            total_uncompressed = 0
            for info in infos:
                name = safe_member_name(info.filename)
                if name in seen:
                    fail(f"duplicate archive entry: {name}")
                seen.add(name)
                mode = info.external_attr >> 16
                if stat.S_ISLNK(mode):
                    fail(f"symbolic links are not allowed: {name}")
                if info.is_dir():
                    continue
                if info.file_size > MAX_SINGLE_FILE:
                    fail(f"archive member is unexpectedly large: {name}")
                total_uncompressed += info.file_size
                if total_uncompressed > MAX_TOTAL_UNCOMPRESSED:
                    fail("archive expands beyond the permitted size")
                file_infos[name] = info

            if MANIFEST_NAME not in file_infos:
                fail(f"missing {MANIFEST_NAME}")
            if file_infos[MANIFEST_NAME].file_size > 1024 * 1024:
                fail("release manifest is unexpectedly large")

            manifest = _read_json_bytes(archive.read(MANIFEST_NAME), MANIFEST_NAME)
            if manifest.get("schemaVersion") != 1:
                fail("unsupported release manifest schema")
            if manifest.get("application") != "Chemion Quest":
                fail("release manifest application name is invalid")
            if manifest.get("deploymentMode") != "verified-single-package":
                fail("release manifest deployment mode is invalid")
            if manifest.get("siteRoot") != "site":
                fail("release manifest siteRoot must be 'site'")

            version = manifest.get("version")
            release_date = manifest.get("releaseDate")
            save_version = manifest.get("saveVersion")
            if not isinstance(version, str) or not version or any(ch not in "0123456789." for ch in version):
                fail("release manifest version is invalid")
            if not isinstance(release_date, str) or len(release_date) != 10:
                fail("release manifest releaseDate is invalid")
            if not isinstance(save_version, int) or save_version < 1:
                fail("release manifest saveVersion is invalid")

            declared = manifest.get("files")
            if not isinstance(declared, dict) or not declared:
                fail("release manifest files must be a non-empty object")
            declared_names = set(declared)
            if not REQUIRED_SITE_FILES.issubset(declared_names):
                missing = sorted(REQUIRED_SITE_FILES - declared_names)
                fail(f"required site files are missing from manifest: {', '.join(missing)}")
            if any(not name.startswith(SITE_PREFIX) for name in declared_names):
                fail("all deployed files must be inside site/")
            for name in declared_names:
                safe_member_name(name)

            actual_file_names = set(file_infos)
            expected_file_names = {MANIFEST_NAME, *declared_names}
            if actual_file_names != expected_file_names:
                missing = sorted(expected_file_names - actual_file_names)
                extra = sorted(actual_file_names - expected_file_names)
                details = []
                if missing:
                    details.append(f"missing: {', '.join(missing)}")
                if extra:
                    details.append(f"undeclared: {', '.join(extra)}")
                fail("archive contents do not exactly match the manifest (" + "; ".join(details) + ")")

            computed_build = hashlib.sha256()
            verified_bytes: dict[str, bytes] = {}
            total_declared_bytes = 0
            for name in sorted(declared_names):
                record = declared[name]
                if not isinstance(record, dict):
                    fail(f"invalid manifest record for {name}")
                expected_hash = record.get("sha256")
                expected_size = record.get("bytes")
                if not isinstance(expected_hash, str) or len(expected_hash) != 64:
                    fail(f"invalid SHA-256 in manifest for {name}")
                if not isinstance(expected_size, int) or expected_size < 0:
                    fail(f"invalid byte size in manifest for {name}")
                raw = archive.read(name)
                actual_hash = sha256_bytes(raw)
                if len(raw) != expected_size:
                    fail(f"size mismatch for {name}: expected {expected_size}, got {len(raw)}")
                if actual_hash != expected_hash:
                    fail(f"SHA-256 mismatch for {name}")
                total_declared_bytes += len(raw)
                verified_bytes[name] = raw
                computed_build.update(name.encode("utf-8"))
                computed_build.update(b"\0")
                computed_build.update(actual_hash.encode("ascii"))
                computed_build.update(b"\n")

            if manifest.get("totalBytes") != total_declared_bytes:
                fail("release manifest totalBytes does not match the verified files")
            expected_build_id = computed_build.hexdigest()[:20]
            if manifest.get("buildId") != expected_build_id:
                fail("release manifest buildId does not match the verified files")

            version_json = _read_json_bytes(verified_bytes["site/version.json"], "site/version.json")
            if version_json.get("version") != version:
                fail("version.json and release manifest versions differ")
            if version_json.get("releaseDate") != release_date:
                fail("version.json and release manifest release dates differ")
            if version_json.get("saveVersion") != save_version:
                fail("version.json and release manifest save versions differ")

            index_text = verified_bytes["site/index.html"].decode("utf-8", errors="strict")
            if f"Chemion Quest v{version}" not in index_text:
                fail("index.html does not contain the release version label")
            if f"CURRENT_VERSION = '{version}'" not in index_text:
                fail("index.html PWA runtime version differs from the release manifest")

            sw_text = verified_bytes["site/sw.js"].decode("utf-8", errors="strict")
            if f"Chemion Quest v{version}" not in sw_text or f"shell-v{version}" not in sw_text:
                fail("Service Worker cache version differs from the release manifest")

            web_manifest = _read_json_bytes(verified_bytes["site/manifest.webmanifest"], "site/manifest.webmanifest")
            if web_manifest.get("name") != "Chemion Quest":
                fail("web app manifest name is invalid")
            if web_manifest.get("start_url") != "./" or web_manifest.get("scope") != "./":
                fail("web app manifest start_url/scope must remain project-relative")

            # Extract only after every byte and cross-file relationship has passed.
            site_dir = work_dir / "site"
            site_dir.mkdir(parents=True, exist_ok=True)
            for name, raw in verified_bytes.items():
                relative = PurePosixPath(name).relative_to("site")
                destination = site_dir.joinpath(*relative.parts)
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(raw)

        if target is not None:
            staged_site = work_dir / "site"
            if target.exists():
                shutil.rmtree(target)
            os.replace(staged_site, target)

        return {
            "version": version,
            "releaseDate": release_date,
            "saveVersion": save_version,
            "buildId": expected_build_id,
            "fileCount": len(declared_names),
            "totalBytes": total_declared_bytes,
            "packageSha256": sha256_bytes(package.read_bytes()),
            "extractedTo": str(target) if target is not None else None,
        }
    except zipfile.BadZipFile as exc:
        fail(f"invalid ZIP archive: {exc}")
    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify a Chemion Quest single-file deployment package")
    parser.add_argument("package", nargs="?", default="chemion-release.zip")
    parser.add_argument("--extract-to", dest="extract_to")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    try:
        result = verify_package(args.package, args.extract_to)
    except PackageVerificationError as exc:
        print(f"Release package verification failed: {exc}")
        return 1
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(
            f"Verified Chemion Quest v{result['version']} package: "
            f"{result['fileCount']} files, build {result['buildId']}, "
            f"SHA-256 {result['packageSha256']}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
