import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { projectRoot, readJson } from './lib.mjs';

const core = readJson('data/game-core.json');
const release = readJson('config/release.json');
const baseline = readJson('scripts/stage1-10-v6.0-baseline.json');
const runtime = fs.readFileSync(path.join(projectRoot, 'src/scripts/game-runtime.js'), 'utf8');
const online = fs.readFileSync(path.join(projectRoot, 'src/scripts/online-runtime.js'), 'utf8');
const template = fs.readFileSync(path.join(projectRoot, 'src/index.template.html'), 'utf8');
const sw = fs.readFileSync(path.join(projectRoot, 'src/sw.template.js'), 'utf8');
const rules = fs.readFileSync(path.join(projectRoot, 'firestore.rules'), 'utf8');
const indexes = readJson('firestore.indexes.json');
const failures = [];
const results = [];
const check = (name, condition, detail = '') => {
  results.push({ name, pass: Boolean(condition), detail });
  if (!condition) failures.push(`${name}${detail ? `: ${detail}` : ''}`);
};
const hashValue = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const hashFile = (relative) => crypto.createHash('sha256').update(fs.readFileSync(path.join(projectRoot, relative))).digest('hex');

check('release is v6.1 save 33', release.version === '6.1' && release.saveVersion === 33 && core.version === 33);
check('time attack UI is complete', ['timeAttackIndicator','timeAttackStartBtn','timeAttackRankingModal','timeAttackResultModal','timeAttackExitBtn'].every((id) => template.includes(`id="${id}"`)));
check('time attack uses protected normal save', runtime.includes('timeAttackNormalSave') && runtime.includes('writeTimeAttackProfileToNormalSave') && runtime.includes('restoreNormalAfterTimeAttack'));
check('time attack starts in initial Stage 10 state', /function beginTimeAttack\(\)[\s\S]*?applyStageDefinition\(10\)[\s\S]*?coins = 0[\s\S]*?energyCapacityLevel = 1[\s\S]*?aquaRegiaLevel = 1[\s\S]*?resetStage\(\{ keepProgress: true \}\)/.test(runtime));
check('time attack blocks normal saving', /function saveGame[\s\S]{0,220}if \(isTimeAttackActive\(\)\)/.test(runtime));
check('time attack uses monotonic performance clock', runtime.includes('startedAt: performance.now()') && runtime.includes('timeAttackRun.stoppedAt = performance.now()'));
check('time attack invalidation conditions are present', ['長時間バックグラウンド','ページ終了または再読み込み','セーブ差し替え','開発者・自動テスト状態','開始・終了走行ID'].every((text) => runtime.includes(text)));
check('guest assist is unavailable in time attack', runtime.includes("'タイムアタック中は利用できません'") && /function enableGuestAssist[\s\S]{0,180}isTimeAttackActive/.test(runtime));
check('learning and review writes are isolated', runtime.includes('if (!isTimeAttackActive()) recordLearningResult') && runtime.includes('timeAttackNormalAux'));
check('ranking is a separate one-document-per-user collection', online.includes("TIME_ATTACK_COLLECTION = 'stage10TimeAttack'") && online.includes("f.doc(db, TIME_ATTACK_COLLECTION, currentUser.uid)"));
check('ranking uses a faster-only transaction', online.includes('runTransaction') && online.includes('serverBestMs <= pending.timeMs') && rules.includes('request.resource.data.bestMs < resource.data.bestMs'));
check('ranking rejects duplicate run IDs', online.includes("String(current.runId || '') === pending.runId") && rules.includes('request.resource.data.runId != resource.data.runId'));
check('ranking sorts milliseconds and first registration', online.includes("f.orderBy('bestMs', 'asc')") && online.includes("f.orderBy('firstRegisteredAt', 'asc')"));
check('ranking filters tester records', online.includes('isFilteredTimeAttackRecord') && online.includes('record?.isTest === true'));
check('ranking index exists', indexes.indexes?.some((index) => index.collectionGroup === 'stage10TimeAttack' && index.fields?.[0]?.fieldPath === 'bestMs' && index.fields?.[1]?.fieldPath === 'firstRegisteredAt'));
check('Firestore only permits owner faster update', rules.includes('request.auth.uid == userId') && rules.includes(".hasOnly(['username', 'bestMs', 'runId', 'submittedAt'])"));

const v3Path = 'assets/audio/chemion-milestone-stage-bgm-v3.mp3';
const v16Path = 'assets/audio/chemion-stage10-au-boss-v16-loop.mp3';
check('formal V3 exact bytes and hash', fs.statSync(path.join(projectRoot, v3Path)).size === 3747570 && hashFile(v3Path) === '14600796c5beea7b3f81679a8c4bc2c7d535b1448b6985af7b0a857e3bd5c2ba');
check('formal V16 hash unchanged', hashFile(v16Path) === baseline['chemion-stage10-au-boss-v16-loop.mp3']);
check('PWA caches both Stage 10 tracks', sw.includes(`./${v3Path}`) && sw.includes(`./${v16Path}`));
check('Stage 10 routes V3 then V16', runtime.includes("return ['protected', 'combat', 'victory'].includes(stage10State?.phase) ? 'au' : 'milestoneV3'") && runtime.includes("syncBgmTrack({ restart: true });\n        showStage10Cinematic('LOW REACTIVITY'"));
check('quiz and preparation only duck current track', runtime.includes("setBgmDuckFactor(.22)") && !/beginAquaRegiaPreparation[\s\S]{0,850}syncBgmTrack\(\{ restart: true \}\)/.test(runtime));
check('Au formation preserves allies and smoothly pushes', runtime.includes("projectile.ownerKind === 'ally' && projectile.effectKind !== 'heal'") && runtime.includes('stage10State.formationPushX') && runtime.includes("ally.x += (targetX - ally.x)") && !/beginStage10AuFormation[\s\S]{0,1000}allies\s*=\s*\[\]/.test(runtime));
check('Au ability warnings are distinct', runtime.includes('function drawStage10AbilityWarnings()') && runtime.includes('goldCrushPendingTimer') && runtime.includes('goldFoilPendingTimer'));
check('Aqua Regia has unique trail rings and six stages', runtime.includes('function drawAquaRegiaTrail') && ['酸化開始','Cl⁻錯形成','Au粒子離脱','[AuCl₄]⁻ 反応完了'].every((text) => runtime.includes(text)));
check('non-Au attacks never use gold-complex labels', /else \{[\s\S]{0,500}text: `混酸連撃 \$\{hitNumber\}\/6`[\s\S]{0,180}subtext: ''/.test(runtime));
check('safe wording is exact and no practical mL amount is shown', template.includes('実際に混ぜたり試したりしないでください') && !template.includes('mL'));
check('reduced motion and low power keep reduced variants', fs.readFileSync(path.join(projectRoot,'src/styles/core.css'),'utf8').includes('@media(prefers-reduced-motion:reduce)') && runtime.includes('lowPowerMode || prefersReducedMotion'));

const economyKeys = ['startingEnergy','maxEnergy','maxUpgradeLevel','energyCapacityPerLevel','energyCapacityUpgradeCosts','unitUpgradeHpGrowth','unitUpgradeAttackGrowth','unitUpgradeRangeEvery','energyRegenPerSecond','unitUpgradeCostGrowth','researchFailureRefundRate','waveMilestoneCoinRewards','defeatSupportBaseCoins','defeatSupportCoinsPerWave','defeatSupportMaxCoins','allyBaseHp','enemyBaseHp','maxEnemiesOnField','maxEnergyCapacityLevel'];
const current = { stage1: hashValue({ units: core.units, enemies: core.enemies, waves: core.waves }) };
for (let stage = 2; stage <= 10; stage += 1) current[`stage${stage}`] = hashValue(core[`stage${stage}`]);
current.economy = hashValue(Object.fromEntries(economyKeys.map((key) => [key, core[key]])));
for (const key of ['stage1','stage2','stage3','stage4','stage5','stage6','stage7','stage8','stage9','stage10','economy']) {
  check(`v6.0 ${key} gameplay hash unchanged`, current[key] === baseline[key], `${current[key]} / ${baseline[key]}`);
}
for (const audio of ['chemion-normal-bgm.mp3','chemion-difficult-bgm.mp3','chemion-stage10-au-boss-v16-loop.mp3']) {
  check(`v6.0 ${audio} unchanged`, hashFile(`assets/audio/${audio}`) === baseline[audio]);
}
check('Stage 5 remains on difficult BGM until v6.5', runtime.includes("currentStageId % 5 === 0 ? 'difficult' : 'normal'") && !runtime.includes("currentStageId === 5 ? 'milestoneV3'"));
const forbidden = /Pt希少敵|通常変異体|クリティカル|レア研究カード|Stage間素材|対人戦|マルチプレイ|敵王水|player Au/;
check('no v6.2+ gameplay was introduced', !forbidden.test(JSON.stringify(core.stage10)));

const output = { generatedAt: new Date().toISOString(), baseline, hashes: { v3: hashFile(v3Path), v16: hashFile(v16Path) }, results, passed: failures.length === 0 };
fs.writeFileSync(path.join(projectRoot, 'docs/STAGE10_V61_TEST_RESULTS.json'), `${JSON.stringify(output, null, 2)}\n`);
if (failures.length) {
  console.error('v6.1 Stage 10 tests failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`v6.1 Stage 10 tests passed (${results.length}/${results.length}).`);
