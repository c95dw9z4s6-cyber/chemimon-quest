import fs from 'node:fs';
import path from 'node:path';
import { projectRoot, readJson } from './lib.mjs';

const core = readJson('data/game-core.json');
const stage = core.stage10;
const au = stage.enemies.find((enemy) => enemy.auBoss);
const aqua = stage.aquaRegia;
const fe = stage.units.find((unit) => unit.formula === 'Fe');
const nitric = stage.units.find((unit) => unit.formula === 'HNO₃');
const hydrochloric = stage.units.find((unit) => unit.formula === 'HCl');
const TRIALS = 240;
const AU_BGM_START_SECONDS = stage.finalWaveStartSeconds + 6.2;
const MAX_SECONDS = 420;

function seededRandom(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function normalish(random) {
  return Array.from({ length: 6 }, random).reduce((sum, value) => sum + value, 0) - 3;
}

function upgradedAttack(unit, level) {
  return unit.attack * (1 + core.unitUpgradeAttackGrowth * (level - 1));
}

function aquaAttack(level) {
  return aqua.attack * (1 + aqua.attackGrowth * (level - 1));
}

const scenarios = [
  { id: 'no_aqua_avg_lv6', label: '王水なし・平均Lv6', teamLevel: 6, supportLevel: 6, aquaLevel: 0, feCount: 1.47, management: 1.00, survivalMean: 218, survivalSd: 6, escortLoad: .88 },
  { id: 'aqua_lv1', label: '王水Lv1', teamLevel: 3, supportLevel: 2.5, aquaLevel: 1, feCount: 1.20, management: .90, survivalMean: 220, survivalSd: 28, escortLoad: .86 },
  { id: 'aqua_lv2', label: '王水Lv2', teamLevel: 3.3, supportLevel: 3, aquaLevel: 2, feCount: 1.35, management: .98, survivalMean: 235, survivalSd: 30, escortLoad: .90 },
  { id: 'aqua_lv3_support_lv3_4', label: '王水Lv3＋支援Lv3〜4', teamLevel: 3.5, supportLevel: 3.5, aquaLevel: 3, feCount: 1.55, management: 1.02, survivalMean: 200, survivalSd: 24, escortLoad: .93 },
  { id: 'aqua_lv4_active', label: '王水Lv4以上・能動操作', teamLevel: 4.5, supportLevel: 4.5, aquaLevel: 4, feCount: 1.25, management: 1.02, survivalMean: 220, survivalSd: 28, escortLoad: .91 },
  { id: 'aqua_lv10_active', label: '王水Lv10・能動操作', teamLevel: 7, supportLevel: 7, aquaLevel: 10, feCount: 1.34, management: 1.08, survivalMean: 260, survivalSd: 25, escortLoad: .94 },
  { id: 'aqua_lv10_unattended', label: '王水Lv10・無操作', teamLevel: 7, supportLevel: 7, aquaLevel: 10, feCount: .42, management: .38, survivalMean: 96, survivalSd: 18, escortLoad: .60 }
];

function simulateTrial(scenario, trialIndex) {
  const random = seededRandom(0x6a09e667 ^ (trialIndex * 0x9e3779b1) ^ scenario.id.length * 7919);
  const feDps = upgradedAttack(fe, scenario.teamLevel) / fe.attackInterval * scenario.feCount;
  const chemicalDps = (upgradedAttack(nitric, scenario.teamLevel) / nitric.attackInterval * .42
    + upgradedAttack(hydrochloric, scenario.teamLevel) / hydrochloric.attackInterval * .78) * (1 - au.chemicalDamageReduction);
  const aquaDps = scenario.aquaLevel > 0 ? aquaAttack(scenario.aquaLevel) * aqua.hitCount / aqua.attackInterval : 0;
  const formationDelay = scenario.aquaLevel > 0 ? 18 + random() * 34 : Infinity;
  const aquaUptime = scenario.aquaLevel > 0 ? Math.max(.18, Math.min(.92, .48 + scenario.supportLevel * .035 + normalish(random) * .055)) : 0;
  const fieldVariance = Math.max(.72, 1 + normalish(random) * .055);
  const sustainedFactor = scenario.management * scenario.escortLoad * fieldVariance;
  const survival = Math.max(48, scenario.survivalMean + normalish(random) * scenario.survivalSd);
  let hp = au.hp;
  let bossSeconds = 0;
  let aquaActiveSeconds = 0;
  while (bossSeconds < Math.min(MAX_SECONDS - AU_BGM_START_SECONDS, survival) && hp > 0) {
    const aquaOnline = bossSeconds >= formationDelay && random() < aquaUptime;
    const foilDisruption = (bossSeconds % 20) < 2 ? .66 : 1;
    const escortCycle = (bossSeconds % 28) < 8 ? .86 : 1;
    const fatigue = Math.max(.86, 1 - bossSeconds / 2500);
    const dps = (feDps + chemicalDps + (aquaOnline ? aquaDps : 0)) * sustainedFactor * foilDisruption * escortCycle * fatigue;
    hp -= dps;
    if (aquaOnline) aquaActiveSeconds += 1;
    bossSeconds += 1;
  }
  const win = hp <= 0;
  const totalSeconds = AU_BGM_START_SECONDS + bossSeconds;
  return {
    win,
    totalSeconds,
    bossSeconds,
    auHpRemaining: Math.max(0, hp),
    aquaUptime: scenario.aquaLevel > 0 && bossSeconds > 0 ? aquaActiveSeconds / bossSeconds : 0,
    earlyCollapse: !win && bossSeconds < 120,
    stalemate: !win && totalSeconds >= MAX_SECONDS - 1,
    reachedLoop: bossSeconds >= 211
  };
}

function percentile(values, probability) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index); const upper = Math.ceil(index);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function summarize(scenario) {
  const trials = Array.from({ length: TRIALS }, (_, index) => simulateTrial(scenario, index));
  const wins = trials.filter((trial) => trial.win);
  const defeats = trials.filter((trial) => !trial.win);
  const nonEarly = trials.filter((trial) => !trial.earlyCollapse);
  return {
    id: scenario.id,
    label: scenario.label,
    trials: trials.length,
    winRate: wins.length / trials.length,
    successMedianSeconds: percentile(wins.map((trial) => trial.totalSeconds), .5),
    successP10Seconds: percentile(wins.map((trial) => trial.totalSeconds), .1),
    successP90Seconds: percentile(wins.map((trial) => trial.totalSeconds), .9),
    defeatMedianAuHp: percentile(defeats.map((trial) => trial.auHpRemaining), .5),
    aquaUptime: trials.reduce((sum, trial) => sum + trial.aquaUptime, 0) / trials.length,
    earlyCollapseRate: trials.filter((trial) => trial.earlyCollapse).length / trials.length,
    stalemateRate: trials.filter((trial) => trial.stalemate).length / trials.length,
    loopReachRateAmongNonEarly: nonEarly.length ? nonEarly.filter((trial) => trial.reachedLoop).length / nonEarly.length : 0
  };
}

const summaries = scenarios.map(summarize);
const byId = Object.fromEntries(summaries.map((summary) => [summary.id, summary]));
const failures = [];
const requireRange = (condition, message) => { if (!condition) failures.push(message); };
const noAqua = byId.no_aqua_avg_lv6;
const aqua1 = byId.aqua_lv1;
const aqua2 = byId.aqua_lv2;
const aqua3 = byId.aqua_lv3_support_lv3_4;
const aqua4 = byId.aqua_lv4_active;
const aqua10 = byId.aqua_lv10_active;
const unattended = byId.aqua_lv10_unattended;
requireRange(noAqua.winRate >= .45 && noAqua.winRate <= .60, '王水なしLv6の勝率が45〜60%外');
requireRange(noAqua.successMedianSeconds >= 250 && noAqua.successMedianSeconds <= 290, '王水なしLv6の成功中央値が250〜290秒外');
requireRange(aqua1.winRate < .35, '王水Lv1が敗北寄りではない');
requireRange(aqua2.winRate >= .30 && aqua2.winRate < .50 && aqua2.winRate > aqua1.winRate, '王水Lv2が惜敗寄りではない');
requireRange(aqua3.winRate >= .50 && aqua3.winRate <= .65, '王水Lv3＋支援Lv3〜4の勝率が50〜65%外');
requireRange(aqua3.successMedianSeconds >= 230 && aqua3.successMedianSeconds <= 270, '王水Lv3＋支援Lv3〜4の成功中央値が230〜270秒外');
requireRange(aqua4.winRate > aqua3.winRate && aqua4.successMedianSeconds > 175, '王水Lv4の成長実感または非即時勝利条件を満たさない');
requireRange(aqua10.winRate > aqua4.winRate && aqua10.successMedianSeconds > 150, '王水Lv10が強力かつ非即時勝利になっていない');
requireRange(unattended.winRate < .20, '王水Lv10の無操作突破率が高すぎる');
requireRange(noAqua.loopReachRateAmongNonEarly >= .80, '初回相当の非早期崩壊試行でV16一周相当へ80%以上到達しない');
requireRange(summaries.every((summary) => summary.stalemateRate < .05), '膠着率が5%以上のシナリオがある');

const output = {
  generatedAt: new Date().toISOString(),
  model: {
    type: 'fixed-seed one-second attrition model', trialsPerScenario: TRIALS,
    browserCalibration: 'Real runtime damage, six-hit spacing, preparation and Au phase timings are checked separately by browser-stage10.py. This model approximates player replenishment, escort interception and Au ability disruption as sustained factors.',
    limitations: 'It does not reproduce lane-by-lane targeting or individual quiz timing. Reported rates are deterministic comparative balance estimates, not player-population forecasts.'
  },
  summaries,
  passed: failures.length === 0,
  failures
};
fs.writeFileSync(path.join(projectRoot, 'docs/STAGE10_DIFFICULTY_RESULTS.json'), `${JSON.stringify(output, null, 2)}\n`);
if (failures.length) {
  console.error('Stage 10 difficulty simulation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  for (const summary of summaries) console.error(summary.id, summary);
  process.exit(1);
}
console.log('Stage 10 difficulty simulation passed.');
for (const summary of summaries) console.log(`${summary.id}: win ${(summary.winRate * 100).toFixed(1)}% / median ${summary.successMedianSeconds?.toFixed(1) ?? '-'}s / loop ${(summary.loopReachRateAmongNonEarly * 100).toFixed(1)}%`);
