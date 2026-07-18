#!/usr/bin/env python3
"""Regression tests for the verified single-package deployment format."""
from __future__ import annotations

import json
from pathlib import Path
import shutil
import tempfile
import zipfile

from verify_release_package import PackageVerificationError, verify_package

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "chemion-release.zip"


def expect_failure(path: Path, expected_fragment: str) -> None:
    try:
        verify_package(path)
    except PackageVerificationError as exc:
        if expected_fragment not in str(exc):
            raise AssertionError(f"expected {expected_fragment!r}, got {exc!r}") from exc
        return
    raise AssertionError(f"package unexpectedly passed: {path}")


def rewrite(source: Path, target: Path, mutate) -> None:
    with zipfile.ZipFile(source, "r") as archive:
        entries = [(info.filename, archive.read(info.filename)) for info in archive.infolist() if not info.is_dir()]
    entries = mutate(entries)
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, raw in entries:
            archive.writestr(name, raw)


def main() -> int:
    verified = verify_package(SOURCE)
    with tempfile.TemporaryDirectory(prefix="chemion-package-tests-") as directory:
        root = Path(directory)

        corrupt = root / "corrupt.zip"
        def corrupt_index(entries):
            return [(name, (raw[:-1] + bytes([raw[-1] ^ 1])) if name == "site/index.html" else raw) for name, raw in entries]
        rewrite(SOURCE, corrupt, corrupt_index)
        expect_failure(corrupt, "SHA-256 mismatch")

        missing = root / "missing.zip"
        rewrite(SOURCE, missing, lambda entries: [(name, raw) for name, raw in entries if name != "site/sw.js"])
        expect_failure(missing, "archive contents do not exactly match")

        extra = root / "extra.zip"
        rewrite(SOURCE, extra, lambda entries: entries + [("site/forgotten-old-file.js", b"stale")])
        expect_failure(extra, "undeclared")

        traversal = root / "traversal.zip"
        rewrite(SOURCE, traversal, lambda entries: entries + [("../outside.txt", b"unsafe")])
        expect_failure(traversal, "unsafe archive path")

        version_mismatch = root / "version-mismatch.zip"
        def mismatched_version(entries):
            table = dict(entries)
            version = json.loads(table["site/version.json"].decode("utf-8"))
            version["version"] = "99.99"
            altered = (json.dumps(version, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
            table["site/version.json"] = altered
            manifest = json.loads(table["release-manifest.json"].decode("utf-8"))
            import hashlib
            manifest["files"]["site/version.json"] = {"sha256": hashlib.sha256(altered).hexdigest(), "bytes": len(altered)}
            # Recalculate the build ID and total bytes so the test reaches cross-file version validation.
            h = hashlib.sha256()
            total = 0
            for name in sorted(manifest["files"]):
                rec = manifest["files"][name]
                total += rec["bytes"]
                h.update(name.encode("utf-8")); h.update(b"\0"); h.update(rec["sha256"].encode("ascii")); h.update(b"\n")
            manifest["buildId"] = h.hexdigest()[:20]
            manifest["totalBytes"] = total
            table["release-manifest.json"] = (json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8")
            return list(table.items())
        rewrite(SOURCE, version_mismatch, mismatched_version)
        expect_failure(version_mismatch, "versions differ")

        extracted = root / "site"
        verify_package(SOURCE, extracted)
        assert (extracted / "index.html").is_file()
        assert not (extracted / "release-manifest.json").exists()

    print(
        "Release package tests passed: valid package accepted; corruption, missing file, stale extra file, "
        "path traversal, and cross-file version mismatch rejected. "
        f"Build {verified['buildId']}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
