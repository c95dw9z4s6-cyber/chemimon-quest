#!/usr/bin/env python3
"""Exercise v6.1 Stage 10 ranking rules against the Firestore emulator."""
from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
from http.client import responses
from pathlib import Path
import json
import os
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "FIRESTORE_RULES_V61_RESULTS.json"
PROJECT_ID = "chemion-quest"


def b64url(value: dict) -> str:
    raw = json.dumps(value, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def token(uid: str) -> str:
    now = datetime.now(timezone.utc)
    header = {"alg": "none", "kid": "emulator-test", "typ": "JWT"}
    payload = {
        "iss": f"https://securetoken.google.com/{PROJECT_ID}",
        "aud": PROJECT_ID,
        "auth_time": int(now.timestamp()),
        "user_id": uid,
        "sub": uid,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=1)).timestamp()),
        "firebase": {"sign_in_provider": "anonymous", "identities": {}},
    }
    return f"{b64url(header)}.{b64url(payload)}."


def fields(uid: str, best_ms: int, run_id: str, first_at: str) -> dict:
    return {
        "fields": {
            "userId": {"stringValue": uid},
            "username": {"stringValue": "PlayerOne"},
            "bestMs": {"integerValue": str(best_ms)},
            "runId": {"stringValue": run_id},
            "isTest": {"booleanValue": False},
            "firstRegisteredAt": {"timestampValue": first_at},
            "submittedAt": {"timestampValue": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")},
        }
    }


def request(method: str, url: str, body: dict | None = None, uid: str | None = None) -> tuple[int, str]:
    data = None if body is None else json.dumps(body).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if uid:
        headers["Authorization"] = f"Bearer {token(uid)}"
    req = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=10) as response:
            return response.status, response.read().decode("utf-8")
    except HTTPError as error:
        return error.code, error.read().decode("utf-8")


def main() -> int:
    host = os.environ.get("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080")
    base = f"http://{host}/v1/projects/{PROJECT_ID}/databases/(default)/documents"
    first_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    doc_url = f"{base}/stage10TimeAttack/u1"
    tests: list[dict] = []

    def check(name: str, actual: int, expected: int) -> None:
        tests.append({"name": name, "passed": actual == expected, "status": actual, "expected": expected, "statusText": responses.get(actual, "")})
        if actual != expected:
            raise AssertionError(f"{name}: expected HTTP {expected}, got {actual}")

    status, _ = request("PATCH", f"{base}/stage10TimeAttack/anonymous?currentDocument.exists=false", fields("anonymous", 222180, "run-00001", first_at))
    check("unauthenticated-create-denied", status, 403)

    status, _ = request("PATCH", f"{doc_url}?currentDocument.exists=false", fields("u1", 222180, "run-00001", first_at), "u1")
    check("owner-valid-create-allowed", status, 200)

    status, _ = request("GET", doc_url)
    check("public-read-allowed", status, 200)

    status, _ = request("PATCH", f"{doc_url}?currentDocument.exists=true", fields("u1", 210000, "run-00002", first_at), "u2")
    check("other-user-update-denied", status, 403)

    status, _ = request("PATCH", f"{doc_url}?currentDocument.exists=true", fields("u1", 230000, "run-00003", first_at), "u1")
    check("slower-owner-update-denied", status, 403)

    status, _ = request("PATCH", f"{doc_url}?currentDocument.exists=true", fields("u1", 210000, "run-00002", first_at), "u1")
    check("faster-owner-update-allowed", status, 200)

    status, _ = request("PATCH", f"{doc_url}?currentDocument.exists=true", fields("u1", 200000, "run-00002", first_at), "u1")
    check("duplicate-run-id-update-denied", status, 403)

    status, _ = request("DELETE", doc_url, uid="u1")
    check("delete-denied", status, 403)

    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "emulatorHost": host,
        "projectId": PROJECT_ID,
        "passed": all(item["passed"] for item in tests),
        "tests": tests,
    }
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"v6.1 Firestore emulator rule tests passed ({len(tests)}/{len(tests)}): {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
