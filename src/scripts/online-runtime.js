const D = window.gameData;
const SAVE_KEY = D.saveKey;
const NICK_KEY = 'chemionQuestNicknameV13';
const ONLINE_SEEN_KEY = 'chemionQuestOnlinePromptV13';
const $ = (id) => document.getElementById(id);
let auth = null;
let db = null;
let currentUser = null;
let configured = false;
let syncing = false;
let timeAttackSyncing = false;
let timeAttackRankingOpen = false;
const TIME_ATTACK_COLLECTION = 'stage10TimeAttack';
const TIME_ATTACK_MIN_MS = 45000;
const TIME_ATTACK_MAX_MS = 2 * 60 * 60 * 1000;

function firebaseConfigured() {
  const c = D.firebaseConfig || {};
  return ['apiKey', 'authDomain', 'projectId', 'appId'].every((key) => typeof c[key] === 'string' && c[key].trim());
}

function cleanNickname(raw) {
  return String(raw || '').normalize('NFKC').trim().replace(/[\r\n\t]/g, ' ');
}

function validateNickname(raw) {
  const name = cleanNickname(raw);
  if (name.length < 2 || name.length > 16) return { ok: false, message: '2〜16文字で入力してください。' };
  if (/[<>]/.test(name)) return { ok: false, message: '「<」「>」は使用できません。' };
  return { ok: true, name };
}

function readLocalStats() {
  try {
    const save = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
    const progress = save.progress || {};
    const stats = progress.cumulativeStats || {};
    const achievements = progress.achievementState || {};
    return {
      achievementCount: Object.values(achievements).filter((value) => value && value.unlocked).length,
      chemistryLevel: Number(progress.chemistryLevel) || 1,
      totalKills: Number(stats.totalKills) || 0,
      totalCoinsEarned: Number(stats.totalCoinsEarned) || 0,
      highestStageReached: Number(stats.highestStageReached) || 1,
      highestStageCleared: Number(stats.highestStageCleared) || 0
    };
  } catch {
    return { achievementCount: 0, chemistryLevel: 1, totalKills: 0, totalCoinsEarned: 0, highestStageReached: 1, highestStageCleared: 0 };
  }
}

function guestAssistWasUsed() {
  try {
    const save = JSON.parse(localStorage.getItem(D.saveKey) || 'null');
    return Boolean(save?.progress?.guestAssistUsed || save?.progress?.guestAssistEnabled);
  } catch {
    return false;
  }
}

function formatTimeAttackMs(value) {
  const milliseconds = Math.max(0, Math.round(Number(value) || 0));
  const minutes = Math.floor(milliseconds / 60000);
  const seconds = Math.floor(milliseconds % 60000 / 1000);
  const hundredths = Math.floor(milliseconds % 1000 / 10);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

function readTimeAttackProfile() {
  try {
    const save = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
    return { save, profile: save?.progress?.timeAttack && typeof save.progress.timeAttack === 'object' ? save.progress.timeAttack : {} };
  } catch {
    return { save: null, profile: {} };
  }
}

function writeTimeAttackProfile(mutator) {
  try {
    const { save, profile } = readTimeAttackProfile();
    if (!save?.progress) return false;
    const next = mutator({ ...profile });
    if (!next || typeof next !== 'object') return false;
    save.progress.timeAttack = next;
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    window.dispatchEvent(new CustomEvent('cq-ta-profile-updated', { detail: { ...next } }));
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}

function validPendingTimeAttack(value) {
  const timeMs = Math.round(Number(value?.timeMs));
  const runId = String(value?.runId || '');
  return runId && Number.isInteger(timeMs) && timeMs >= TIME_ATTACK_MIN_MS && timeMs <= TIME_ATTACK_MAX_MS
    ? { runId, timeMs, completedAt: String(value.completedAt || '') }
    : null;
}

function isFilteredTimeAttackRecord(record) {
  const name = String(record?.username || '').normalize('NFKC').trim().toLowerCase();
  return record?.isTest === true || /^tester(?:$|[-_\s\d])/.test(name) || name.includes('自動テスト');
}

function rankingScore(x) {
  const cleared = Math.max(0, Math.min(5, Number(x.highestStageCleared) || 0));
  const reached = Math.max(1, Math.min(5, Number(x.highestStageReached) || 1));
  const stageTier = cleared * 2 + (reached > cleared ? 1 : 0);
  return stageTier * 10000000000000
    + x.achievementCount * 100000000
    + x.chemistryLevel * 1000000
    + Math.min(x.totalKills, 999999) * 100
    + Math.min(x.totalCoinsEarned, 99);
}

function setStatus(text) {
  if ($('onlineStatus')) $('onlineStatus').textContent = text;
}

function openProfile(force = false) {
  $('nicknameInput').value = localStorage.getItem(NICK_KEY) || '';
  $('profileCancelBtn').hidden = force;
  $('profileModal').hidden = false;
  $('nicknameInput').focus();
}

function closeProfile() {
  $('profileModal').hidden = true;
  window.dispatchEvent(new CustomEvent('cq-profile-closed'));
}

async function saveNickname() {
  const result = validateNickname($('nicknameInput').value);
  if (!result.ok) {
    $('nicknameError').textContent = result.message;
    return;
  }
  localStorage.setItem(NICK_KEY, result.name);
  $('nicknameError').textContent = '';
  closeProfile();
  await syncProfile();
  window.alert('安全確認のため、このユーザー名を作成者へLINEで送ってください。名前を変更した場合も、新しい名前を送ってください。');
}

function escapeTextInto(element, text) {
  element.textContent = String(text ?? '');
}

async function initializeFirebase() {
  configured = firebaseConfigured();
  if (!configured) {
    setStatus('Firebase未設定');
    return;
  }
  try {
    const [{ initializeApp }, { getAuth, signInAnonymously, onAuthStateChanged }, firestore] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/11.2.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/11.2.0/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/11.2.0/firebase-firestore.js')
    ]);
    const app = initializeApp(D.firebaseConfig);
    auth = getAuth(app);
    db = firestore.getFirestore(app);
    window.__cqfb = {
      doc: firestore.doc,
      setDoc: firestore.setDoc,
      updateDoc: firestore.updateDoc,
      collection: firestore.collection,
      getDoc: firestore.getDoc,
      getDocs: firestore.getDocs,
      query: firestore.query,
      orderBy: firestore.orderBy,
      limit: firestore.limit,
      serverTimestamp: firestore.serverTimestamp,
      addDoc: firestore.addDoc,
      deleteDoc: firestore.deleteDoc,
      runTransaction: firestore.runTransaction
    };
    onAuthStateChanged(auth, async (user) => {
      currentUser = user;
      if (user) {
        setStatus('オンライン');
        syncProfile();
        syncTimeAttackBest();
      } else {
        setStatus('認証待ち');
      }
    });
    await signInAnonymously(auth);
  } catch (error) {
    console.error(error);
    setStatus('接続失敗');
  }
}

async function syncProfile() {
  if (syncing || !configured || !currentUser || !navigator.onLine) return;
  if (guestAssistWasUsed()) {
    setStatus('ランキング送信対象外');
    return;
  }
  const nickname = localStorage.getItem(NICK_KEY);
  if (!nickname) return;
  syncing = true;
  try {
    const stats = readLocalStats();
    const f = window.__cqfb;
    await f.setDoc(f.doc(db, 'players', currentUser.uid), {
      username: nickname,
      ...stats,
      rankingScore: rankingScore(stats),
      updatedAt: f.serverTimestamp()
    }, { merge: true });
    setStatus('同期済み');
  } catch (error) {
    console.error(error);
    setStatus('同期失敗');
  } finally {
    syncing = false;
  }
}

async function syncTimeAttackBest() {
  if (timeAttackSyncing || !configured || !currentUser || !navigator.onLine) return;
  const nicknameResult = validateNickname(localStorage.getItem(NICK_KEY));
  const { profile } = readTimeAttackProfile();
  const pending = validPendingTimeAttack(profile.pendingSubmission);
  if (!pending || !nicknameResult.ok) return;
  timeAttackSyncing = true;
  try {
    const f = window.__cqfb;
    const reference = f.doc(db, TIME_ATTACK_COLLECTION, currentUser.uid);
    let outcome = 'unchanged';
    let serverBestMs = null;
    await f.runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists()) {
        transaction.set(reference, {
          userId: currentUser.uid,
          username: nicknameResult.name,
          bestMs: pending.timeMs,
          runId: pending.runId,
          isTest: false,
          firstRegisteredAt: f.serverTimestamp(),
          submittedAt: f.serverTimestamp()
        });
        outcome = 'created';
        serverBestMs = pending.timeMs;
        return;
      }
      const current = snapshot.data() || {};
      serverBestMs = Math.round(Number(current.bestMs) || 0);
      if (String(current.runId || '') === pending.runId) {
        outcome = 'duplicate';
        return;
      }
      if (serverBestMs > 0 && serverBestMs <= pending.timeMs) {
        outcome = 'slower';
        return;
      }
      transaction.update(reference, {
        username: nicknameResult.name,
        bestMs: pending.timeMs,
        runId: pending.runId,
        submittedAt: f.serverTimestamp()
      });
      outcome = 'improved';
      serverBestMs = pending.timeMs;
    });
    writeTimeAttackProfile((next) => {
      const localBest = Math.round(Number(next.localBestMs) || 0);
      if (serverBestMs >= TIME_ATTACK_MIN_MS && (!localBest || serverBestMs < localBest)) next.localBestMs = serverBestMs;
      if (String(next.pendingSubmission?.runId || '') === pending.runId) next.pendingSubmission = null;
      next.lastSubmittedRunId = pending.runId;
      return next;
    });
    window.dispatchEvent(new CustomEvent('cq-ta-submit-result', {
      detail: { ok: true, outcome, runId: pending.runId, bestMs: serverBestMs }
    }));
  } catch (error) {
    console.error(error);
    window.dispatchEvent(new CustomEvent('cq-ta-submit-result', {
      detail: { ok: false, runId: pending.runId, message: '記録は端末に保留され、オンライン復帰後に再送されます。' }
    }));
  } finally {
    timeAttackSyncing = false;
  }
}

async function openTimeAttackRanking() {
  if (timeAttackRankingOpen) return;
  timeAttackRankingOpen = true;
  window.cqPauseOverlay?.();
  $('timeAttackRankingModal').hidden = false;
  await loadTimeAttackRanking();
}

function closeTimeAttackRanking() {
  if (!timeAttackRankingOpen) return;
  timeAttackRankingOpen = false;
  $('timeAttackRankingModal').hidden = true;
  window.cqResumeOverlay?.();
}

async function loadTimeAttackRanking() {
  const list = $('timeAttackRankingList');
  list.replaceChildren();
  $('timeAttackMyRankCard').hidden = true;
  const message = $('timeAttackRankingMessage');
  if (!configured) {
    message.textContent = 'タイムアタックランキングを利用するにはFirebase設定が必要です。ローカル自己ベストは保存されます。';
    return;
  }
  if (!navigator.onLine) {
    message.textContent = '現在オフラインです。記録は端末に保留され、再接続後に安全に再送されます。';
    return;
  }
  if (!currentUser) {
    message.textContent = '匿名ログインを準備しています。数秒後に再読み込みしてください。';
    return;
  }
  await syncTimeAttackBest();
  try {
    const f = window.__cqfb;
    const snapshot = await f.getDocs(f.query(
      f.collection(db, TIME_ATTACK_COLLECTION),
      f.orderBy('bestMs', 'asc'),
      f.orderBy('firstRegisteredAt', 'asc'),
      f.limit(100)
    ));
    const records = [];
    snapshot.forEach((item) => {
      const record = { id: item.id, ...item.data() };
      if (!isFilteredTimeAttackRecord(record)) records.push(record);
    });
    const shown = records.slice(0, 50);
    message.textContent = `Stage 10公式タイムアタック上位${shown.length}人。各プレイヤーの最速記録1件だけを表示します。`;
    shown.forEach((record, index) => {
      const row = document.createElement('div');
      row.className = `ranking-row${record.id === currentUser.uid ? ' me' : ''}`;
      const position = document.createElement('span');
      position.className = 'ranking-position';
      position.textContent = `${index + 1}位`;
      const name = document.createElement('span');
      name.className = 'ranking-name';
      escapeTextInto(name, record.username || '名無し');
      const score = document.createElement('span');
      score.className = 'ranking-score time-attack-ranking-time';
      score.textContent = formatTimeAttackMs(record.bestMs);
      row.append(position, name, score);
      list.append(row);
    });
    const myIndex = records.findIndex((record) => record.id === currentUser.uid);
    const { profile } = readTimeAttackProfile();
    const myRecord = myIndex >= 0 ? records[myIndex] : null;
    const localBest = Math.round(Number(profile.localBestMs) || 0);
    if (myRecord && myRecord.bestMs >= TIME_ATTACK_MIN_MS && (!localBest || myRecord.bestMs < localBest)) {
      writeTimeAttackProfile((next) => ({ ...next, localBestMs: Math.round(myRecord.bestMs) }));
    }
    if (myRecord || localBest) {
      const card = $('timeAttackMyRankCard');
      card.replaceChildren();
      const title = document.createElement('strong');
      title.textContent = myRecord ? `自分：${myIndex + 1}位` : '自分：ローカル記録';
      const name = document.createElement('span');
      escapeTextInto(name, localStorage.getItem(NICK_KEY) || '未登録');
      const best = document.createElement('span');
      best.textContent = `ベスト ${formatTimeAttackMs(myRecord?.bestMs || localBest)}`;
      card.append(title, name, best);
      card.hidden = false;
    }
    if (!list.children.length) list.innerHTML = '<p class="modal-lead">正式記録はまだありません。</p>';
  } catch (error) {
    console.error(error);
    message.textContent = 'タイムアタックランキングの取得に失敗しました。端末の記録は失われません。';
  }
}

async function openRanking() {
  $('rankingModal').hidden = false;
  await loadRanking();
}

function closeRanking() {
  $('rankingModal').hidden = true;
}

async function loadRanking() {
  const list = $('rankingList');
  list.replaceChildren();
  $('myRankCard').hidden = true;
  if (!configured) {
    $('rankingMessage').textContent = 'ランキングを有効にするにはFirebase Webアプリの設定が必要です。ゲーム本体はそのまま遊べます。';
    return;
  }
  if (!navigator.onLine) {
    $('rankingMessage').textContent = '現在オフラインです。ゲームは続けられますが、ランキングの閲覧・同期には通信が必要です。';
    return;
  }
  if (!currentUser) {
    $('rankingMessage').textContent = '匿名ログインを準備しています。数秒後に再読み込みしてください。';
    return;
  }
  await syncProfile();
  try {
    const f = window.__cqfb;
    const snap = await f.getDocs(f.query(f.collection(db, 'players'), f.orderBy('rankingScore', 'desc'), f.limit(50)));
    const players = [];
    snap.forEach((documentSnapshot) => players.push({ id: documentSnapshot.id, ...documentSnapshot.data() }));
    $('rankingMessage').textContent = `上位${players.length}人。順位は上位ステージのクリア・到達を最優先し、実績数→化学Lv.→撃破数→獲得コインの順です。`;
    const myIndex = players.findIndex((player) => player.id === currentUser.uid);
    players.forEach((player, index) => {
      const row = document.createElement('div');
      row.className = `ranking-row${player.id === currentUser.uid ? ' me' : ''}`;
      const pos = document.createElement('span');
      pos.className = 'ranking-position';
      pos.textContent = `${index + 1}位`;
      const name = document.createElement('span');
      name.className = 'ranking-name';
      escapeTextInto(name, player.username || '名無し');
      const score = document.createElement('span');
      score.className = 'ranking-score';
      score.textContent = `到達 Stage ${player.highestStageReached || 1}・クリア Stage ${player.highestStageCleared || 0}・実績 ${player.achievementCount || 0}/${D.achievementDefinitions.length}・化学Lv.${player.chemistryLevel || 1}・撃破 ${player.totalKills || 0}`;
      row.append(pos, name, score);
      list.append(row);
    });
    if (myIndex >= 0) {
      const player = players[myIndex];
      const card = $('myRankCard');
      card.replaceChildren();
      const a = document.createElement('strong');
      a.textContent = `自分：${myIndex + 1}位`;
      const b = document.createElement('span');
      escapeTextInto(b, player.username);
      const c = document.createElement('span');
      c.textContent = `到達 Stage ${player.highestStageReached || 1}・クリア Stage ${player.highestStageCleared || 0}・実績 ${player.achievementCount}/${D.achievementDefinitions.length}・化学Lv.${player.chemistryLevel}`;
      card.append(a, b, c);
      card.hidden = false;
    }
  } catch (error) {
    console.error(error);
    $('rankingMessage').textContent = 'ランキングの取得に失敗しました。Firestoreのルールや複合インデックスを確認してください。';
  }
}

function requestDateText(value) {
  try {
    const date = value?.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? '日時不明' : date.toLocaleString('ja-JP');
  } catch {
    return '日時不明';
  }
}

function createRequestManagementNotice() {
  const notice = document.createElement('div');
  notice.className = 'line-reminder';
  notice.textContent = 'この一覧では、ログイン中の全ユーザーが要望を「実装済み／検討中」へ変更し、削除できます。削除は元に戻せないため、内容を確認して操作してください。';
  return notice;
}

async function updateRequestStatus(requestId, implemented) {
  const f = window.__cqfb;
  await f.updateDoc(f.doc(db, 'requests', requestId), {
    status: implemented ? '実装済み' : '検討中',
    implementedAt: implemented ? f.serverTimestamp() : null,
    implementedBy: implemented ? currentUser.uid : null
  });
}

async function deleteRequest(requestId) {
  const f = window.__cqfb;
  await f.deleteDoc(f.doc(db, 'requests', requestId));
}

async function loadRequests() {
  const content = $('infoContent');
  $('infoKicker').textContent = 'PUBLIC REQUESTS';
  $('infoTitle').textContent = '要望一覧';
  content.innerHTML = '<p class="modal-lead">読み込み中...</p>';
  if (!configured || !currentUser) {
    content.innerHTML = '<p class="modal-lead">オンライン接続の準備中です。数秒後に再度開いてください。</p>';
    return;
  }
  try {
    const f = window.__cqfb;
    const snap = await f.getDocs(f.query(f.collection(db, 'requests'), f.orderBy('createdAt', 'desc'), f.limit(100)));
    const wrapper = document.createElement('div');
    wrapper.className = 'request-view';
    wrapper.append(createRequestManagementNotice());
    const list = document.createElement('div');
    list.className = 'request-list';
    snap.forEach((documentSnapshot) => {
      const data = documentSnapshot.data();
      const implemented = data.status === '実装済み';
      const card = document.createElement('article');
      card.className = `request-card${implemented ? ' implemented' : ''}`;
      const meta = document.createElement('div');
      meta.className = 'request-meta';
      const left = document.createElement('span');
      left.textContent = `${data.username || '名無し'}｜${requestDateText(data.createdAt)}`;
      const status = document.createElement('span');
      status.className = `request-status${implemented ? ' implemented' : ''}`;
      status.textContent = implemented ? '✓ 実装済み' : '検討中';
      meta.append(left, status);
      const paragraph = document.createElement('p');
      paragraph.textContent = data.text || '';
      card.append(meta, paragraph);
      if (documentSnapshot.id) {
        const actions = document.createElement('div');
        actions.className = 'request-manage-actions';
        const statusButton = document.createElement('button');
        statusButton.type = 'button';
        statusButton.className = `small-button${implemented ? '' : ' request-implemented-button'}`;
        statusButton.textContent = implemented ? '検討中へ戻す' : '✓ 実装済みにする';
        statusButton.addEventListener('click', async () => {
          statusButton.disabled = true;
          try {
            await updateRequestStatus(documentSnapshot.id, !implemented);
            await loadRequests();
          } catch (error) {
            console.error(error);
            window.alert('状態を変更できませんでした。Firestoreルールを確認してください。');
            statusButton.disabled = false;
          }
        });
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'small-button danger';
        deleteButton.textContent = '要望を削除';
        deleteButton.addEventListener('click', async () => {
          if (!window.confirm('この要望を削除しますか？削除後は元に戻せません。')) return;
          deleteButton.disabled = true;
          try {
            await deleteRequest(documentSnapshot.id);
            await loadRequests();
          } catch (error) {
            console.error(error);
            window.alert('削除できませんでした。Firestoreルールを確認してください。');
            deleteButton.disabled = false;
          }
        });
        actions.append(statusButton, deleteButton);
        card.append(actions);
      }
      list.append(card);
    });
    if (!list.children.length) list.innerHTML = '<p class="modal-lead">まだ要望はありません。</p>';
    wrapper.append(list);
    content.replaceChildren(wrapper);
  } catch (error) {
    console.error(error);
    content.innerHTML = '<p class="modal-lead">要望を取得できませんでした。Firestoreルールを更新してください。</p>';
  }
}

function openRequests() {
  $('infoModal').hidden = false;
  loadRequests();
}

function openRequestSubmit() {
  $('requestSubmitModal').hidden = false;
  $('requestText').value = '';
  $('requestError').textContent = '';
}

async function sendRequest() {
  const text = $('requestText').value.normalize('NFKC').trim();
  const nickname = localStorage.getItem(NICK_KEY);
  if (!nickname) {
    $('requestError').textContent = '先にユーザー名を登録してください。';
    openProfile(false);
    return;
  }
  if (text.length < 5 || text.length > 300) {
    $('requestError').textContent = '5〜300文字で入力してください。';
    return;
  }
  const last = Number(localStorage.getItem('cqLastRequestAt') || 0);
  if (Date.now() - last < 60000) {
    $('requestError').textContent = '連続投稿はできません。1分待ってください。';
    return;
  }
  try {
    const f = window.__cqfb;
    await f.addDoc(f.collection(db, 'requests'), {
      userId: currentUser.uid,
      username: nickname,
      text,
      status: '検討中',
      createdAt: f.serverTimestamp()
    });
    localStorage.setItem('cqLastRequestAt', String(Date.now()));
    $('requestSubmitModal').hidden = true;
    window.cqResumeOverlay?.();
    window.alert('要望を公開しました。');
  } catch (error) {
    console.error(error);
    $('requestError').textContent = '送信できませんでした。Firestoreルールを更新してください。';
  }
}

function wire() {
  window.addEventListener('cq-open-profile', () => openProfile(false));
  window.addEventListener('cq-save-imported', () => { setTimeout(syncProfile, 250); });
  window.addEventListener('cq-guest-assist-changed', () => { if (guestAssistWasUsed()) setStatus('ランキング送信対象外'); });
  window.addEventListener('cq-ta-record-ready', syncTimeAttackBest);
  window.addEventListener('cq-open-ta-ranking', openTimeAttackRanking);
  window.addEventListener('cq-open-requests', openRequests);
  window.addEventListener('cq-submit-request', openRequestSubmit);
  $('requestSubmitCloseBtn').addEventListener('click', () => {
    $('requestSubmitModal').hidden = true;
    window.cqResumeOverlay?.();
  });
  $('requestSendBtn').addEventListener('click', sendRequest);
  $('rankingBtn').addEventListener('click', openRanking);
  $('rankingCloseBtn').addEventListener('click', closeRanking);
  $('rankingRefreshBtn').addEventListener('click', loadRanking);
  $('timeAttackRankingCloseBtn').addEventListener('click', closeTimeAttackRanking);
  $('timeAttackRankingRefreshBtn').addEventListener('click', loadTimeAttackRanking);
  $('nicknameSaveBtn').addEventListener('click', saveNickname);
  $('profileCancelBtn').addEventListener('click', () => {
    localStorage.setItem(ONLINE_SEEN_KEY, '1');
    closeProfile();
  });
  $('changeNicknameBtn').addEventListener('click', () => openProfile(false));
  window.addEventListener('online', () => {
    setStatus('再接続・同期中');
    syncProfile();
    syncTimeAttackBest();
  });
  window.addEventListener('offline', () => setStatus('オフライン'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { syncProfile(); syncTimeAttackBest(); }
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && timeAttackRankingOpen) closeTimeAttackRanking(); });
  setInterval(() => { syncProfile(); syncTimeAttackBest(); }, 30000);
  if (!localStorage.getItem(NICK_KEY) && !localStorage.getItem(ONLINE_SEEN_KEY)) openProfile(false);
}

wire();
initializeFirebase();
