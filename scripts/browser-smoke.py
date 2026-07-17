#!/usr/bin/env python3
"""Chromium smoke test using in-memory HTML; no network or local file navigation."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]

def main():
    html=(ROOT/'index.html').read_text(encoding='utf-8')
    version=json.loads((ROOT/'config/release.json').read_text(encoding='utf-8'))['version']
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
        context=browser.new_context(reduced_motion='reduce')
        page=context.new_page()
        page.route('**/*',lambda route: route.abort() if route.request.url.startswith('https://') else route.continue_())
        page.goto('about:blank')
        page.evaluate("""
          (() => {
            const store = new Map([
              ['chemionQuestNicknameV13','SmokeTester'],
              ['chemionQuestOnlinePromptV13','1']
            ]);
            const memoryStorage = {
              getItem: key => store.has(String(key)) ? store.get(String(key)) : null,
              setItem: (key,value) => store.set(String(key),String(value)),
              removeItem: key => store.delete(String(key)),
              clear: () => store.clear(),
              key: index => [...store.keys()][index] ?? null,
              get length(){ return store.size; }
            };
            Object.defineProperty(window,'localStorage',{value:memoryStorage,configurable:true});
            window.alert=()=>{};
            window.confirm=()=>true;
          })();
        """)
        errors=[]
        page.on('pageerror',lambda err: errors.append(str(err)))
        page.set_content(html,wait_until='domcontentloaded',timeout=30000)
        page.wait_for_selector('header h1',timeout=15000)
        assert f'v{version}' in page.locator('header h1').inner_text()
        counts=page.evaluate("({basic:gameData.quiz.length,hard:gameData.hardQuiz.length,mock:gameData.mockExams.length,sub:gameData.mockExams.reduce((n,e)=>n+e.questions.length,0),save:gameData.version})")
        assert counts=={'basic':480,'hard':250,'mock':8,'sub':40,'save':31},counts
        chemistry=page.evaluate("""
          (() => {
            const acetate=gameData.enemies.find(x=>x.id==='aceticAcid');
            const stage3Boss=gameData.stage3.enemies.find(x=>x.id==='hypochlorousBoss');
            const stage5Boss=gameData.stage5.enemies.find(x=>x.id==='hydrogenPeroxideBoss5');
            return {
              acetateFormula:acetate?.formula,
              acetateName:acetate?.name,
              acetateTarget:acetate?.affinityTarget,
              acetateReaction:acetate?.liberationReaction,
              stage3Formula:stage3Boss?.formula,
              stage3Reaction:stage3Boss?.phaseTwo?.transformText,
              stage5Class:stage5Boss?.chemistryClass,
              stage5Target:stage5Boss?.affinityTarget || null
            };
          })()
        """)
        assert chemistry=={
          'acetateFormula':'CH₃COO⁻','acetateName':'酢酸イオン',
          'acetateTarget':'weak_acid_conjugate_base',
          'acetateReaction':'CH₃COO⁻ + H⁺ → CH₃COOH',
          'stage3Formula':'ClO⁻',
          'stage3Reaction':'還元反応：ClO⁻ + 2H⁺ + 2e⁻ → Cl⁻ + H₂O',
          'stage5Class':'redox','stage5Target':None
        },chemistry
        guide_text=page.locator('#guideModal').inner_text()
        assert '中和によるダメージ倍率の変化はありません' in guide_text
        assert '弱酸・弱塩基そのものには遊離補正なし' in guide_text
        if page.locator('#guideModal').is_visible(): page.locator('#guideStartBtn').click()
        if page.locator('#profileModal').is_visible(): page.locator('#profileCancelBtn').click()
        if page.locator('#tutorialOverlay').is_visible(): page.locator('#tutorialSkipBtn').click()
        page.wait_for_timeout(100)
        page.locator('#pauseBtn').click()
        page.wait_for_selector('#pauseModal:not([hidden])',timeout=5000)
        assert page.locator('#pauseRestartBtn').is_visible()
        assert page.locator('[data-settings-view="mock"]').count()==1
        assert page.locator('#pwaUpdateLaterBtn').count()==0
        assert page.locator('#bossArrivalFx').count()==1
        assert page.locator('#bossArrivalName').count()==1
        assert page.locator('#bossPhaseFx').count()==1
        assert page.locator('#bossPhaseFrom').count()==1
        assert page.locator('#bossPhaseTo').count()==1

        # Verify v4.45 old-save repair and cooldown/UI synchronization.
        page.locator('#resumeBattleBtn').click()
        v44_save = page.evaluate("""
          (() => {
            const save = JSON.parse(localStorage.getItem(gameData.saveKey));
            save.currentStageId = 1;
            save.progress.onboardingSeen = true;
            save.progress.tutorialSeen = true;
            save.progress.cumulativeStats.highestStageReached = 5;
            save.progress.cumulativeStats.highestStageCleared = 5;
            save.progress.cumulativeStats.stage5Clears = 0;
            save.progress.achievementState.stage5_unlocked = {unlocked:false,unlockedAt:null};
            save.progress.achievementState.stage5_clear = {unlocked:false,unlockedAt:null};
            save.battle.gameStatus = 'playing';
            save.battle.manualPaused = false;
            save.battle.resumePrompt = false;
            save.battle.pauseReason = 'manual';
            save.battle.energy = 100;
            save.battle.summonTimers = {...(save.battle.summonTimers||{}), ammonium:0.15};
            return JSON.stringify(save);
          })();
        """)
        page.close()
        page=context.new_page()
        page.route('**/*',lambda route: route.abort() if route.request.url.startswith('https://') else route.continue_())
        page.goto('about:blank')
        page.evaluate("""
          (seed) => {
            const store = new Map([
              ['chemionQuestNicknameV13','SmokeTester'],
              ['chemionQuestOnlinePromptV13','1'],
              ['chemionQuestSaveV4',seed]
            ]);
            const memoryStorage = {
              getItem: key => store.has(String(key)) ? store.get(String(key)) : null,
              setItem: (key,value) => store.set(String(key),String(value)),
              removeItem: key => store.delete(String(key)),
              clear: () => store.clear(),
              key: index => [...store.keys()][index] ?? null,
              get length(){ return store.size; }
            };
            Object.defineProperty(window,'localStorage',{value:memoryStorage,configurable:true});
            window.alert=()=>{};
            window.confirm=()=>true;
          }
        """, v44_save)
        page.on('pageerror',lambda err: errors.append(str(err)))
        page.set_content(html,wait_until='domcontentloaded',timeout=30000)
        page.wait_for_selector('#units .unit-button',timeout=5000)
        page.wait_for_function("document.querySelector('#units .unit-button .unit-state')?.textContent === '召喚問題に挑戦可能'",timeout=3000)
        page.locator('#achievementBtn').click()
        page.wait_for_selector('#achievementModal:not([hidden])',timeout=3000)
        stage5_card=page.locator('.achievement-card',has_text='五つの研究区を制覇')
        assert stage5_card.count()==1
        assert 'unlocked' in (stage5_card.get_attribute('class') or '')
        repaired=page.evaluate("JSON.parse(localStorage.getItem(gameData.saveKey)).progress.cumulativeStats.stage5Clears")
        assert repaired>=1,repaired
        page.locator('#achievementCloseBtn').click()

        # Build a deterministic Stage 3 save with the first-form boss at 0 HP.
        # Use a fresh page so the previous page's requestAnimationFrame loop cannot
        # touch the replacement DOM during this sequence test.
        phase_save = page.evaluate("""
          (() => {
            const save = JSON.parse(localStorage.getItem(gameData.saveKey));
            save.currentStageId = 3;
            save.progress.onboardingSeen = true;
            save.progress.tutorialSeen = true;
            save.progress.cumulativeStats.highestStageReached = 3;
            save.battle.gameStatus = 'playing';
            save.battle.manualPaused = false;
            save.battle.resumePrompt = false;
            save.battle.pauseReason = 'manual';
            save.battle.energy = 80;
            save.battle.allies = [];
            save.battle.enemies = [{
              typeId: 'hypochlorousBoss', x: 700, y: 298, hp: 0,
              attackTimer: 0, waveIndex: 9, visualSerial: 1,
              firstStrikeReady: false, bossPhase: 1
            }];
            save.battle.wave = {
              currentWaveIndex: 9, nextWaveEnemyIndex: 11,
              wavePhase: 'fighting', waveTimer: 0,
              waveSpawnTimer: 0, waveBannerTimer: 0,
              waveMilestoneClaims: [1,3,6,9], allySpawnSerial: 0,
              enemySpawnSerial: 1, finalBaseMessageShown: false,
              endlessMode: false, endlessWaveTimer: 30, endlessWaveNumber: 0
            };
            return JSON.stringify(save);
          })();
        """)
        page.close()
        page=context.new_page()
        page.route('**/*',lambda route: route.abort() if route.request.url.startswith('https://') else route.continue_())
        page.goto('about:blank')
        page.evaluate("""
          (seed) => {
            const store = new Map([
              ['chemionQuestNicknameV13','SmokeTester'],
              ['chemionQuestOnlinePromptV13','1'],
              ['chemionQuestSaveV4',seed]
            ]);
            const memoryStorage = {
              getItem: key => store.has(String(key)) ? store.get(String(key)) : null,
              setItem: (key,value) => store.set(String(key),String(value)),
              removeItem: key => store.delete(String(key)),
              clear: () => store.clear(),
              key: index => [...store.keys()][index] ?? null,
              get length(){ return store.size; }
            };
            Object.defineProperty(window,'localStorage',{value:memoryStorage,configurable:true});
            window.alert=()=>{};
            window.confirm=()=>true;
          }
        """, phase_save)
        page.on('pageerror',lambda err: errors.append(str(err)))
        page.set_content(html,wait_until='domcontentloaded',timeout=30000)
        page.wait_for_selector('#bossPhaseFx:not([hidden])',timeout=5000)
        assert page.locator('#pauseBtn').is_disabled()
        assert page.locator('#bossPhaseFrom').inner_text() == 'ClO⁻'
        assert page.locator('#bossPhaseTo').inner_text() == 'Cl⁻'
        frozen_time=page.locator('#gameTime').inner_text()
        page.wait_for_timeout(500)
        assert page.locator('#gameTime').inner_text() == frozen_time
        page.wait_for_selector('#bossArrivalFx:not([hidden])',timeout=5000)
        assert 'Cl⁻' in page.locator('#bossArrivalName').inner_text()
        page.wait_for_function("document.getElementById('bossPhaseFx').hidden && document.getElementById('bossArrivalFx').hidden && !document.getElementById('pauseBtn').disabled",timeout=7000)

        fatal=[e for e in errors if 'Failed to fetch dynamically imported module' not in e and 'Importing a module script failed' not in e and 'ServiceWorker' not in e]
        if fatal: raise AssertionError(f'page errors: {fatal}')
        browser.close()
    print('Browser smoke test passed (Chromium: boot, counts, guide, pause/restart UI, v4.45 cooldown sync, Stage 5 achievement repair, full Stage 3 phase-transition sequence, mandatory-update UI).')
if __name__=='__main__': main()
