import fs from 'node:fs';
import path from 'node:path';
import { projectRoot, readJson, loadReleaseConfig } from './lib.mjs';

const core = readJson('data/game-core.json');
const hard = readJson('data/hard-questions.json');
const release = loadReleaseConfig();
const runtime = fs.readFileSync(path.join(projectRoot, 'src/scripts/game-runtime.js'), 'utf8');
const template = fs.readFileSync(path.join(projectRoot, 'src/index.template.html'), 'utf8');
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

const SUB = { '₀':'0','₁':'1','₂':'2','₃':'3','₄':'4','₅':'5','₆':'6','₇':'7','₈':'8','₉':'9' };
const SUP = { '⁰':'0','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9' };
function normalizeDigits(text, table) { return [...text].map((char) => table[char] ?? char).join(''); }
function parseSpecies(raw) {
  let text = raw.trim();
  const coefficientMatch = text.match(/^(\d+)\s*(.*)$/u);
  const coefficient = coefficientMatch ? Number(coefficientMatch[1]) : 1;
  if (coefficientMatch) text = coefficientMatch[2];
  let charge = 0;
  const chargeMatch = text.match(/([⁰¹²³⁴⁵⁶⁷⁸⁹]*)([⁺⁻])$/u);
  if (chargeMatch) {
    const magnitude = chargeMatch[1] ? Number(normalizeDigits(chargeMatch[1], SUP)) : 1;
    charge = chargeMatch[2] === '⁺' ? magnitude : -magnitude;
    text = text.slice(0, -chargeMatch[0].length);
  }
  if (text === 'e') return { coefficient, atoms: {}, charge: -1 };
  const atoms = {};
  const regex = /([A-Z][a-z]?)([₀₁₂₃₄₅₆₇₈₉]*|\d*)/gu;
  let consumed = '';
  for (const match of text.matchAll(regex)) {
    consumed += match[0];
    const count = match[2] ? Number(normalizeDigits(match[2], SUB)) : 1;
    atoms[match[1]] = (atoms[match[1]] || 0) + count;
  }
  assert(consumed === text, `反応式を解析できない化学種: ${raw}`);
  return { coefficient, atoms, charge };
}
function sideTotals(side) {
  const totals = { atoms: {}, charge: 0 };
  for (const token of side.split(/\s+\+\s+/u)) {
    const species = parseSpecies(token);
    for (const [element, count] of Object.entries(species.atoms)) totals.atoms[element] = (totals.atoms[element] || 0) + count * species.coefficient;
    totals.charge += species.charge * species.coefficient;
  }
  return totals;
}
function balanced(reaction) {
  const parts = reaction.split('→');
  if (parts.length !== 2) return false;
  const left = sideTotals(parts[0]);
  const right = sideTotals(parts[1]);
  const elements = new Set([...Object.keys(left.atoms), ...Object.keys(right.atoms)]);
  return left.charge === right.charge && [...elements].every((el) => (left.atoms[el] || 0) === (right.atoms[el] || 0));
}
function allEntities() {
  const stages = [
    { id: 1, units: core.units, enemies: core.enemies },
    core.stage2, core.stage3, core.stage4, core.stage5, core.stage6, core.stage7, core.stage8
  ];
  const rows = [];
  for (const stage of stages) {
    for (const side of ['units','enemies']) {
      for (const entity of stage[side] || []) {
        rows.push({ stage: stage.id, side, entity });
        if (entity.phaseTwo) rows.push({ stage: stage.id, side: `${side}:phase2`, entity: entity.phaseTwo });
      }
    }
  }
  return rows;
}

const rows = allEntities();
const targets = rows.filter(({ entity }) => entity.affinityTarget);
for (const { stage, side, entity } of targets) {
  const label = `Stage ${stage} ${side} ${entity.formula} ${entity.name}`;
  assert(['weak_acid_conjugate_base','weak_base_conjugate_acid'].includes(entity.affinityTarget), `${label}: 未知のaffinityTarget`);
  assert(typeof entity.liberationReaction === 'string' && entity.liberationReaction.includes('→'), `${label}: 遊離反応式がない`);
  if (entity.liberationReaction) assert(balanced(entity.liberationReaction), `${label}: 原子数または電荷が不整合: ${entity.liberationReaction}`);
  if (entity.affinityTarget === 'weak_acid_conjugate_base') {
    assert(entity.chemistryLabel === '弱酸由来', `${label}: 表示は「弱酸由来」である必要があります`);
    assert(entity.liberationReaction.includes('H⁺'), `${label}: 弱酸の遊離式にH⁺がありません`);
  }
  if (entity.affinityTarget === 'weak_base_conjugate_acid') {
    assert(entity.chemistryLabel === '弱塩基由来', `${label}: 表示は「弱塩基由来」である必要があります`);
    assert(entity.liberationReaction.includes('OH⁻'), `${label}: 弱塩基の遊離式にOH⁻がありません`);
  }
}

for (const { stage, side, entity } of rows) {
  const label = `Stage ${stage} ${side} ${entity.formula || ''} ${entity.name || ''}`;
  if (['CH₃COOH','HCOOH','H₂CO₃','NH₃','C₂H₅NH₂','H₂O₂'].includes(entity.formula)) {
    assert(!entity.affinityTarget, `${label}: 弱酸・弱塩基本体またはH₂O₂を遊離対象にしてはいけません`);
  }
  assert(!/(巨核|暴走形態|歩兵|射手|散布体|飛行体|防壁)/u.test(entity.name || ''), `${label}: 正式名称に戦闘役割が混入しています`);
}

assert(core.chemistryAffinityVersion === 3, 'chemistryAffinityVersion must be 3');
assert(runtime.includes("target === 'weak_acid_conjugate_base'"), '強酸の新しい相性判定がありません');
assert(runtime.includes("target === 'weak_base_conjugate_acid'"), '強塩基の新しい相性判定がありません');
assert(!runtime.includes("attackClass === 'strong_acid' && defendClass === 'weak_acid'"), '旧・強酸→弱酸判定が残っています');
assert(!runtime.includes("attackClass === 'strong_base' && defendClass === 'weak_base'"), '旧・強塩基→弱塩基判定が残っています');
assert(template.includes('弱酸・弱塩基そのものには遊離補正なし'), '遊び方に遊離対象の説明がありません');
assert(template.includes('酸・塩基の強弱は電離の程度を表し'), '酸の強弱と危険性を分ける注意書きがありません');

const stage3Boss = core.stage3.enemies.find((x) => x.id === 'hypochlorousBoss');
assert(stage3Boss?.formula === 'ClO⁻', 'Stage 3第1形態はClO⁻である必要があります');
assert(stage3Boss?.phaseTwo?.formula === 'Cl⁻', 'Stage 3第2形態はCl⁻である必要があります');
assert(stage3Boss?.phaseTwo?.transformText === '還元反応：ClO⁻ + 2H⁺ + 2e⁻ → Cl⁻ + H₂O', 'Stage 3還元式が不正確です');
assert(balanced('ClO⁻ + 2H⁺ + 2e⁻ → Cl⁻ + H₂O'), 'Stage 3還元式の原子数または電荷が不整合です');
const stage5Boss = core.stage5.enemies.find((x) => x.id === 'hydrogenPeroxideBoss5');
assert(stage5Boss?.chemistryClass === 'redox' && !stage5Boss?.affinityTarget, 'H₂O₂ BOSSは酸化還元属性・遊離補正なしである必要があります');
assert(stage5Boss?.phaseTwo?.transformText === '分解反応：2H₂O₂ → 2H₂O + O₂', 'H₂O₂の分解反応式が不正確です');
assert(balanced('2H₂O₂ → 2H₂O + O₂'), 'H₂O₂分解式の原子数が不整合です');

const stage6 = core.stage6;
assert(stage6?.enemies?.length >= 9, 'Stage 6 enemies are missing');
assert(stage6?.enemies?.every((enemy) => enemy.affinityTarget === 'weak_acid_conjugate_base'), 'Stage 6 enemies must all be weak-acid-derived conjugate bases');
assert(stage6?.units?.[4]?.chemistryClass === 'strong_acid', 'Stage 6 fifth unit must be a strong acid');
const stage7 = core.stage7;
assert(stage7?.enemies?.length >= 9, 'Stage 7 enemies are missing');
assert(stage7?.enemies?.every((enemy) => enemy.affinityTarget === 'weak_base_conjugate_acid'), 'Stage 7 enemies must all be weak-base-derived conjugate acids');
assert(stage7?.units?.[4]?.chemistryClass === 'strong_base', 'Stage 7 fifth unit must be a strong base');
assert(!JSON.stringify(core).includes('selfDamagePerSecond'), 'Flying self-damage remains in chemistry/game data');
const stage8Boss = core.stage8?.enemies?.find((enemy) => enemy.boss);
assert(stage8Boss?.formula === 'O₃' && stage8Boss?.name === 'オゾン', 'Stage 8 BOSSの化学式・正式名称が不正確です');
assert(stage8Boss?.chemistryClass === 'redox' && !stage8Boss?.affinityTarget, 'Stage 8 BOSSは酸化還元属性・遊離補正なしである必要があります');

const corruptedPattern = /(pH|pOH|Q|H⁺|OH⁻|電子|係数比[^。\n]*)のモル質量|反応したHClのモル質量/u;
for (const q of hard) {
  const text = [q.explanation, ...(q.hints || [])].join('\n');
  assert(!corruptedPattern.test(text), `${q.id}: 単位・用語が破損した解説が残っています`);
}

const report = [
  `# Chemion Quest v${release.version} 化学監査`,
  '',
  `監査日時: ${new Date().toISOString()}`,
  '',
  '## 結果',
  '',
  `- 監査したユニット・敵・第二形態: ${rows.length}件`,
  `- 遊離相性を持つ化学種: ${targets.length}件`,
  `- 遊離反応式の原子数・電荷検査: ${targets.length}件`,
  `- 難問の破損解説修正対象: 12問`,
  `- 必須検査: ${failures.length ? '不合格' : '合格'}`,
  '',
  '## v4.6で維持・追加した化学ルール',
  '',
  '- 強酸は「弱酸の塩に由来する陰イオン」にのみ1.4倍。弱酸そのものは対象外です。',
  '- 強塩基は「弱塩基の塩に由来する陽イオン」にのみ1.4倍。弱塩基そのものは対象外です。',
  '- 遊離発生時は対象ごとの反応式を表示します。',
  '- H₂O₂は酸化還元属性とし、強酸の有利対象から外しました。',
  '- ClO⁻からCl⁻への第二形態変化は、酸性条件での還元半反応として表示します。',
  '- 中和・酸塩基反応の表示は演出であり、追加ダメージはありません。',
  '- Stage 6の敵はすべて弱酸由来陰イオンで、強酸による弱酸の遊離相性と一致します。',
  '- Stage 7の敵はすべて弱塩基由来陽イオンで、強塩基による弱塩基の遊離相性と一致します。',
  '- 半反応式の追加問題は原子数・電荷・電子数をそろえて監査します。',
  '- Stage 8のO₃は酸化還元属性とし、全味方消去や速度はゲーム上の役割で、実際の化学的性質を示さないと明記します。',
  '',
  '## 表示方針',
  '',
  '- 名称は「CH₃COO⁻／酢酸イオン」のように化学式と正式名称を使用します。',
  '- 歩兵・射手・BOSSなどのゲーム上の役割は物質名へ混ぜず、役割欄で表示します。',
  '- 「弱酸由来」「弱塩基由来」は遊離相性の対象区分であり、安全性や実際の反応速度を表しません。',
  '',
  '## 公開後に確認する項目',
  '',
  '- iPhone Safariで反応式が画面外へはみ出さないこと。',
  '- Stage 1〜5で旧セーブの進行・強化が維持されること。',
  '- Stage 3・Stage 5の第二形態演出と音量が従来どおり動くこと。'
];
fs.writeFileSync(path.join(projectRoot, 'docs/CHEMISTRY_AUDIT.md'), `${report.join('\n')}\n`);

if (failures.length) {
  console.error('Chemistry audit failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`Chemistry audit passed (${rows.length} entities / ${targets.length} liberation targets).`);
