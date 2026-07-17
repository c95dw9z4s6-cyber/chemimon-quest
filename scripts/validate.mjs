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
    if (q.pool === 'hard') {
      assert(q.id === undefined || (typeof q.id === 'string' && q.id.length > 0), `hard[${i}] invalid id`);
      assert(Number.isInteger(q.stageTier) && q.stageTier >= 1 && q.stageTier <= 5, `hard[${i}] invalid stageTier`);
      assert(typeof q.source === 'string' && q.source.trim().length > 0, `hard[${i}] missing source`);
    }
  }
  const hardIds = data.hardQuiz.map((q) => q.id).filter(Boolean);
  const duplicateQuestionIds = [...new Set(hardIds.filter((id, i) => hardIds.indexOf(id) !== i))];
  assert(duplicateQuestionIds.length === 0, `duplicate hard question ids: ${duplicateQuestionIds.join(', ')}`);
}

assert(html.includes(`const EXACT_QUESTION_HISTORY_LIMIT = ${config.questionHistory.exact};`), 'exact question history limit changed');
assert(html.includes(`const NEAR_QUESTION_HISTORY_LIMIT = ${config.questionHistory.near};`), 'near question history limit changed');
assert(html.includes(`const FAMILY_QUESTION_HISTORY_LIMIT = ${config.questionHistory.family};`), 'family question history limit changed');
assert(/function formatQuestionText\(value\)/.test(html), 'chemical punctuation formatter is missing');

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
} finally { fs.rmSync(tempDir, { recursive: true, force: true }); }

if (failures.length) {
  console.error('Chemion Quest validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Chemion Quest v${config.version} validation passed (${config.expectedCounts.basic} basic / ${config.expectedCounts.hard} hard).`);
