#!/usr/bin/env python3
"""Browser checks for v6.1 Stage 10 time attack, responsive layout and performance."""
from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "BROWSER_STAGE10_V61_RESULTS.json"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, _format: str, *_args) -> None:
        return


class QuietServer(ThreadingHTTPServer):
    def handle_error(self, _request, _client_address) -> None:
        return


@contextmanager
def local_site():
    server = QuietServer(("127.0.0.1", 0), partial(QuietHandler, directory=str(ROOT)))
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def check(results: list[dict], name: str, condition: bool, details=None) -> None:
    record = {"name": name, "passed": bool(condition)}
    if details is not None:
        record["details"] = details
    results.append(record)
    if not condition:
        raise AssertionError(f"{name}: {details!r}")


def snapshot(page):
    return page.evaluate("window.cqV6TestApi.snapshot()")


def strip_time_attack(raw: str) -> dict:
    value = json.loads(raw)
    value.get("progress", {}).pop("timeAttack", None)
    value.pop("savedAt", None)
    return value


def main() -> int:
    results: list[dict] = []
    errors: list[str] = []
    with local_site() as base_url, sync_playwright() as playwright:
        candidates = [
            os.environ.get("CHROMIUM_PATH"),
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        ]
        executable = next((item for item in candidates if item and Path(item).is_file()), None)
        browser = playwright.chromium.launch(
            headless=os.environ.get("CQ_BROWSER_HEADED") != "1",
            executable_path=executable,
            args=[
                "--no-sandbox",
                "--disable-background-timer-throttling",
                "--disable-backgrounding-occluded-windows",
                "--disable-renderer-backgrounding",
            ],
        )
        context = browser.new_context(viewport={"width": 1365, "height": 900})
        context.add_init_script("localStorage.setItem('chemionQuestOnlinePromptV13','1'); localStorage.removeItem('chemionQuestNicknameV13');")
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(f"{base_url}?cqTest=1", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_function("Boolean(window.cqV6TestApi)", timeout=15000)

        page.evaluate("cqV6TestApi.enterStage10({testCoins:4321,unlockUnits:true})")
        page.evaluate("cqV6TestApi.setAquaProgress({unlocked:true,level:7,contactComplete:true})")
        page.evaluate("cqV6TestApi.setTimeAttackUnlocked(true)")
        page.evaluate("cqV6TestApi.setPaused(true)")
        page.evaluate("cqV6TestApi.saveNow()")
        normal_raw = page.evaluate("localStorage.getItem(window.gameData.saveKey)")
        normal = snapshot(page)
        check(results, "normal-fixture-has-progress", normal["coins"] == 4321 and normal["aquaRegiaLevel"] == 7, normal)

        check(results, "time-attack-starts", page.evaluate("cqV6TestApi.beginTimeAttack()") is True)
        temporary = snapshot(page)
        check(results, "temporary-initial-state", temporary["timeAttackActive"] and temporary["stage"] == 10 and temporary["wave"] == 1 and temporary["coins"] == 0 and temporary["level"] == 1 and temporary["energyCapacityLevel"] == 1 and temporary["aquaRegiaLevel"] == 1 and not temporary["aquaRegiaUnlocked"] and set(temporary["unitUpgradeLevels"].values()) == {1}, temporary)
        check(results, "developer-run-is-invalid", not temporary["timeAttackRun"]["valid"] and page.locator("#timeAttackValidity").inner_text() == "この走行は公式記録の対象外です", temporary["timeAttackRun"])
        check(results, "guest-assist-controls-disabled", page.locator("#guestAssistCode").is_disabled() and page.locator("#guestAssistCodeBtn").is_disabled())
        check(results, "normal-save-not-overwritten-by-battle", strip_time_attack(page.evaluate("localStorage.getItem(window.gameData.saveKey)")) == strip_time_attack(normal_raw))

        check(results, "summon-quiz-opens", page.evaluate("cqV6TestApi.requestFirstSummon()") is True)
        timer_before = snapshot(page)["timeAttackMs"]
        page.wait_for_timeout(260)
        during_quiz = snapshot(page)
        check(results, "timer-runs-during-quiz", during_quiz["activeQuiz"]["mode"] == "summon" and during_quiz["timeAttackMs"] >= timer_before + 180, {"before": timer_before, "after": during_quiz["timeAttackMs"]})
        page.evaluate("cqV6TestApi.answerActiveQuizCorrect()")
        page.evaluate("cqV6TestApi.continueActiveQuiz()")
        check(results, "summon-success-stays-temporary", len(snapshot(page)["allies"]) >= 1 and strip_time_attack(page.evaluate("localStorage.getItem(window.gameData.saveKey)")) == strip_time_attack(normal_raw))

        page.evaluate("cqV6TestApi.finishTimeAttack(false)")
        restored = snapshot(page)
        restored_raw = page.evaluate("localStorage.getItem(window.gameData.saveKey)")
        check(results, "abort-restores-normal", not restored["timeAttackActive"] and restored["coins"] == 4321 and restored["aquaRegiaLevel"] == 7 and strip_time_attack(restored_raw) == strip_time_attack(normal_raw), restored)

        page.evaluate("cqV6TestApi.beginTimeAttack()")
        page.evaluate("cqV6TestApi.forceTimeAttackElapsed(60000,{valid:true})")
        page.evaluate("cqV6TestApi.finishTimeAttack(true)")
        first_best = snapshot(page)["timeAttackProfile"]
        recorded_best = first_best["localBestMs"]
        check(results, "valid-best-recorded-in-ms", 60000 <= recorded_best < 61000 and first_best["pendingSubmission"]["timeMs"] == recorded_best, first_best)
        page.evaluate("cqV6TestApi.beginTimeAttack()")
        page.evaluate("cqV6TestApi.forceTimeAttackElapsed(70000,{valid:true})")
        page.evaluate("cqV6TestApi.finishTimeAttack(true)")
        slower = snapshot(page)["timeAttackProfile"]
        check(results, "slower-run-does-not-overwrite-best", slower["localBestMs"] == recorded_best and slower["pendingSubmission"]["timeMs"] == recorded_best, slower)

        page.evaluate("cqV6TestApi.beginTimeAttack()")
        page.evaluate("cqV6TestApi.forceTimeAttackElapsed(0,{valid:true})")
        page.evaluate("cqV6TestApi.finishTimeAttack(true)")
        abnormal = snapshot(page)["timeAttackProfile"]
        check(results, "abnormal-time-invalid", abnormal["runInvalid"] and abnormal["localBestMs"] == recorded_best, abnormal)

        page.evaluate("cqV6TestApi.beginTimeAttack()")
        page.reload(wait_until="domcontentloaded", timeout=30000)
        page.wait_for_function("Boolean(window.cqV6TestApi)", timeout=15000)
        reloaded = snapshot(page)
        check(results, "reload-invalidates-and-restores", not reloaded["timeAttackActive"] and reloaded["timeAttackProfile"]["runInvalid"] and not reloaded["timeAttackProfile"]["officialRunInProgress"] and reloaded["coins"] == 4321, reloaded["timeAttackProfile"])

        save32 = page.evaluate("""
          (() => { const key=window.gameData.saveKey; const save=JSON.parse(localStorage.getItem(key)); save.saveVersion=32; delete save.progress.timeAttack; save.progress.cumulativeStats.highestStageCleared=10; save.progress.cumulativeStats.stage10Clears=1; localStorage.setItem(key,JSON.stringify(save)); return true; })()
        """)
        check(results, "v6.0-fixture-created", save32 is True)
        page.reload(wait_until="domcontentloaded", timeout=30000)
        page.wait_for_function("Boolean(window.cqV6TestApi)", timeout=15000)
        migrated = snapshot(page)
        check(results, "v6.0-clear-auto-unlocks-time-attack", migrated["timeAttackProfile"]["unlocked"] and page.evaluate("JSON.parse(localStorage.getItem(window.gameData.saveKey)).saveVersion") == 33, migrated["timeAttackProfile"])

        page.evaluate("cqV6TestApi.enterStage10({testCoins:5000,unlockUnits:true})")
        for cycle in range(4):
            page.evaluate("cqV6TestApi.clearField()")
            page.evaluate("cqV6TestApi.spawnAlly('aluminumGuardAlly9',{x:700,hpRatio:.7})")
            page.evaluate("cqV6TestApi.spawnAu({formation:true,x:1000})")
            page.evaluate("cqV6TestApi.step(7.7)")
            page.evaluate("cqV6TestApi.enterStage10({testCoins:5000,unlockUnits:true})")
        page.evaluate("cqV6TestApi.enterStage10({testCoins:0,unlockUnits:false})")
        page.wait_for_timeout(500)
        cleaned = snapshot(page)
        check(
            results,
            "reentry-cleans-effects-and-prior-audio",
            cleaned["visualCounts"]["combatEffects"] == 0
            and cleaned["visualCounts"]["impactBursts"] == 0
            and cleaned["visualCounts"]["projectiles"] == 0
            and cleaned["visualCounts"]["audioNodesActive"] <= 3,
            {**cleaned["visualCounts"], "note": "up to three nodes are the new Wave 1 entry chord, not prior-stage residue"},
        )
        context.close()

        # Isolate rendering performance from the reload/migration stress above.
        performance_context = browser.new_context(viewport={"width": 1365, "height": 900})
        performance_context.add_init_script("localStorage.setItem('chemionQuestOnlinePromptV13','1');")
        performance_page = performance_context.new_page()
        performance_page.on("pageerror", lambda error: errors.append(str(error)))
        performance_page.goto(f"{base_url}?cqTest=1", wait_until="domcontentloaded", timeout=30000)
        performance_page.wait_for_function("Boolean(window.cqV6TestApi)", timeout=15000)
        performance_page.wait_for_timeout(700)
        performance_page.evaluate("cqV6TestApi.enterStage10({testCoins:5000,unlockUnits:true}); cqV6TestApi.clearField()")
        # Eight simultaneous allies is the representative late-stage formation load.
        for index in range(8):
            unit = "aluminumGuardAlly9" if index % 2 == 0 else "ironSplashAlly9"
            performance_page.evaluate("([unit,index])=>cqV6TestApi.spawnAlly(unit,{x:180+index*24,y:250+(index%3)*42,hpRatio:.8})", [unit, index])
        # Measure the heaviest protected formation sequence.  Keeping Au protected
        # prevents the benchmark from falling into the intentional 10 fps idle
        # loop after the high-level test army defeats it.
        performance_page.evaluate("cqV6TestApi.spawnAu({formation:true,x:900}); cqV6TestApi.resetPerformanceMetrics()")
        frame_benchmark = performance_page.evaluate("cqV6TestApi.benchmarkFrames(60)")
        metrics = performance_page.evaluate("cqV6TestApi.performanceSnapshot()")
        performance_state = snapshot(performance_page)
        configured_fps = performance_state["renderFps"]
        check(results, "stage10-configured-60fps-target", configured_fps == 60, {"configuredFps": configured_fps, "state": performance_state})
        check(
            results,
            "stage10-frame-processing-within-60fps-budget",
            frame_benchmark["averageFrameMs"] <= (1000 / 60) and frame_benchmark["maxFrameMs"] < 150,
            {"frameBenchmark": frame_benchmark, "schedulerReference": metrics},
        )
        performance_context.close()

        profiles = [
            ("iPhone Safari/PWA相当 320 portrait", 320, 568, "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1", "reduce"),
            ("iPhone Safari/PWA相当 390 portrait", 390, 844, "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1", "no-preference"),
            ("iPhone landscape相当", 844, 390, "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1", "reduce"),
            ("Android Chrome相当 375 portrait", 375, 812, "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36", "no-preference"),
            ("Android landscape相当", 812, 375, "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36", "reduce"),
            ("PC Chrome相当", 1365, 900, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36", "no-preference"),
        ]
        layout_records = []
        for label, width, height, user_agent, reduced in profiles:
            device_context = browser.new_context(viewport={"width": width, "height": height}, user_agent=user_agent, reduced_motion=reduced)
            device_context.add_init_script("localStorage.setItem('chemionQuestOnlinePromptV13','1');")
            device_page = device_context.new_page()
            device_page.goto(f"{base_url}?cqTest=1", wait_until="domcontentloaded", timeout=30000)
            device_page.wait_for_function("Boolean(window.cqV6TestApi)", timeout=15000)
            layout = device_page.evaluate("""
              ({ overflow: document.documentElement.scrollWidth > window.innerWidth,
                 width: window.innerWidth, height: window.innerHeight,
                 version: document.querySelector('header h1')?.textContent,
                 timeAttackUi: Boolean(document.getElementById('timeAttackStartBtn')),
                 reduced: matchMedia('(prefers-reduced-motion: reduce)').matches })
            """)
            layout["profile"] = label
            layout_records.append(layout)
            device_context.close()
        check(results, "device-equivalent-responsive-matrix", all(not item["overflow"] and item["version"] == "Chemion Quest v6.1" and item["timeAttackUi"] for item in layout_records), layout_records)
        check(results, "reduced-motion-matrix", sum(1 for item in layout_records if item["reduced"]) == 3, layout_records)

        low_context = browser.new_context(viewport={"width": 390, "height": 844})
        low_context.add_init_script("localStorage.setItem('chemionQuestOnlinePromptV13','1'); localStorage.setItem('chemionQuestLowPowerV1','on');")
        low_page = low_context.new_page()
        low_page.goto(f"{base_url}?cqTest=1", wait_until="domcontentloaded", timeout=30000)
        low_page.wait_for_function("Boolean(window.cqV6TestApi)", timeout=15000)
        low_page.wait_for_timeout(700)
        low_page.evaluate("cqV6TestApi.enterStage10(); cqV6TestApi.resetPerformanceMetrics()")
        low_frame_benchmark = low_page.evaluate("cqV6TestApi.benchmarkFrames(60,1/30)")
        low_metrics = low_page.evaluate("cqV6TestApi.performanceSnapshot()")
        low_snapshot = snapshot(low_page)
        check(
            results,
            "low-power-stage10-target",
            low_snapshot["renderFps"] == 30 and low_frame_benchmark["averageFrameMs"] <= (1000 / 30) and low_snapshot["desiredBgmTrackKey"] == "milestoneV3",
            {"frameBenchmark": low_frame_benchmark, "schedulerReference": low_metrics, "state": {"renderFps": low_snapshot["renderFps"], "desiredBgmTrackKey": low_snapshot["desiredBgmTrackKey"], "paused": low_snapshot["paused"]}},
        )
        low_context.close()

        browser.close()

    check(results, "no-page-errors", not errors, errors)
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "browser": "Chrome/Chromium engine; iPhone Safari/PWA and Android Chrome are equivalent viewport/user-agent checks",
        "passed": all(item["passed"] for item in results),
        "tests": results,
    }
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"v6.1 time-attack browser tests passed ({len(results)}/{len(results)}): {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
