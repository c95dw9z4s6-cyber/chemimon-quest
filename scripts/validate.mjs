import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const htmlPath = path.join(root, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

assert(/<title>Chemion Quest v3\.6\.1<\/title>/.test(html), 'title version must be v3.6.1');
assert(/<h1>Chemion Quest <span>v3\.6\.1<\/span><\/h1>/.test(html), 'header version must be v3.6.1');
assert(/Chemion Quest v3\.6\.1 必須アップデート修正版/.test(html), 'footer version must be v3.6.1');
assert(/<link rel="manifest" href="manifest\.webmanifest">/.test(html), 'manifest link is missing');
assert(!html.includes('id="pwaUpdateLaterBtn"'), 'mandatory update must not include a later button');
assert(/body\.pwa-update-required/.test(html), 'mandatory update interaction lock is missing');
assert(/setTimeout\(\(\) => applyWaitingUpdate\(\), 1200\)/.test(html), 'mandatory automatic update trigger is missing');

const idMatches = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
const duplicateIds = [...new Set(idMatches.filter((id, i) => idMatches.indexOf(id) !== i))];
assert(duplicateIds.length === 0, `duplicate HTML ids: ${duplicateIds.join(', ')}`);

const dataMatch = html.match(/<script>window\.gameData = (\{[\s\S]*?\});\s*<\/script>/);
assert(Boolean(dataMatch), 'window.gameData JSON block not found');
if (dataMatch) {
  const data = JSON.parse(dataMatch[1]);
  assert(data.version === 27, `save version changed: ${data.version}`);
  assert(Array.isArray(data.quiz) && data.quiz.length === 320, `basic quiz count must be 320, got ${data.quiz?.length}`);
  assert(Array.isArray(data.hardQuiz) && data.hardQuiz.length === 182, `hard quiz count must be 182, got ${data.hardQuiz?.length}`);
  const all = [...data.quiz.map((q) => ({...q, pool:'basic'})), ...data.hardQuiz.map((q) => ({...q, pool:'hard'}))];
  for (const [i, q] of all.entries()) {
    assert(typeof q.q === 'string' && q.q.trim().length > 0, `${q.pool}[${i}] missing question`);
    assert(Array.isArray(q.options) && q.options.length === 4, `${q.pool}[${i}] must have 4 options`);
    assert(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 4, `${q.pool}[${i}] invalid answer`);
    assert(typeof q.scope === 'string' && q.scope.length > 0, `${q.pool}[${i}] missing scope`);
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

for (const file of ['manifest.webmanifest','version.json','sw.js','icons/icon-192.png','icons/icon-512.png','icons/icon-maskable-512.png','icons/apple-touch-icon.png']) {
  assert(fs.existsSync(path.join(root, file)), `missing PWA asset: ${file}`);
}
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
  const sizes = new Set((manifest.icons || []).map((x) => x.sizes));
  assert(sizes.has('192x192'), 'manifest needs 192x192 icon');
  assert(sizes.has('512x512'), 'manifest needs 512x512 icon');
  assert(manifest.start_url === './' && manifest.scope === './', 'manifest start_url/scope must be project-relative');
  assert(manifest.display === 'standalone', 'manifest display must be standalone');
} catch (error) { failures.push(`manifest parse failed: ${error.message}`); }

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chemion-check-'));
try {
  const scriptRegex = /<script([^>]*)>([\s\S]*?)<\/script>/g;
  let match; let count = 0;
  while ((match = scriptRegex.exec(html))) {
    const attrs = match[1] || '';
    const ext = /type=["']module["']/.test(attrs) ? '.mjs' : '.js';
    const temp = path.join(tempDir, `inline-${count}${ext}`);
    fs.writeFileSync(temp, match[2]);
    try { execFileSync(process.execPath, ['--check', temp], { stdio: 'pipe' }); }
    catch (error) { failures.push(`inline script ${count} syntax error: ${String(error.stderr || error.message)}`); }
    count += 1;
  }
  assert(count >= 4, `expected at least 4 inline scripts, got ${count}`);
  try { execFileSync(process.execPath, ['--check', path.join(root,'sw.js')], { stdio:'pipe' }); }
  catch (error) { failures.push(`sw.js syntax error: ${String(error.stderr || error.message)}`); }
} finally { fs.rmSync(tempDir, { recursive:true, force:true }); }

if (failures.length) {
  console.error('Chemion Quest validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('Chemion Quest v3.6.1 validation passed.');
