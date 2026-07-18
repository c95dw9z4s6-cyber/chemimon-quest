import fs from 'node:fs';
import path from 'node:path';
import { projectRoot, readJson } from './lib.mjs';
const runtime=fs.readFileSync(path.join(projectRoot,'src/scripts/game-runtime.js'),'utf8');
const template=fs.readFileSync(path.join(projectRoot,'src/index.template.html'),'utf8');
const core=readJson('data/game-core.json');
const css=fs.readFileSync(path.join(projectRoot,'src/styles/core.css'),'utf8');
const failures=[];
const test=(condition,message)=>{if(!condition) failures.push(message);};
test(template.includes('id="pauseRestartBtn"'),'pause restart button missing');
test(runtime.includes('function restartCurrentStageFromPause()'),'pause restart function missing');
test(runtime.includes('resetStage({ keepProgress: true })'),'restart does not preserve permanent progress');
test(runtime.includes('SPEED_TRIAL_COOLDOWN_MS = 30 * 1000'),'speed cooldown changed');
test(runtime.includes('chemionQuestSpeedTrialRetryV1'),'speed cooldown persistence missing');
test(runtime.includes('SPACING_CORRECT_INTERVAL_DAYS = [3, 7, 14, 30, 45, 60]'),'spacing schedule changed');
test(runtime.includes('SPACING_INCORRECT_DELAY_HOURS = 12'),'incorrect spacing changed');
test(runtime.includes('function migrateSaveData(input)'),'save migration function missing');
test(/29, 30, D\.version/.test(runtime),'v30 save compatibility missing');
test(template.includes('id="bossArrivalFx"'),'boss arrival overlay missing');
test(runtime.includes('function triggerBossArrivalEffect'),'boss arrival trigger missing');
test(runtime.includes('function playBossArrivalSound'),'boss arrival sound missing');
test(css.includes('@keyframes bossBlackWave'),'boss black-wave animation missing');
test(template.includes('id="bossPhaseFx"'),'boss phase transition overlay missing');
test(runtime.includes('function beginBossSecondPhaseSequence'),'boss phase sequence function missing');
test(runtime.includes('bossPhaseTransitionActive'),'boss phase freeze state missing');
test(runtime.includes('triggerBossArrivalEffect(enemy, { formula: enemy.formula, name: enemy.name })'),'second phase must replay boss arrival effect');
test(css.includes('@keyframes bossPhaseCollapse'),'boss phase reconstruction animation missing');
test(core.chemistryAffinityVersion===3,'chemistry affinity version must be 3');
test(runtime.includes("target === 'weak_acid_conjugate_base'"),'weak-acid liberation target logic missing');
test(runtime.includes("target === 'weak_base_conjugate_acid'"),'weak-base liberation target logic missing');
test(!runtime.includes("attackClass === 'strong_acid' && defendClass === 'weak_acid'"),'legacy strong-acid vs weak-acid logic remains');
test(template.includes('弱酸・弱塩基そのものには遊離補正なし'),'chemistry guide clarification missing');
const phasedBosses=[...(core.stage3?.enemies||[]),...(core.stage5?.enemies||[])].filter((enemy)=>enemy.boss&&enemy.phaseTwo);
test(phasedBosses.length>=2,'Stage 3 and Stage 5 two-phase bosses are missing');
const stage5Unlocked=core.achievementDefinitions.find((x)=>x.id==='stage5_unlocked');
test(stage5Unlocked?.metric==='highestStageReached' && stage5Unlocked?.goal===5,'stage5_unlocked must use highestStageReached goal 5');

test(runtime.includes('const FLYING_EXTRA_RENDER_OFFSET = 42'),'flying render offset changed');
test(runtime.includes('function summonCooldownRemaining(unitId)'),'summon cooldown normalization missing');
test(runtime.includes('SUMMON_UI_REFRESH_INTERVAL = 0.1'),'summon cooldown UI refresh missing');
test(runtime.includes("case 'stage5Clears': return cumulativeStats.stage5Clears"),'Stage 5 dedicated metric missing');
test(runtime.includes('cumulativeStats.stage5Clears = Math.max(1'),'Stage 5 old-save backfill missing');
const stage5Clear=core.achievementDefinitions.find((x)=>x.id==='stage5_clear');
test(stage5Clear?.metric==='stage5Clears' && stage5Clear?.goal===1,'Stage 5 clear achievement must use stage5Clears');
const online=fs.readFileSync(path.join(projectRoot,'src/scripts/online-runtime.js'),'utf8');
const rules=fs.readFileSync(path.join(projectRoot,'firestore.rules'),'utf8');
test(online.includes('実装済みにする') && online.includes('updateRequestStatus'),'request implemented controls missing');
test(!online.includes("'requestAdmins'") && !online.includes('refreshRequestAdminStatus'),'legacy requestAdmins lookup remains');
test(online.includes('createRequestManagementNotice') && online.includes("deleteButton.textContent = '要望を削除'"),'universal request controls missing');
test(rules.includes('validRequestStatusUpdate') && rules.includes('allow update: if request.auth != null && validRequestStatusUpdate()'),'universal request update rule missing');
test(rules.includes('allow delete: if request.auth != null;'),'universal request delete rule missing');


const stage6=core.stage6;
test(stage6?.id===6 && stage6.units?.length===5 && stage6.enemies?.length>=9,'Stage 6 data missing');
test(stage6?.units?.[4]?.chemistryClass==='strong_acid','Stage 6 fifth unit must be strong acid');
test(stage6?.enemies?.every((enemy)=>enemy.affinityTarget==='weak_acid_conjugate_base'),'Stage 6 enemies must all be weak-acid-derived targets');
test(stage6?.enemies?.find((enemy)=>enemy.boss)?.bossSummonPool?.length>=3,'Stage 6 boss summon ability missing');
test(runtime.includes('Math.max(6, cumulativeStats.highestStageReached || 1)'),'Stage 5-cleared old saves do not unlock Stage 6');
const stage7=core.stage7;
test(stage7?.id===7 && stage7.units?.length===5 && stage7.enemies?.length>=9,'Stage 7 data missing');
test(stage7?.units?.[4]?.chemistryClass==='strong_base','Stage 7 fifth unit must be strong base');
test(stage7?.enemies?.every((enemy)=>enemy.affinityTarget==='weak_base_conjugate_acid'),'Stage 7 enemies must all be weak-base-derived targets');
test(stage7?.enemies?.find((enemy)=>enemy.boss)?.bossSummonPool?.length>=3,'Stage 7 boss summon ability missing');
test(runtime.includes('Math.max(7, cumulativeStats.highestStageReached || 1)'),'Stage 6-cleared old saves do not unlock Stage 7');
test(!JSON.stringify(core).includes('selfDamagePerSecond'),'flying self-damage remains in game data');
test(!runtime.includes('ally.hp -= ally.maxHp * ally.selfDamagePerSecond') && !runtime.includes('enemy.hp -= enemy.maxHp * enemy.selfDamagePerSecond'),'flying self-damage runtime remains');
const basicHalf=JSON.parse(fs.readFileSync(path.join(projectRoot,'data/basic-questions.json'),'utf8')).filter((q)=>String(q.id).startsWith('v45-basic-half-'));
const hardHalf=JSON.parse(fs.readFileSync(path.join(projectRoot,'data/hard-questions.json'),'utf8')).filter((q)=>String(q.id).startsWith('v45-hard-half-'));
test(basicHalf.length===40 && hardHalf.length===30,'half-reaction question expansion count mismatch');
test(['v3.9','v3.95','v4.0','v4.1','v4.2','v4.3','v4.4','v4.45','v4.5'].every((version)=>runtime.includes(`['${version}'`) && runtime.includes(`{version:'${version}'`)),'missing in-game update notice/history entries');

const stage8=core.stage8;
const stage8Boss=stage8?.enemies?.find((enemy)=>enemy.boss);
const maxAssaultSpeed=Math.max(...[core.units,core.stage2?.units,core.stage3?.units,core.stage4?.units,core.stage5?.units,core.stage6?.units,core.stage7?.units,stage8?.units].flat().filter((unit)=>/強襲/.test(unit?.role||'')).map((unit)=>Number(unit.speed)||0));
test(stage8?.id===8 && stage8.units?.length===5 && stage8.enemies?.length>=9,'Stage 8 data missing');
test(stage8Boss?.wipeAlliesOnArrival===true && !stage8Boss?.phaseTwo,'Stage 8 boss must wipe allies and have no second phase');
test(stage8Boss?.hp<=500,'Stage 8 boss HP must stay in normal-enemy range');
test(stage8Boss?.speed>maxAssaultSpeed,'Stage 8 boss must be faster than max assault unit');
test(runtime.includes('function beginBossAnnihilationSequence') && runtime.includes('allies = []'),'Stage 8 annihilation cinematic missing');
test(runtime.includes('for (const unit of D.units) summonTimers[unit.id] = 0'),'Stage 8 ambush must reset summon cooldowns for immediate redeployment');
test(core.maxEnergyCapacityLevel===12 && core.maxEnergy+core.energyCapacityPerLevel*11===265,'Energy capacity Lv.12/max265 missing');
test(runtime.includes('Math.max(8, cumulativeStats.highestStageReached || 1)'),'Stage 7-cleared old saves do not unlock Stage 8');


const stage9=core.stage9;
const stage9Boss=stage9?.enemies?.find((enemy)=>enemy.boss);
const stage9Blocked=stage9?.units?.find((unit)=>unit.rangedAttack);
test(stage9?.id===9 && stage9.units?.length===5 && stage9.enemies?.length>=9 && stage9.waves?.length===11,'Stage 9 data missing');
test(stage9?.rules?.disableRangedAllyAttacks===true,'Stage 9 ranged-attack rule missing');
test(stage9Blocked?.formula==='Ag⁺','Stage 9 blocked ranged unit missing');
test(stage9Boss?.formula==='BaSO₄' && !stage9Boss?.phaseTwo && !stage9Boss?.bossSummonPool,'Stage 9 boss must be simple BaSO4');
test(runtime.includes('function stageBlocksRangedAlly') && runtime.includes('rangedBlocked'),'Stage 9 ranged-block runtime missing');
test(runtime.includes("refs.state.textContent = '⛔ 遠距離攻撃禁止：召喚不可'"),'Stage 9 disabled summon message missing');
test(runtime.includes('Math.max(9, cumulativeStats.highestStageReached || 1)'),'Stage 8-cleared old saves do not unlock Stage 9');

const stageGuides=core.stageGuides||{};
test(Object.keys(stageGuides).length===9,'Stage guide data must cover Stage 1-9');
for (let stageId=1;stageId<=9;stageId+=1) {
  const guide=stageGuides[String(stageId)];
  test(Boolean(guide),'Stage '+stageId+' guide missing');
  test(typeof guide?.specialRule==='string' && guide.specialRule.length>=20,'Stage '+stageId+' special rule missing');
  test(Array.isArray(guide?.dangerousEnemies) && guide.dangerousEnemies.length>=2,'Stage '+stageId+' dangerous enemies missing');
  test(Array.isArray(guide?.recommendedRoles) && guide.recommendedRoles.length>=3,'Stage '+stageId+' recommended roles missing');
  test(Array.isArray(guide?.progressiveHints) && guide.progressiveHints.length>=3,'Stage '+stageId+' progressive hints missing');
  test(guide?.progressiveHints?.some((hint)=>hint.minDefeats===0) && guide?.progressiveHints?.some((hint)=>hint.minDefeats>=3),'Stage '+stageId+' hint thresholds invalid');
}
test(template.includes('id="stageGuideModal"') && template.includes('id="endStageGuideBtn"'),'Stage guide modal/defeat entry missing');
test(runtime.includes('function renderStageGuide') && runtime.includes('function stageDefeatAnalysis'),'Stage guide renderer or defeat analysis missing');
test(runtime.includes('stage${currentStageId}Defeats'),'Stage-specific defeat counter missing');
test(css.includes('.stage-guide-content') && css.includes('.stage-guide-button'),'Stage guide styles missing');

test(template.includes('id="settingsLearningResetBtn"') && template.includes('id="learningResetModal"'),'learning-data reset UI missing');
test(runtime.includes('function resetLearningData()'),'learning-data reset function missing');
test(runtime.includes('localStorage.removeItem(LEARNING_KEY)') && runtime.includes('localStorage.removeItem(REVIEW_KEY)'),'learning-data reset must clear learning and review stores');
test(runtime.includes('recentQuestionHistory = []'),'learning-data reset must clear current-session question history');
test(runtime.includes("input.value.trim() !== '初期化する'"),'learning-data reset confirmation phrase missing');


const bgmPath=path.join(projectRoot,'assets/audio/chemion-normal-bgm.mp3');
const difficultBgmPath=path.join(projectRoot,'assets/audio/chemion-difficult-bgm.mp3');
test(fs.existsSync(bgmPath) && fs.statSync(bgmPath).size>1000000,'normal BGM v2 asset missing or too small');
test(fs.existsSync(difficultBgmPath) && fs.statSync(difficultBgmPath).size>1000000,'difficult BGM v2 asset missing or too small');
test(template.includes('id="bgmAudio"') && template.includes('id="settingsMusicBtn"') && template.includes('id="pauseMusicBtn"'),'BGM controls missing');
test(template.includes('id="musicVolume"') && template.includes('id="musicVolumeValue"'),'BGM volume control missing');
test(runtime.includes('const BGM_KEY = "chemionQuestBgmV1"') && runtime.includes('const BGM_VOLUME_KEY = "chemionQuestBgmVolumeV1"'),'BGM storage keys missing');
test(runtime.includes('function syncBgmPlayback()') && runtime.includes('function activateBgmFromUserGesture()'),'BGM autoplay-safe playback missing');
test(runtime.includes('function desiredBgmTrackKey()') && runtime.includes('function syncBgmTrack({ restart = false } = {})'),'Stage-based BGM routing missing');
test(runtime.includes("currentStageId % 5 === 0 ? 'difficult' : 'normal'") && runtime.includes('syncBgmTrack({ restart: true })'),'Difficult-stage BGM switching missing');
test(runtime.includes('if (document.hidden) { pauseBgm(); suspendForHiddenPage(); }'),'BGM hidden-page suspension missing');
test(runtime.includes('writeTransferValue(BGM_KEY, bundle.storage.bgm)') && runtime.includes('writeTransferValue(BGM_VOLUME_KEY, bundle.storage.bgmVolume)'),'BGM transfer restore missing');
const swTemplate=fs.readFileSync(path.join(projectRoot,'src/sw.template.js'),'utf8');
test(swTemplate.includes('./assets/audio/chemion-normal-bgm.mp3') && swTemplate.includes('./assets/audio/chemion-difficult-bgm.mp3'),'BGM offline cache missing');
const generatedSw=fs.readFileSync(path.join(projectRoot,'sw.js'),'utf8');
test(generatedSw.includes("shell-v5.95") && generatedSw.includes("runtime-v5.95"),'v5.95 PWA cache names missing');
test(generatedSw.includes("name.startsWith(CACHE_PREFIX)") && generatedSw.includes("caches.delete(name)"),'old PWA cache cleanup missing');


test(template.includes('id="settingsPowerBtn"') && template.includes('id="pausePowerBtn"'),'low-power controls missing');
test(runtime.includes('const NORMAL_RENDER_FPS = 45') && runtime.includes('const LOW_POWER_RENDER_FPS = 30'),'render FPS caps missing');
test(runtime.includes('const NORMAL_UI_REFRESH_INTERVAL = 0.1') && runtime.includes('const LOW_POWER_UI_REFRESH_INTERVAL = 0.2'),'UI refresh throttling missing');
test(runtime.includes('const LOW_POWER_KEY = "chemionQuestLowPowerV1"') && runtime.includes('function toggleLowPowerMode()'),'low-power persistence/toggle missing');
test(runtime.includes('writeTransferValue(LOW_POWER_KEY, bundle.storage.lowPower)'),'low-power transfer restore missing');
test(runtime.includes('autoSaveTimer >= (lowPowerMode ? 15 : 10)'),'autosave throttling missing');
test(css.includes('body.low-power-mode') && css.includes('backdrop-filter:none!important'),'low-power visual reductions missing');

test(template.includes('id="guestAssistCode"') && template.includes('id="guestAssistConfirmModal"'),'guest assist settings or confirmation UI missing');
test(template.includes('ゲストアシストモードを有効にします。') && template.includes('ランキング、実績、学習記録、正答率、連続正解記録には反映されません。'),'guest assist confirmation text changed');
test(runtime.includes("trim().toLowerCase()") && runtime.includes("code !== 'easy'"),'guest assist access-code normalization missing');
test(runtime.includes("textContent = 'コードを確認してください'"),'guest assist invalid-code message changed');
test(runtime.includes('if (guestAssistEnabled) {') && runtime.includes('callback(true, { assisted: true })'),'guest assist internal auto-success path missing');
test(runtime.includes('if (guestAssistEnabled) return [];'),'guest assist achievement suppression missing');
test(runtime.includes('guestAssistEnabled = Boolean(parsed.progress.guestAssistEnabled)'),'guest assist load persistence missing');
test(runtime.includes('guestAssistUsed = Boolean(parsed.progress.guestAssistUsed || guestAssistEnabled)'),'guest assist sticky-use migration missing');
test(online.includes('function guestAssistWasUsed()') && online.includes("setStatus('ランキング送信対象外')"),'guest assist ranking suppression missing');
test(!template.includes('アクセスコード easy'),'access code must not be exposed outside its input flow');

if (failures.length) { console.error('Feature regression tests failed:'); failures.forEach((x)=>console.error(`- ${x}`)); process.exit(1); }
console.log('Feature regression tests passed.');
