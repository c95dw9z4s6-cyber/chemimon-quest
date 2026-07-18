import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { projectRoot, readJson } from './lib.mjs';

const core = readJson('data/game-core.json');
const basic = readJson('data/basic-questions.json');
const hard = readJson('data/hard-questions.json');
const baseline = readJson('scripts/stage1-9-v5.95-baseline.json');
const runtime = fs.readFileSync(path.join(projectRoot, 'src/scripts/game-runtime.js'), 'utf8');
const template = fs.readFileSync(path.join(projectRoot, 'src/index.template.html'), 'utf8');
const sw = fs.readFileSync(path.join(projectRoot, 'src/sw.template.js'), 'utf8');
const failures = [];
const results = [];
const check = (name, condition, detail = '') => {
  results.push({ name, pass: Boolean(condition), detail });
  if (!condition) failures.push(`${name}${detail ? `: ${detail}` : ''}`);
};
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

check('Stage 10 is exactly 10 waves', core.stage10?.waves?.length === 10);
check('Wave 10 contains only Au', JSON.stringify(core.stage10?.waves?.[9]?.enemies) === JSON.stringify(['goldBossEnemy10']));
check('Stage 10 has five selected existing allies', JSON.stringify(core.stage10?.units?.map((unit) => unit.formula)) === JSON.stringify(['HNO₃', 'HCl', 'Al', 'Fe', 'H₂O']));
check('Stage 10 physical ally is Fe', core.stage10?.units?.find((unit) => unit.formula === 'Fe')?.damageType === 'physical');
check('Stage 10 logical battlefield is 1.30x', core.stage10?.logicalBattlefieldScale === 1.3);
check('Aqua regia is independent Lv1-10 data', core.stage10?.aquaRegia?.upgradeCosts?.length === 9 && !('formula' in core.stage10.aquaRegia && /HNO|HCl/.test(core.stage10.aquaRegia.formula)));
check('Aqua regia uses six time-split hits', core.stage10?.aquaRegia?.hitCount === 6 && core.stage10?.aquaRegia?.hitInterval > 0);
check('Au uses chemical-only reduction', core.stage10?.enemies?.find((enemy) => enemy.auBoss)?.chemicalDamageReduction === .8 && core.stage10?.enemies?.find((enemy) => enemy.auBoss)?.damageReduction === undefined);
check('Au has both required physical abilities', runtime.includes('function beginAuGoldCrush') && runtime.includes('function resolveAuGoldFoil'));
check('Au defeat is Stage 10 victory', runtime.includes('if (defeatedAu && isStage10()) startStage10VictorySequence()') && runtime.includes('!isStage10() && enemyBaseHp <= 0'));
check('Au formation preserves allies and removes ally projectiles only', runtime.includes("projectile.ownerKind === 'ally'") && !/beginStage10AuFormation[\s\S]{0,1000}allies\s*=\s*\[\]/.test(runtime));
check('Aqua preparation is transactional and capped at one', runtime.includes('function commitAquaRegiaPreparation()') && runtime.includes('if (!aquaRegiaExists())') && runtime.includes('aquaRegiaExists() || stage10State?.preparation'));
check('Aqua material HP ratio is averaged', runtime.includes('entity.hp / Math.max(1, entity.maxHp), 0) / 4'));
check('Aqua Au first contact is persisted once', runtime.includes('aquaAuContactComplete') && runtime.includes('if (!isStage10() || aquaAuContactComplete || stage10State.contactStarted) return false'));
check('Non-Au path does not show Au complex', /if \(target\.auBoss\)[\s\S]*?subtext: '\[AuCl₄\]⁻'[\s\S]*?else \{[\s\S]*?subtext: ''/.test(runtime));
check('Stage 9 clears unlock Stage 10 during migration', runtime.includes('Math.max(10, cumulativeStats.highestStageReached || 1)') && runtime.includes('Math.max(10, finiteNumber(savedStats.highestStageReached, 1))'));
check('v5.95 save version 31 remains accepted', /29, 30, 31, D\.version/.test(runtime));
check('Guest assist persistence remains present', runtime.includes('guestAssistUsed = Boolean(parsed.progress.guestAssistUsed || guestAssistEnabled)'));
check('V16 is cached by PWA', sw.includes('./assets/audio/chemion-stage10-au-boss-v16-loop.mp3'));
check('Stage 10 UI includes safe warning', template.includes('実物を混合しないでください') && !template.includes('mL'));

const audioPath = path.join(projectRoot, 'assets/audio/chemion-stage10-au-boss-v16-loop.mp3');
const audioHash = fs.existsSync(audioPath) ? crypto.createHash('sha256').update(fs.readFileSync(audioPath)).digest('hex').toUpperCase() : '';
check('V16 SHA-256 matches handoff manifest', audioHash === '5FD7CF0A3A8001B7545B0CE26E87835C0D1B19D042767C1F49955507F1B613AF', audioHash);

const economyKeys = ['startingEnergy','maxEnergy','maxUpgradeLevel','energyCapacityPerLevel','energyCapacityUpgradeCosts','unitUpgradeHpGrowth','unitUpgradeAttackGrowth','unitUpgradeRangeEvery','energyRegenPerSecond','unitUpgradeCostGrowth','researchFailureRefundRate','waveMilestoneCoinRewards','defeatSupportBaseCoins','defeatSupportCoinsPerWave','defeatSupportMaxCoins','allyBaseHp','enemyBaseHp','maxEnemiesOnField','maxEnergyCapacityLevel'];
const currentHashes = {
  stage1: hash({ units: core.units, enemies: core.enemies, waves: core.waves }),
  ...Object.fromEntries(Array.from({ length: 8 }, (_, index) => [`stage${index + 2}`, hash(core[`stage${index + 2}`])])),
  economy: hash(Object.fromEntries(economyKeys.map((key) => [key, core[key]])))
};
for (const key of ['stage1','stage2','stage3','stage4','stage5','stage6','stage7','stage8','stage9','economy']) {
  check(`v5.95 ${key} hash is unchanged`, currentHashes[key] === baseline[key], `${currentHashes[key]} / ${baseline[key]}`);
}

const unsafeAquaPattern = /(?:\bmL\b|作り置き|保存方法|取り扱い方法|投入順|器具|温度)/i;
const aquaQuestions = [...basic, ...hard].filter((question) => JSON.stringify(question).includes('王水'));
check('Aqua regia question IDs and total count are preserved', basic.length === 620 && hard.length === 340 && aquaQuestions.every((question) => typeof question.id === 'string'));
check('Aqua regia questions contain no practical quantities or handling instructions', aquaQuestions.every((question) => !unsafeAquaPattern.test(JSON.stringify(question))), aquaQuestions.filter((question) => unsafeAquaPattern.test(JSON.stringify(question))).map((question) => question.id).join(','));

const forbiddenStage10Gameplay = /Pt希少敵|クリティカル|装備|対人戦|マルチプレイ|通常変異体|Stage間素材/;
check('No v6.1+ gameplay is present in Stage 10 data', !forbiddenStage10Gameplay.test(JSON.stringify(core.stage10)));

const output = { generatedAt: new Date().toISOString(), baseline, audioHash, results, passed: failures.length === 0 };
fs.writeFileSync(path.join(projectRoot, 'docs/STAGE10_TEST_RESULTS.json'), `${JSON.stringify(output, null, 2)}\n`);
if (failures.length) {
  console.error('Stage 10 tests failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`Stage 10 tests passed (${results.length}/${results.length}).`);
