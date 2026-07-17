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
        assert counts=={'basic':520,'hard':280,'mock':8,'sub':40,'save':31},counts
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
        stage6=page.evaluate("""
          (() => ({
            id:gameData.stage6?.id,
            units:gameData.stage6?.units?.length,
            fifth:gameData.stage6?.units?.[4]?.chemistryClass,
            enemies:gameData.stage6?.enemies?.length,
            allWeak:gameData.stage6?.enemies?.every(x=>x.affinityTarget==='weak_acid_conjugate_base'),
            bossPool:gameData.stage6?.enemies?.find(x=>x.boss)?.bossSummonPool?.length,
            selfDamage:JSON.stringify(gameData).includes('selfDamagePerSecond')
          }))()
        """)
        assert stage6=={'id':6,'units':5,'fifth':'strong_acid','enemies':9,'allWeak':True,'bossPool':3,'selfDamage':False},stage6
        stage7=page.evaluate("""
          (() => ({
            id:gameData.stage7?.id,
            units:gameData.stage7?.units?.length,
            fifth:gameData.stage7?.units?.[4]?.chemistryClass,
            enemies:gameData.stage7?.enemies?.length,
            allWeak:gameData.stage7?.enemies?.every(x=>x.affinityTarget==='weak_base_conjugate_acid'),
            bossPool:gameData.stage7?.enemies?.find(x=>x.boss)?.bossSummonPool?.length
          }))()
        """)
        assert stage7=={'id':7,'units':5,'fifth':'strong_base','enemies':9,'allWeak':True,'bossPool':3},stage7
        stage8=page.evaluate("""
          (() => {
            const stage=gameData.stage8;
            const boss=stage?.enemies?.find(x=>x.boss);
            const assault=[gameData.units,gameData.stage2?.units,gameData.stage3?.units,gameData.stage4?.units,gameData.stage5?.units,gameData.stage6?.units,gameData.stage7?.units,stage?.units].flat().filter(x=>String(x?.role||'').includes('強襲'));
            return {id:stage?.id,waves:stage?.waves?.length,bossHp:boss?.hp,bossSpeed:boss?.speed,wipe:boss?.wipeAlliesOnArrival,phase:Boolean(boss?.phaseTwo),maxAssault:Math.max(...assault.map(x=>x.speed||0)),maxEnergy:gameData.maxEnergy+gameData.energyCapacityPerLevel*(gameData.maxEnergyCapacityLevel-1)};
          })()
        """)
        assert stage8=={'id':8,'waves':11,'bossHp':420,'bossSpeed':60,'wipe':True,'phase':False,'maxAssault':50,'maxEnergy':265},stage8
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
        repaired_stats=page.evaluate("JSON.parse(localStorage.getItem(gameData.saveKey)).progress.cumulativeStats")
        assert repaired_stats['stage5Clears']>=1,repaired_stats
        assert repaired_stats['highestStageReached']>=6,repaired_stats
        migrated_stage7=page.evaluate("""
          (() => {
            const save=JSON.parse(localStorage.getItem(gameData.saveKey));
            save.progress.cumulativeStats.highestStageCleared=6;
            save.progress.cumulativeStats.highestStageReached=6;
            save.progress.cumulativeStats.stage6Clears=0;
            localStorage.setItem(gameData.saveKey,JSON.stringify(save));
            return true;
          })()
        """)
        assert migrated_stage7
        page.locator('#achievementCloseBtn').click()
        page.locator('#stageBtn').click()
        page.wait_for_selector('#stageModal:not([hidden])',timeout=3000)
        stage6_card=page.locator('.stage-card',has_text='STAGE 6')
        assert stage6_card.count()==1
        assert 'locked' not in (stage6_card.get_attribute('class') or '')
        page.locator('#stageCloseBtn').click()

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

        # Verify the Stage 6 BOSS telegraphs and summons 2–3 minions.
        summon_save = page.evaluate("""
          (() => {
            const save = JSON.parse(localStorage.getItem(gameData.saveKey));
            save.currentStageId = 6;
            save.progress.onboardingSeen = true;
            save.progress.tutorialSeen = true;
            save.progress.cumulativeStats.highestStageReached = 6;
            save.progress.cumulativeStats.highestStageCleared = 5;
            save.battle.gameStatus = 'playing';
            save.battle.manualPaused = false;
            save.battle.resumePrompt = false;
            save.battle.pauseReason = 'manual';
            save.battle.energy = 80;
            save.battle.allies = [];
            save.battle.enemies = [{
              typeId: 'phosphateBoss6', x: 690, y: 298, hp: 1200,
              attackTimer: 5, waveIndex: 9, visualSerial: 1,
              firstStrikeReady: false, bossPhase: 1,
              bossSummonTimer: 0.1, bossSummonPending: false,
              bossSummonPendingTimer: 0
            }];
            save.battle.wave = {
              currentWaveIndex: 9, nextWaveEnemyIndex: 7,
              wavePhase: 'fighting', waveTimer: 0,
              waveSpawnTimer: 999, waveBannerTimer: 0,
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
        """, summon_save)
        page.on('pageerror',lambda err: errors.append(str(err)))
        page.set_content(html,wait_until='domcontentloaded',timeout=30000)
        page.wait_for_function("document.getElementById('battleMessage').textContent.includes('増援として出現')",timeout=6000)
        assert '弱酸群集反応' in page.locator('#battleMessage').inner_text()

        # Verify the Stage 7 BOSS uses the weak-base summon label and spawns minions.
        summon7_save = page.evaluate("""
          (() => {
            const save = JSON.parse(localStorage.getItem(gameData.saveKey));
            save.currentStageId = 7;
            save.progress.onboardingSeen = true;
            save.progress.tutorialSeen = true;
            save.progress.cumulativeStats.highestStageReached = 7;
            save.progress.cumulativeStats.highestStageCleared = 6;
            save.battle.gameStatus = 'playing';
            save.battle.manualPaused = false;
            save.battle.resumePrompt = false;
            save.battle.pauseReason = 'manual';
            save.battle.energy = 80;
            save.battle.allies = [];
            save.battle.enemies = [{
              typeId: 'hydraziniumBoss7', x: 690, y: 298, hp: 1200,
              attackTimer: 5, waveIndex: 9, visualSerial: 1,
              firstStrikeReady: false, bossPhase: 1,
              bossSummonTimer: 0.1, bossSummonPending: false,
              bossSummonPendingTimer: 0
            }];
            save.battle.wave = {
              currentWaveIndex: 9, nextWaveEnemyIndex: 7,
              wavePhase: 'fighting', waveTimer: 0,
              waveSpawnTimer: 999, waveBannerTimer: 0,
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
        """, summon7_save)
        page.on('pageerror',lambda err: errors.append(str(err)))
        page.set_content(html,wait_until='domcontentloaded',timeout=30000)
        page.wait_for_function("document.getElementById('battleMessage').textContent.includes('増援として出現')",timeout=6000)
        assert '弱塩基群集反応' in page.locator('#battleMessage').inner_text()


        # Verify Stage 8 freezes battle, wipes every ally, replays the boss arrival effect, then resumes.
        ambush_save = page.evaluate("""
          (() => {
            const save = JSON.parse(localStorage.getItem(gameData.saveKey));
            save.currentStageId = 8;
            save.progress.onboardingSeen = true;
            save.progress.tutorialSeen = true;
            save.progress.energyCapacityLevel = 3;
            save.progress.cumulativeStats.highestStageReached = 8;
            save.progress.cumulativeStats.highestStageCleared = 7;
            save.battle.gameStatus = 'playing';
            save.battle.manualPaused = false;
            save.battle.resumePrompt = false;
            save.battle.pauseReason = 'manual';
            save.battle.energy = 130;
            save.battle.allies = [
              {typeId:'ironTwoInfantryAlly8',x:260,y:298,hp:120,attackTimer:0,waveIndex:9,visualSerial:1,firstStrikeReady:false,bossPhase:1},
              {typeId:'zincGuardAlly8',x:340,y:298,hp:500,attackTimer:0,waveIndex:9,visualSerial:2,firstStrikeReady:false,bossPhase:1},
              {typeId:'iodideArcherAlly8',x:220,y:298,hp:90,attackTimer:0,waveIndex:9,visualSerial:3,firstStrikeReady:false,bossPhase:1}
            ];
            save.battle.enemies = [{
              typeId:'ozoneAmbushBoss8',x:780,y:298,hp:420,
              attackTimer:5,waveIndex:9,visualSerial:1,
              firstStrikeReady:false,bossPhase:1,ambushIntroCompleted:false
            }];
            save.battle.wave = {
              currentWaveIndex:9,nextWaveEnemyIndex:1,wavePhase:'fighting',waveTimer:0,
              waveSpawnTimer:999,waveBannerTimer:0,waveMilestoneClaims:[1,3,6,9],
              allySpawnSerial:3,enemySpawnSerial:1,finalBaseMessageShown:false,
              endlessMode:false,endlessWaveTimer:30,endlessWaveNumber:0
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
        """, ambush_save)
        page.on('pageerror',lambda err: errors.append(str(err)))
        page.set_content(html,wait_until='domcontentloaded',timeout=30000)
        page.wait_for_selector('#bossPhaseFx:not([hidden])',timeout=5000)
        assert page.locator('#pauseBtn').is_disabled()
        assert page.locator('#bossPhaseFrom').inner_text() == 'ALLY UNITS'
        assert page.locator('#bossPhaseTo').inner_text() == '0'
        frozen_time=page.locator('#gameTime').inner_text()
        page.wait_for_timeout(500)
        assert page.locator('#gameTime').inner_text() == frozen_time
        page.wait_for_selector('#bossArrivalFx:not([hidden])',timeout=5000)
        assert 'O₃' in page.locator('#bossArrivalName').inner_text()
        page.wait_for_function("document.getElementById('bossPhaseFx').hidden && document.getElementById('bossArrivalFx').hidden && !document.getElementById('pauseBtn').disabled",timeout=7000)
        ambush_result=page.evaluate("""
          (() => {
            const save=JSON.parse(localStorage.getItem(gameData.saveKey));
            const boss=save.battle.enemies.find(x=>x.typeId==='ozoneAmbushBoss8');
            return {allies:save.battle.allies.length,energy:save.battle.energy,capacity:save.progress.energyCapacityLevel,done:boss?.ambushIntroCompleted,cooldowns:Object.values(save.battle.summonTimers||{})};
          })()
        """)
        assert ambush_result['allies']==0,ambush_result
        assert ambush_result['energy']>=125,ambush_result
        assert ambush_result['capacity']==3,ambush_result
        assert ambush_result['done'] is True,ambush_result
        assert all(value==0 for value in ambush_result['cooldowns']),ambush_result

        fatal=[e for e in errors if 'Failed to fetch dynamically imported module' not in e and 'Importing a module script failed' not in e and 'ServiceWorker' not in e]
        if fatal: raise AssertionError(f'page errors: {fatal}')
        browser.close()
    print('Browser smoke test passed (Chromium: boot, v5.0 counts, Stage 6・7 data/BOSS summon, Stage 8 ally-wipe cinematic and resume, Energy cap, no flying self-damage, guide, pause/restart UI, cooldown sync, Stage 5 repair, Stage 3 phase transition, mandatory-update UI).')
if __name__=='__main__': main()
