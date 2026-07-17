import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { loadGameData, loadReleaseConfig, projectRoot, writeOutputs } from './lib.mjs';

const config = loadReleaseConfig();
const htmlPath = path.join(projectRoot, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

const SUPERSCRIPT_DIGITS = new Map(Object.entries({ '⁰':'0','¹':'1','²':'2','³':'3','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9','⁺':'+','⁻':'-' }));
function superscriptToNumber(value) {
  if (!value) return 0;
  const normalized = [...value].map((char) => SUPERSCRIPT_DIGITS.get(char) ?? char).join('').replace('−', '-');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
}
function parseNumericChoice(value) {
  const text = String(value ?? '').trim().replaceAll('−', '-');
  const match = text.match(/^([^\d+\-]*)([+\-]?(?:\d+(?:\.\d*)?|\.\d+))(?:\s*[×x]\s*10(?:\^?([+\-]?\d+)|([⁺⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)))?([^\d]*)$/u);
  if (!match) return null;
  const exponent = match[3] !== undefined ? Number(match[3]) : superscriptToNumber(match[4]);
  if (!Number.isFinite(exponent)) return null;
  const base = Number(match[2]);
  if (!Number.isFinite(base)) return null;
  return {
    prefix: match[1].trim(),
    suffix: match[5].trim(),
    value: base * (10 ** exponent)
  };
}
function numericChoiceIssues(question, label) {
  const parsed = question.options.map(parseNumericChoice);
  if (!parsed.every(Boolean)) return [];
  if (new Set(parsed.map((item) => item.prefix)).size !== 1 || new Set(parsed.map((item) => item.suffix)).size !== 1) return [];
  const issues = [];
  const values = parsed.map((item) => item.value);
  for (let left = 0; left < values.length; left += 1) {
    for (let right = left + 1; right < values.length; right += 1) {
      const scale = Math.max(Math.abs(values[left]), Math.abs(values[right]), Number.MIN_VALUE);
      if (Math.abs(values[left] - values[right]) <= 1e-12 * scale) {
        issues.push(`${label} has duplicate numeric choices: ${question.options[left]} / ${question.options[right]}`);
      }
    }
  }
  const correct = values[question.answer];
  if (correct !== 0) {
    values.forEach((value, index) => {
      if (index === question.answer || value === 0) return;
      const ratio = Math.abs(value / correct);
      const decimalShift = [0.001, 0.01, 0.1, 10, 100, 1000].some((target) => Math.abs(ratio - target) <= 1e-9 * Math.max(1, target));
      if (decimalShift) issues.push(`${label} has a decimal-shift distractor tied to the correct answer: ${question.options[index]} vs ${question.options[question.answer]}`);
    });
  }
  return issues;
}

const syncMismatches = writeOutputs({ check: true });
assert(syncMismatches.length === 0, `generated files out of sync: ${syncMismatches.join(', ')}`);
assert(new RegExp(`<title>Chemion Quest v${config.version.replaceAll('.', '\\.')}<\\/title>`).test(html), `title version must be v${config.version}`);
assert(new RegExp(`<h1>Chemion Quest <span>v${config.version.replaceAll('.', '\\.')}<\\/span><\\/h1>`).test(html), `header version must be v${config.version}`);
assert(html.includes(`Chemion Quest v${config.version} ${config.releaseName}`), 'footer release label is out of sync');
assert(html.includes(`<meta name="cq-app-version" content="${config.version}">`), 'app version meta is out of sync');
assert(html.includes(`const CURRENT_VERSION = '${config.version}';`), 'CURRENT_VERSION is out of sync');
assert(html.includes('<link rel="manifest" href="manifest.webmanifest">'), 'manifest link is missing');
assert(!html.includes('id="pwaUpdateLaterBtn"'), 'mandatory update must not include a later button');
assert(/body\.pwa-update-required/.test(html), 'mandatory update interaction lock is missing');
assert(/setTimeout\(\(\) => applyWaitingUpdate\(\), 1200\)/.test(html), 'mandatory automatic update trigger is missing');

const idMatches = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
const duplicateIds = [...new Set(idMatches.filter((id, i) => idMatches.indexOf(id) !== i))];
assert(duplicateIds.length === 0, `duplicate HTML ids: ${duplicateIds.join(', ')}`);

const sourceData = loadGameData();
const dataMatch = html.match(/<script>window\.gameData = (\{[\s\S]*?\});\s*<\/script>/);
assert(Boolean(dataMatch), 'window.gameData JSON block not found');
if (dataMatch) {
  const data = JSON.parse(dataMatch[1]);
  assert(JSON.stringify(data) === JSON.stringify(sourceData), 'embedded gameData differs from data/*.json');
  assert(data.version === config.saveVersion, `save version changed: ${data.version}`);
  assert(Array.isArray(data.quiz) && data.quiz.length === config.expectedCounts.basic, `basic quiz count must be ${config.expectedCounts.basic}, got ${data.quiz?.length}`);
  assert(Array.isArray(data.hardQuiz) && data.hardQuiz.length === config.expectedCounts.hard, `hard quiz count must be ${config.expectedCounts.hard}, got ${data.hardQuiz?.length}`);
  const all = [...data.quiz.map((q) => ({ ...q, pool: 'basic' })), ...data.hardQuiz.map((q) => ({ ...q, pool: 'hard' }))];
  for (const [i, q] of all.entries()) {
    assert(typeof q.q === 'string' && q.q.trim().length > 0, `${q.pool}[${i}] missing question`);
    assert(Array.isArray(q.options) && q.options.length === 4, `${q.pool}[${i}] must have 4 options`);
    assert(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4, `${q.pool}[${i}] invalid answer`);
    assert(typeof q.scope === 'string' && q.scope.length > 0, `${q.pool}[${i}] missing scope`);
    assert(typeof q.explanation === 'string' && q.explanation.trim().length > 0, `${q.pool}[${i}] missing explanation`);
    assert(typeof q.id === 'string' && q.id.trim().length > 0, `${q.pool}[${i}] missing id`);
    assert(typeof q.category === 'string' && q.category.trim().length > 0, `${q.pool}[${i}] missing category`);
    assert(Number.isInteger(q.difficultyLevel) && q.difficultyLevel >= 1 && q.difficultyLevel <= 5, `${q.pool}[${i}] invalid difficultyLevel`);
    assert(typeof q.cognitiveType === 'string' && q.cognitiveType.trim().length > 0, `${q.pool}[${i}] missing cognitiveType`);
    assert(typeof q.learningObjective === 'string' && q.learningObjective.trim().length > 0, `${q.pool}[${i}] missing learningObjective`);
    assert(Number.isFinite(q.estimatedSeconds) && q.estimatedSeconds > 0, `${q.pool}[${i}] invalid estimatedSeconds`);
    assert(typeof q.similarityGroup === 'string' && q.similarityGroup.trim().length > 0, `${q.pool}[${i}] missing similarityGroup`);
    assert(Array.isArray(q.optionFeedback) && q.optionFeedback.length === 4, `${q.pool}[${i}] optionFeedback must have 4 entries`);
    if (q.pool === 'hard') {
      assert(q.id === undefined || (typeof q.id === 'string' && q.id.length > 0), `hard[${i}] invalid id`);
      assert(Number.isInteger(q.stageTier) && q.stageTier >= 1 && q.stageTier <= 7, `hard[${i}] invalid stageTier`);
      assert(typeof q.source === 'string' && q.source.trim().length > 0, `hard[${i}] missing source`);
    }
  }
  const allQuestionIds = all.map((q) => q.id).filter(Boolean);
  const duplicateQuestionIds = [...new Set(allQuestionIds.filter((id, i) => allQuestionIds.indexOf(id) !== i))];
  assert(duplicateQuestionIds.length === 0, `duplicate question ids: ${duplicateQuestionIds.join(', ')}`);

  for (const [i, q] of data.quiz.entries()) {
    for (const issue of numericChoiceIssues(q, `basic[${i}]`)) failures.push(issue);
  }
  for (const [i, q] of data.hardQuiz.entries()) {
    for (const issue of numericChoiceIssues(q, `hard[${i}]`)) failures.push(issue);
  }

  assert(Array.isArray(data.mockExams) && data.mockExams.length === config.expectedCounts.mockExams, `mock exam count must be ${config.expectedCounts.mockExams}, got ${data.mockExams?.length}`);
  const mockIds = [];
  let mockQuestionCount = 0;
  for (const [examIndex, exam] of (data.mockExams || []).entries()) {
    const label = `mockExams[${examIndex}]`;
    assert(typeof exam.id === 'string' && exam.id.trim().length > 0, `${label} missing id`);
    mockIds.push(exam.id);
    assert(typeof exam.title === 'string' && exam.title.trim().length > 0, `${label} missing title`);
    assert(typeof exam.context === 'string' && exam.context.trim().length > 40, `${label} needs a shared source/context passage`);
    assert(typeof exam.source === 'string' && exam.source.trim().length > 0, `${label} missing source`);
    assert(typeof exam.scope === 'string' && exam.scope.trim().length > 0, `${label} missing scope`);
    assert(Number.isInteger(exam.passScore) && exam.passScore >= 1, `${label} invalid passScore`);
    assert(Array.isArray(exam.questions) && exam.questions.length === 5, `${label} must have 5 subquestions`);
    for (const [questionIndex, q] of (exam.questions || []).entries()) {
      const questionLabel = `${label}.questions[${questionIndex}]`;
      mockQuestionCount += 1;
      assert(typeof q.q === 'string' && q.q.trim().length > 0, `${questionLabel} missing question`);
      assert(Array.isArray(q.options) && q.options.length === 4, `${questionLabel} must have 4 options`);
      assert(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4, `${questionLabel} invalid answer`);
      assert(typeof q.explanation === 'string' && q.explanation.trim().length > 0, `${questionLabel} missing explanation`);
      assert(typeof q.category === 'string' && q.category.trim().length > 0, `${questionLabel} missing category`);
      if (Array.isArray(q.options) && q.options.length === 4 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4) {
        for (const issue of numericChoiceIssues(q, questionLabel)) failures.push(issue);
      }
    }
  }
  const duplicateMockIds = [...new Set(mockIds.filter((id, i) => mockIds.indexOf(id) !== i))];
  assert(duplicateMockIds.length === 0, `duplicate mock exam ids: ${duplicateMockIds.join(', ')}`);
  assert(mockQuestionCount === config.expectedCounts.mockQuestions, `mock subquestion count must be ${config.expectedCounts.mockQuestions}, got ${mockQuestionCount}`);
}

assert(html.includes(`const EXACT_QUESTION_HISTORY_LIMIT = ${config.questionHistory.exact};`), 'exact question history limit changed');
assert(html.includes(`const NEAR_QUESTION_HISTORY_LIMIT = ${config.questionHistory.near};`), 'near question history limit changed');
assert(html.includes(`const FAMILY_QUESTION_HISTORY_LIMIT = ${config.questionHistory.family};`), 'family question history limit changed');
assert(/function formatQuestionText\(value\)/.test(html), 'chemical punctuation formatter is missing');
assert(html.includes('const SPACING_CORRECT_INTERVAL_DAYS = [3, 7, 14, 30, 45, 60];'), 'spacing intervals are missing');
assert(html.includes('const SPACING_INCORRECT_DELAY_HOURS = 12;'), 'incorrect-answer spacing is missing');
assert(/function selectSpacedQuestion\(pool, isHard = false, now = Date\.now\(\)\)/.test(html), 'spaced question selector is missing');
assert(/updateQuestionSpacing\(data, question, correct, mode\)/.test(html), 'spacing result recording is missing');
assert(html.includes('data-settings-view="mock"'), 'mock exam settings entry is missing');
assert(/function renderMockExamView\(container\)/.test(html), 'mock exam list renderer is missing');
assert(/function finishMockExam\(\)/.test(html), 'mock exam result flow is missing');
assert(html.includes("id: 'initial_energy'") && html.includes("id: 'energy_regen'") && html.includes("id: 'coin_boost'"), 'next-battle mock rewards are incomplete');
assert(html.includes('mockExamProgress: JSON.parse(JSON.stringify(mockExamProgress))'), 'mock exam progress is not saved');
assert(html.includes('mockReward: activeMockReward ? { ...activeMockReward } : null'), 'active mock reward is not saved');
assert(/29, 30, D\.version/.test(html), 'v3.95 save compatibility is missing');
assert(/function migrateSaveData\(input\)/.test(html), 'explicit save migration function is missing');
assert(html.includes('id="pauseRestartBtn"'), 'pause restart button is missing');
assert(/function restartCurrentStageFromPause\(\)/.test(html), 'pause restart handler is missing');
assert(/resetStage\(\{ keepProgress: true \}\)/.test(html), 'pause restart must reset the current stage while preserving progress');
assert(html.includes('const SPEED_TRIAL_COOLDOWN_MS = 30 * 1000;'), '30-second speed trial cooldown is missing');
assert(html.includes('const SPEED_TRIAL_RETRY_KEY = "chemionQuestSpeedTrialRetryV1";'), 'persistent speed trial cooldown key is missing');
assert(/speedTrialRetryAt: Math\.max\(speedTrialRetryAt, storedSpeedTrialRetryAt\(\)\)/.test(html), 'speed trial cooldown is not saved');
assert(/再挑戦まで \${cooldownSeconds}秒/.test(html), 'speed trial cooldown countdown is missing from the button');
assert(html.includes('中和によるダメージ倍率の変化はありません'), 'neutralization guide clarification is missing');
assert(html.includes('弱酸・弱塩基そのものには遊離補正なし'), 'chemically correct liberation guide is missing');
assert(html.includes('CH₃COO⁻ + H⁺ → CH₃COOH'), 'weak-acid liberation example is missing');
assert(html.includes('id="bossPhaseFx"'), 'second-phase transition overlay is missing');
assert(/function beginBossSecondPhaseSequence\(enemy\)/.test(html), 'second-phase cinematic sequence is missing');
assert(html.includes('bossPhaseTransitionActive = true'), 'second-phase battle freeze is missing');
assert(html.includes('triggerBossArrivalEffect(enemy, { formula: enemy.formula, name: enemy.name })'), 'second phase does not replay standard boss arrival effect');
assert(html.includes('@keyframes bossPhaseCollapse'), 'second-phase reconstruction animation is missing');
const stage5Unlocked = sourceData.achievementDefinitions.find((item) => item.id === 'stage5_unlocked');
const stage5Clear = sourceData.achievementDefinitions.find((item) => item.id === 'stage5_clear');
assert(stage5Unlocked?.metric === 'highestStageReached' && stage5Unlocked?.goal === 5, 'stage5_unlocked must use highestStageReached goal 5');
assert(stage5Clear?.metric === 'stage5Clears' && stage5Clear?.goal === 1, 'stage5_clear must use stage5Clears goal 1');
assert(html.includes('const FLYING_EXTRA_RENDER_OFFSET = 42;'), 'flying render offset is missing');
assert(html.includes('function summonCooldownRemaining(unitId)'), 'summon cooldown normalizer is missing');
assert(html.includes('SUMMON_UI_REFRESH_INTERVAL = 0.1'), 'summon cooldown UI sync is missing');
assert(html.includes('updateRequestStatus') && html.includes('実装済みにする'), 'request status management is missing');
const requestRules = fs.readFileSync(path.join(projectRoot, 'firestore.rules'), 'utf8');
assert(requestRules.includes('allow update: if request.auth != null && validRequestStatusUpdate()'), 'universal request update rule is missing');
assert(requestRules.includes('allow delete: if request.auth != null;'), 'universal request delete rule is missing');
for (const file of ['src/styles/core.css','src/styles/release.css','src/scripts/game-runtime.js','src/scripts/online-runtime.js','src/scripts/pwa-runtime.js','config/features.json']) {
  assert(fs.existsSync(path.join(projectRoot, file)), `missing modular source: ${file}`);
}


  const stage8 = sourceData.stage8;
  const stage8Boss = stage8?.enemies?.find((enemy) => enemy.boss);
  assert(stage8?.id === 8 && stage8?.waves?.length === 11, 'Stage 8 must have 11 waves');
  assert(stage8Boss?.wipeAlliesOnArrival === true && !stage8Boss?.phaseTwo, 'Stage 8 boss special arrival/no-phase rule missing');
  assert(stage8Boss?.hp <= 500 && stage8Boss?.speed > 48, 'Stage 8 boss HP/speed tuning is invalid');
  assert(sourceData.maxEnergyCapacityLevel === 12 && sourceData.maxEnergy + sourceData.energyCapacityPerLevel * 11 === 265, 'Energy capacity must reach Lv.12/max265');

for (const file of ['manifest.webmanifest', 'version.json', 'sw.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png']) {
  assert(fs.existsSync(path.join(projectRoot, file)), `missing PWA asset: ${file}`);
}
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'manifest.webmanifest'), 'utf8'));
  const sizes = new Set((manifest.icons || []).map((x) => x.sizes));
  assert(sizes.has('192x192'), 'manifest needs 192x192 icon');
  assert(sizes.has('512x512'), 'manifest needs 512x512 icon');
  assert(manifest.start_url === './' && manifest.scope === './', 'manifest start_url/scope must be project-relative');
  assert(manifest.display === 'standalone', 'manifest display must be standalone');
} catch (error) { failures.push(`manifest parse failed: ${error.message}`); }
try {
  const published = JSON.parse(fs.readFileSync(path.join(projectRoot, 'version.json'), 'utf8'));
  assert(published.version === config.version, 'version.json version is out of sync');
  assert(published.saveVersion === config.saveVersion, 'version.json saveVersion is out of sync');
  assert(published.releaseDate === config.releaseDate, 'version.json releaseDate is out of sync');
} catch (error) { failures.push(`version.json parse failed: ${error.message}`); }

function pngDimensions(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.length < 24 || buffer.toString('hex', 0, 8) !== '89504e470d0a1a0a') throw new Error('not a PNG');
  return [buffer.readUInt32BE(16), buffer.readUInt32BE(20)];
}
for (const [file, width, height] of [
  ['icons/icon-192.png', 192, 192],
  ['icons/icon-512.png', 512, 512],
  ['icons/icon-maskable-512.png', 512, 512],
  ['icons/apple-touch-icon.png', 180, 180]
]) {
  try {
    const [actualWidth, actualHeight] = pngDimensions(path.join(projectRoot, file));
    assert(actualWidth === width && actualHeight === height, `${file} dimensions must be ${width}x${height}, got ${actualWidth}x${actualHeight}`);
  } catch (error) { failures.push(`${file}: ${error.message}`); }
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chemion-check-'));
try {
  const scriptRegex = /<script([^>]*)>([\s\S]*?)<\/script>/g;
  let match; let count = 0;
  while ((match = scriptRegex.exec(html))) {
    const attrs = match[1] || '';
    if (/\bsrc=/.test(attrs)) continue;
    const ext = /type=["']module["']/.test(attrs) ? '.mjs' : '.js';
    const temp = path.join(tempDir, `inline-${count}${ext}`);
    fs.writeFileSync(temp, match[2]);
    try { execFileSync(process.execPath, ['--check', temp], { stdio: 'pipe' }); }
    catch (error) { failures.push(`inline script ${count} syntax error: ${String(error.stderr || error.message)}`); }
    count += 1;
  }
  assert(count >= 4, `expected at least 4 inline scripts, got ${count}`);
  try { execFileSync(process.execPath, ['--check', path.join(projectRoot, 'sw.js')], { stdio: 'pipe' }); }
  catch (error) { failures.push(`sw.js syntax error: ${String(error.stderr || error.message)}`); }
  try { execFileSync(process.execPath, ['--check', path.join(projectRoot, 'scripts/build.mjs')], { stdio: 'pipe' }); }
  catch (error) { failures.push(`build.mjs syntax error: ${String(error.stderr || error.message)}`); }
  try { execFileSync(process.execPath, ['--check', path.join(projectRoot, 'scripts/release.mjs')], { stdio: 'pipe' }); }
  catch (error) { failures.push(`release.mjs syntax error: ${String(error.stderr || error.message)}`); }
  try { execFileSync(process.execPath, [path.join(projectRoot, 'scripts/test-rotation.mjs')], { stdio: 'pipe', cwd: projectRoot }); }
  catch (error) { failures.push(`question rotation test failed: ${String(error.stderr || error.message)}`); }
  try { execFileSync(process.execPath, [path.join(projectRoot, 'scripts/test-features.mjs')], { stdio: 'pipe', cwd: projectRoot }); }
  catch (error) { failures.push(`feature regression test failed: ${String(error.stderr || error.message)}`); }
  try { execFileSync(process.execPath, [path.join(projectRoot, 'scripts/audit-features.mjs')], { stdio: 'pipe', cwd: projectRoot }); }
  catch (error) { failures.push(`feature audit failed: ${String(error.stderr || error.message)}`); }
  try { execFileSync(process.execPath, [path.join(projectRoot, 'scripts/audit-questions.mjs')], { stdio: 'pipe', cwd: projectRoot }); }
  catch (error) { failures.push(`question quality audit failed: ${String(error.stderr || error.message)}`); }
  try { execFileSync(process.execPath, [path.join(projectRoot, 'scripts/audit-chemistry.mjs')], { stdio: 'pipe', cwd: projectRoot }); }
  catch (error) { failures.push(`chemistry audit failed: ${String(error.stderr || error.message)}`); }
} finally { fs.rmSync(tempDir, { recursive: true, force: true }); }

if (failures.length) {
  console.error('Chemion Quest validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Chemion Quest v${config.version} validation passed (${config.expectedCounts.basic} basic / ${config.expectedCounts.hard} hard / ${config.expectedCounts.mockExams} mock exams / ${config.expectedCounts.mockQuestions} subquestions).`);
