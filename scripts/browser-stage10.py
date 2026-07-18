#!/usr/bin/env python3
"""Real-browser integration checks for the v6.0 Stage 10 runtime."""
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
OUTPUT = ROOT / "docs" / "BROWSER_STAGE10_RESULTS.json"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, _format: str, *_args) -> None:
        return


class QuietServer(ThreadingHTTPServer):
    def handle_error(self, _request, _client_address) -> None:
        return


@contextmanager
def local_site():
    handler = partial(QuietHandler, directory=str(ROOT))
    server = QuietServer(("127.0.0.1", 0), handler)
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


def snap(page):
    return page.evaluate("window.cqV6TestApi.snapshot()")


def au_from(snapshot):
    return next(enemy for enemy in snapshot["enemies"] if enemy["auBoss"])


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
        browser = playwright.chromium.launch(headless=True, executable_path=executable, args=["--no-sandbox"])
        context = browser.new_context(viewport={"width": 1365, "height": 900}, reduced_motion="reduce")
        context.add_init_script("""
          try {
            localStorage.setItem('chemionQuestNicknameV13', 'Stage10Tester');
            localStorage.setItem('chemionQuestOnlinePromptV13', '1');
          } catch (_) {}
        """)
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(f"{base_url}?cqTest=1", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_function("Boolean(window.cqV6TestApi)", timeout=15000)

        layout = page.evaluate("""
          ({ version: document.querySelector('header h1')?.textContent,
             overflow: document.documentElement.scrollWidth > window.innerWidth,
             stage10Panel: Boolean(document.getElementById('aquaRegiaPanel')) })
        """)
        check(results, "desktop-layout", layout["version"] == "Chemion Quest v6.0" and not layout["overflow"] and layout["stage10Panel"], layout)
        page.set_viewport_size({"width": 390, "height": 844})
        mobile = page.evaluate("""
          ({ overflow: document.documentElement.scrollWidth > window.innerWidth,
             minButtonHeight: Math.min(...Array.from(document.querySelectorAll('button'))
               .map(node => node.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0)
               .map(rect => rect.height)) })
        """)
        check(results, "mobile-layout", not mobile["overflow"] and mobile["minButtonHeight"] >= 44, mobile)
        page.set_viewport_size({"width": 1365, "height": 900})

        page.evaluate("cqV6TestApi.enterStage10()")
        page.evaluate("cqV6TestApi.setPaused(true)")
        initial = snap(page)
        check(results, "stage10-logical-scale", initial["stage"] == 10 and initial["logicalScale"] == 1.3 and initial["canvasEnemyX"] < initial["logicalEnemyX"], initial)

        page.evaluate("cqV6TestApi.setAquaProgress({unlocked:true,level:3,contactComplete:false})")
        page.evaluate("cqV6TestApi.prepareMaterialFormation()")
        transaction = page.evaluate("""
          (() => {
            cqV6TestApi.step(1.2);
            const stable=cqV6TestApi.snapshot();
            cqV6TestApi.beginPreparation();
            return {stable,preparing:cqV6TestApi.snapshot()};
          })()
        """)
        stable = transaction["stable"]
        check(results, "aqua-regia-stable-candidate", len(stable["stage10"]["candidateKeys"]) == 4 and stable["stage10"]["stableSeconds"] >= 1, stable["stage10"])
        preparing = transaction["preparing"]
        check(results, "preparation-transaction-started", preparing["stage10"]["preparation"] is not None and len(preparing["allies"]) == 4, preparing["stage10"])
        check(results, "preparation-no-extra-energy", preparing["energy"] == stable["energy"], {"before": stable["energy"], "after": preparing["energy"]})
        check(results, "save-during-preparation", page.evaluate("cqV6TestApi.saveNow()") is True)
        page.reload(wait_until="domcontentloaded", timeout=30000)
        page.wait_for_function("Boolean(window.cqV6TestApi)", timeout=15000)
        page.evaluate("cqV6TestApi.setPaused(true)")
        resumed = snap(page)
        check(results, "preparation-restored-or-completed", resumed["stage"] == 10 and (resumed["stage10"]["preparation"] is not None or any(unit["aquaRegia"] for unit in resumed["allies"])), resumed["stage10"])
        page.evaluate("cqV6TestApi.step(2.2)")
        prepared = snap(page)
        aqua = [unit for unit in prepared["allies"] if unit["aquaRegia"]]
        materials = [unit for unit in prepared["allies"] if unit["typeId"] in ["nitricAcidAlly5", "hydrochloricAcidAlly6"]]
        check(results, "preparation-exactly-once", len(aqua) == 1 and len(materials) == 0 and prepared["stage10"]["preparation"] is None, {"aqua": len(aqua), "materials": len(materials)})
        check(results, "preparation-average-hp-ratio", abs(aqua[0]["hp"] / aqua[0]["maxHp"] - 0.65) <= 0.01, {"hp": aqua[0]["hp"], "maxHp": aqua[0]["maxHp"]})
        page.evaluate("cqV6TestApi.beginPreparation()")
        check(results, "aqua-regia-max-one", sum(1 for unit in snap(page)["allies"] if unit["aquaRegia"]) == 1)

        page.evaluate("cqV6TestApi.enterStage10()")
        page.evaluate("cqV6TestApi.setPaused(true)")
        page.evaluate("cqV6TestApi.clearField()")
        page.evaluate("cqV6TestApi.spawnAlly('aluminumGuardAlly9',{x:700,hpRatio:.62})")
        page.evaluate("cqV6TestApi.spawnAlly('waterHealerAlly9',{x:620,hpRatio:.73})")
        before_formation = snap(page)
        page.evaluate("cqV6TestApi.addProjectile('ally','attack')")
        page.evaluate("cqV6TestApi.addProjectile('enemy','attack')")
        page.evaluate("cqV6TestApi.addProjectile('ally','heal')")
        page.evaluate("cqV6TestApi.spawnAu({formation:true,x:1000})")
        forming = snap(page)
        projectile_pairs = sorted((item["ownerKind"], item["effectKind"]) for item in forming["projectiles"])
        check(results, "au-formation-removes-only-friendly-attacks", ("ally", "attack") not in projectile_pairs and ("ally", "heal") in projectile_pairs and ("enemy", "attack") in projectile_pairs, projectile_pairs)
        check(results, "au-formation-preserves-allies", [round(unit["hp"] / unit["maxHp"], 2) for unit in forming["allies"]] == [round(unit["hp"] / unit["maxHp"], 2) for unit in before_formation["allies"]], forming["allies"])
        page.evaluate("cqV6TestApi.step(3.25)")
        protected = snap(page)
        check(results, "au-visible-protection-phase", protected["stage10"]["phase"] == "protected" and au_from(protected)["stage10Protected"], {"stage10": protected["stage10"], "au": au_from(protected)})
        page.evaluate("cqV6TestApi.step(3.1)")
        combat = snap(page)
        check(results, "au-v16-combat-start", combat["stage10"]["phase"] == "combat" and combat["desiredBgmTrackKey"] == "au" and not au_from(combat)["stage10Protected"], {"stage10": combat["stage10"], "track": combat["desiredBgmTrackKey"]})
        damage = page.evaluate("({chemical:cqV6TestApi.damageProbe('chemical',100),physical:cqV6TestApi.damageProbe('physical',100),aqua:cqV6TestApi.damageProbe('aqua_regia',100)})")
        check(results, "au-damage-routing", damage == {"chemical": 20, "physical": 100, "aqua": 100}, damage)

        page.evaluate("cqV6TestApi.enterStage10()")
        page.evaluate("cqV6TestApi.setPaused(true)")
        page.evaluate("cqV6TestApi.clearField()")
        page.evaluate("cqV6TestApi.setAquaProgress({unlocked:true,level:3,contactComplete:false})")
        page.evaluate("cqV6TestApi.spawnAu({formation:false,x:450})")
        page.evaluate("cqV6TestApi.spawnAlly('aquaRegiaAlly10',{x:400,hpRatio:1})")
        page.evaluate("cqV6TestApi.step(.1)")
        contact = snap(page)
        check(results, "first-contact-freezes-before-damage", contact["stage10"]["contactStarted"] and not contact["stage10"]["contactComplete"] and au_from(contact)["hp"] == 10000, contact["stage10"])
        page.evaluate("cqV6TestApi.step(.8)")
        page.evaluate("cqV6TestApi.step(1.5)")
        after_hits = snap(page)
        check(results, "aqua-regia-six-time-split-hits", au_from(after_hits)["hp"] == 9904, {"hp": au_from(after_hits)["hp"], "multiHit": next(unit for unit in after_hits["allies"] if unit["aquaRegia"]).get("multiHit")})
        check(results, "first-contact-persistent", after_hits["aquaAuContactComplete"] is True)
        page.evaluate("cqV6TestApi.saveNow()")
        page.reload(wait_until="domcontentloaded", timeout=30000)
        page.wait_for_function("Boolean(window.cqV6TestApi)", timeout=15000)
        page.evaluate("cqV6TestApi.setPaused(true)")
        check(results, "first-contact-restored", snap(page)["aquaAuContactComplete"] is True)

        page.evaluate("cqV6TestApi.enterStage10()")
        page.evaluate("cqV6TestApi.setPaused(true)")
        page.evaluate("cqV6TestApi.clearField()")
        page.evaluate("cqV6TestApi.setAquaProgress({unlocked:true,level:10,contactComplete:true})")
        page.evaluate("cqV6TestApi.spawnAu({formation:false,x:450})")
        page.evaluate("cqV6TestApi.setAuHp(1)")
        page.evaluate("cqV6TestApi.spawnAlly('aquaRegiaAlly10',{x:400,hpRatio:1})")
        enemy_base_before = snap(page)["enemyBaseHp"]
        page.evaluate("cqV6TestApi.step(.25)")
        victory_phase = snap(page)
        check(results, "au-defeat-starts-victory", victory_phase["stage10"]["phase"] == "victory" and victory_phase["enemyBaseHp"] == enemy_base_before, victory_phase)
        page.evaluate("cqV6TestApi.step(1.7)")
        victory = snap(page)
        check(results, "stage10-victory-without-base-destruction", victory["gameStatus"] == "victory" and victory["enemyBaseHp"] > 0, victory)

        page.evaluate("cqV6TestApi.enterStage10(); cqV6TestApi.setPaused(true); cqV6TestApi.saveNow()")
        page.evaluate("""
          (() => {
            const key=gameData.saveKey, save=JSON.parse(localStorage.getItem(key));
            save.saveVersion=31; save.currentStageId=9;
            save.progress.cumulativeStats.highestStageCleared=9;
            save.progress.cumulativeStats.highestStageReached=9;
            save.progress.cumulativeStats.stage9Clears=0;
            save.progress.guestAssistEnabled=false; save.progress.guestAssistUsed=true;
            delete save.stageProgress['10']; save.battle.stage10=null;
            localStorage.setItem(key,JSON.stringify(save));
          })()
        """)
        page.evaluate("cqV6TestApi.loadNow()")
        migrated_595 = snap(page)
        check(results, "v5.95-save-direct-migration", migrated_595["stage"] == 9 and migrated_595["highestStageReached"] == 10 and migrated_595["guestAssistUsed"] is True and migrated_595["cumulativeStats"]["stage9Clears"] >= 1, migrated_595)

        page.evaluate("cqV6TestApi.saveNow()")
        page.evaluate("""
          (() => {
            const key=gameData.saveKey, save=JSON.parse(localStorage.getItem(key));
            save.saveVersion=26; save.currentStageId=1; save.progress.coins=432;
            save.progress.cumulativeStats.highestStageCleared=5;
            save.progress.cumulativeStats.highestStageReached=6;
            save.progress.cumulativeStats.stage5Clears=0;
            delete save.progress.guestAssistEnabled; delete save.progress.guestAssistUsed;
            delete save.stageProgress['10']; save.battle.stage10=null;
            localStorage.setItem(key,JSON.stringify(save));
          })()
        """)
        page.evaluate("cqV6TestApi.loadNow()")
        migrated_50 = snap(page)
        check(results, "v5.0-save-direct-migration", migrated_50["stage"] == 1 and migrated_50["coins"] == 432 and migrated_50["highestStageCleared"] == 5 and migrated_50["cumulativeStats"]["stage5Clears"] >= 1 and migrated_50["guestAssistUsed"] is False, migrated_50)

        page.evaluate("""
          (async () => {
            const regs=await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map(reg=>reg.unregister()));
            await caches.open('chemimon-quest-shell-v5.95');
          })()
        """)
        page.reload(wait_until="domcontentloaded", timeout=30000)
        page.wait_for_function("navigator.serviceWorker.ready.then(()=>true)", timeout=20000)
        pwa = page.evaluate("""
          (async () => {
            const names=await caches.keys();
            const shell=await caches.open('chemimon-quest-shell-v6.0');
            const boss=await shell.match('./assets/audio/chemion-stage10-au-boss-v16-loop.mp3');
            return {names,bossCached:Boolean(boss)};
          })()
        """)
        check(results, "pwa-v5.95-cache-upgrade", "chemimon-quest-shell-v5.95" not in pwa["names"] and "chemimon-quest-shell-v6.0" in pwa["names"] and pwa["bossCached"], pwa)

        browser.close()

    check(results, "no-page-errors", not errors, errors)
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "browser": "Chromium",
        "passed": all(item["passed"] for item in results),
        "tests": results,
        "pageErrors": errors,
    }
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Stage 10 browser integration passed ({len(results)}/{len(results)}): {OUTPUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
