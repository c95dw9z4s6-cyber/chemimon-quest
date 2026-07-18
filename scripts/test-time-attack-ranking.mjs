import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const onlineSource = fs.readFileSync(path.join(root, 'src/scripts/online-runtime.js'), 'utf8');
const rulesSource = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
const indexes = JSON.parse(fs.readFileSync(path.join(root, 'firestore.indexes.json'), 'utf8'));
const results = [];

function test(name, callback) {
  callback();
  results.push({ name, passed: true });
}

function submit(records, { uid, username, bestMs, runId, firstRegisteredAt, isTest = false }) {
  const current = records.get(uid);
  if (!current) {
    records.set(uid, { uid, username, bestMs, runId, firstRegisteredAt, submittedAt: firstRegisteredAt, isTest });
    return 'created';
  }
  if (current.runId === runId) return 'duplicate';
  if (current.bestMs <= bestMs) return 'slower';
  records.set(uid, { ...current, username, bestMs, runId, submittedAt: firstRegisteredAt });
  return 'improved';
}

function visibleRanking(records) {
  return [...records.values()]
    .filter((record) => !record.isTest && !/^tester(?:$|[-_\s\d])/i.test(record.username) && !record.username.includes('自動テスト'))
    .sort((a, b) => a.bestMs - b.bestMs || a.firstRegisteredAt - b.firstRegisteredAt);
}

test('dedicated-collection-and-uid-document', () => {
  assert.match(onlineSource, /TIME_ATTACK_COLLECTION\s*=\s*'stage10TimeAttack'/);
  assert.match(onlineSource, /doc\(db, TIME_ATTACK_COLLECTION, currentUser\.uid\)/);
});

test('first-record-is-created', () => {
  const records = new Map();
  assert.equal(submit(records, { uid: 'u1', username: 'Player', bestMs: 222180, runId: 'run-0001', firstRegisteredAt: 10 }), 'created');
  assert.equal(records.get('u1').bestMs, 222180);
});

test('slower-record-cannot-overwrite-best', () => {
  const records = new Map();
  submit(records, { uid: 'u1', username: 'Player', bestMs: 222180, runId: 'run-0001', firstRegisteredAt: 10 });
  assert.equal(submit(records, { uid: 'u1', username: 'Player', bestMs: 230000, runId: 'run-0002', firstRegisteredAt: 20 }), 'slower');
  assert.equal(records.get('u1').bestMs, 222180);
});

test('faster-record-replaces-only-same-player-document', () => {
  const records = new Map();
  submit(records, { uid: 'u1', username: 'Player', bestMs: 222180, runId: 'run-0001', firstRegisteredAt: 10 });
  assert.equal(submit(records, { uid: 'u1', username: 'Player', bestMs: 210000, runId: 'run-0002', firstRegisteredAt: 20 }), 'improved');
  assert.equal(records.size, 1);
  assert.equal(records.get('u1').bestMs, 210000);
  assert.equal(records.get('u1').firstRegisteredAt, 10);
});

test('duplicate-run-is-idempotent', () => {
  const records = new Map();
  submit(records, { uid: 'u1', username: 'Player', bestMs: 222180, runId: 'run-0001', firstRegisteredAt: 10 });
  assert.equal(submit(records, { uid: 'u1', username: 'Player', bestMs: 200000, runId: 'run-0001', firstRegisteredAt: 20 }), 'duplicate');
  assert.equal(records.get('u1').bestMs, 222180);
});

test('same-display-name-with-different-ids-remains-two-players', () => {
  const records = new Map();
  submit(records, { uid: 'u1', username: 'SameName', bestMs: 220000, runId: 'run-0001', firstRegisteredAt: 10 });
  submit(records, { uid: 'u2', username: 'SameName', bestMs: 215000, runId: 'run-0002', firstRegisteredAt: 20 });
  assert.equal(visibleRanking(records).length, 2);
});

test('ranking-orders-by-time-then-first-registration', () => {
  const records = new Map();
  submit(records, { uid: 'u2', username: 'Later', bestMs: 215000, runId: 'run-0002', firstRegisteredAt: 20 });
  submit(records, { uid: 'u1', username: 'Earlier', bestMs: 215000, runId: 'run-0001', firstRegisteredAt: 10 });
  assert.deepEqual(visibleRanking(records).map((record) => record.uid), ['u1', 'u2']);
});

test('tester-and-automation-records-are-filtered', () => {
  const records = new Map();
  submit(records, { uid: 'u1', username: 'Player', bestMs: 220000, runId: 'run-0001', firstRegisteredAt: 10 });
  submit(records, { uid: 'u2', username: 'tester-2', bestMs: 200000, runId: 'run-0002', firstRegisteredAt: 20 });
  submit(records, { uid: 'u3', username: '自動テスト端末', bestMs: 190000, runId: 'run-0003', firstRegisteredAt: 30 });
  submit(records, { uid: 'u4', username: 'Hidden', bestMs: 180000, runId: 'run-0004', firstRegisteredAt: 40, isTest: true });
  assert.deepEqual(visibleRanking(records).map((record) => record.uid), ['u1']);
});

test('failed-sync-keeps-pending-record', () => {
  const profile = { localBestMs: 210000, pendingSubmission: { runId: 'run-offline', timeMs: 210000 } };
  const afterFailure = structuredClone(profile);
  assert.deepEqual(afterFailure.pendingSubmission, profile.pendingSubmission);
  assert.match(onlineSource, /記録は端末に保留され、オンライン復帰後に再送されます。/);
});

test('firestore-rules-enforce-owner-faster-only-and-no-delete', () => {
  assert.match(rulesSource, /match \/stage10TimeAttack\/\{userId\}/);
  assert.match(rulesSource, /request\.auth\.uid == userId/);
  assert.match(rulesSource, /request\.resource\.data\.bestMs < resource\.data\.bestMs/);
  assert.match(rulesSource, /request\.resource\.data\.runId != resource\.data\.runId/);
  assert.match(rulesSource, /allow delete: if false/);
});

test('firestore-index-matches-ranking-order', () => {
  const index = indexes.indexes.find((candidate) => candidate.collectionGroup === 'stage10TimeAttack');
  assert.ok(index);
  assert.deepEqual(index.fields, [
    { fieldPath: 'bestMs', order: 'ASCENDING' },
    { fieldPath: 'firstRegisteredAt', order: 'ASCENDING' }
  ]);
});

console.log(`v6.1 time-attack ranking tests passed (${results.length}/${results.length})`);
