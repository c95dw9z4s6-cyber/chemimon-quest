#!/usr/bin/env python3
"""Verify exact v6.1 Stage 10 MP3 assets and fully decode both files."""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

import miniaudio
from mutagen.mp3 import MP3


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "AUDIO_V61_RESULTS.json"
ASSETS = {
    "V3": {
        "path": "assets/audio/chemion-milestone-stage-bgm-v3.mp3",
        "sha256": "14600796c5beea7b3f81679a8c4bc2c7d535b1448b6985af7b0a857e3bd5c2ba",
        "bytes": 3_747_570,
        "containerDurationSeconds": 187.350204,
    },
    "V16": {
        "path": "assets/audio/chemion-stage10-au-boss-v16-loop.mp3",
        "sha256": "5fd7cf0a3a8001b7545b0ce26e87835c0d1b19d042767c1f49955507f1b613af",
        "bytes": 8_450_196,
    },
}


def main() -> int:
    records = []
    for label, expected in ASSETS.items():
        path = ROOT / expected["path"]
        raw = path.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        if len(raw) != expected["bytes"]:
            raise AssertionError(f"{label} byte size changed: {len(raw)}")
        if digest != expected["sha256"]:
            raise AssertionError(f"{label} SHA-256 changed: {digest}")
        info = miniaudio.mp3_get_file_info(str(path))
        container_duration = MP3(path).info.length
        decoded = miniaudio.mp3_read_file_s16(str(path))
        if decoded.num_frames <= 0 or decoded.duration <= 0:
            raise AssertionError(f"{label} decoded no PCM frames")
        if decoded.num_frames != info.num_frames:
            raise AssertionError(f"{label} metadata/decode frame mismatch")
        if "containerDurationSeconds" in expected and abs(container_duration - expected["containerDurationSeconds"]) > 0.000_001:
            raise AssertionError(f"{label} container duration changed: {container_duration}")
        records.append({
            "label": label,
            "path": expected["path"],
            "bytes": len(raw),
            "sha256": digest,
            "channels": decoded.nchannels,
            "sampleRate": decoded.sample_rate,
            "pcmFrames": decoded.num_frames,
            "containerDurationSeconds": container_duration,
            "decodedPcmDurationSeconds": decoded.duration,
            "fullDecode": True,
        })

    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "passed": True,
        "decoder": f"miniaudio {miniaudio.__version__}",
        "assets": records,
    }
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"v6.1 audio integrity/full-decode tests passed ({len(records)}/{len(records)}): {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
