(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const D = window.gameData;
  const cv = $('cv');
  const ctx = cv.getContext('2d');

  const BASE = {
    allyX: 48,
    enemyX: cv.width - 48,
    unitY: 298,
    allySpawnX: 91,
    enemySpawnX: cv.width - 91,
    radius: 31,
    laneOffsets: [-42, 0, 42]
  };
  const NORMAL_BASE = Object.freeze({ allyX: 48, enemyX: cv.width - 48, allySpawnX: 91, enemySpawnX: cv.width - 91 });
  // v4.4: flying entities are drawn about one unit-height above the old position.
  // Collision lanes stay unchanged; this is a visual separation only.
  const FLYING_EXTRA_RENDER_OFFSET = 42;
  const SUMMON_READY_EPSILON = 0.05;
  const SUMMON_UI_REFRESH_INTERVAL = 0.1;
  const NORMAL_RENDER_FPS = 45;
  const LOW_POWER_RENDER_FPS = 30;
  const STAGE10_RENDER_FPS = 60;
  const NORMAL_IDLE_RENDER_FPS = 10;
  const LOW_POWER_IDLE_RENDER_FPS = 5;
  const NORMAL_UI_REFRESH_INTERVAL = 0.1;
  const LOW_POWER_UI_REFRESH_INTERVAL = 0.2;

  const STAGE_LIBRARY = {
    1: {
      id: 1,
      name: '酸・塩基ラボ',
      subtitle: '最初の化学防衛線',
      description: '弱酸・弱塩基・強酸・強塩基の相性を学ぶ基本ステージ。Stage 1クリアでStage 2が解放されます。',
      theme: 'acid-base',
      allyBaseLabel: 'CHEM LAB A',
      enemyBaseLabel: 'CHEM LAB B',
      allyBaseHp: D.allyBaseHp,
      enemyBaseHp: D.enemyBaseHp,
      startingEnergy: D.startingEnergy,
      coinRewardMultiplier: 1.5,
      bossHint: '強酸属性が有効',
      units: D.units,
      enemies: D.enemies,
      waves: D.waves
    },
    2: D.stage2,
    3: D.stage3,
    4: D.stage4,
    5: D.stage5,
    6: D.stage6,
    7: D.stage7,
    8: D.stage8,
    9: D.stage9,
    10: D.stage10
  };

  let currentStageId = 1;
  let stageProgress = {};
  let activeStageGuideId = 1;
  let activeStageGuideSource = 'stage-select';

  function currentStageDefinition() {
    return STAGE_LIBRARY[currentStageId] || STAGE_LIBRARY[1];
  }

  function applyStageDefinition(stageId) {
    const requestedStage = Math.floor(finiteNumber(stageId, 1));
    currentStageId = STAGE_LIBRARY[requestedStage] ? requestedStage : 1;
    const stage = currentStageDefinition();
    D.units = stage.units;
    D.enemies = stage.enemies;
    D.waves = stage.waves;
    D.allyBaseHp = stage.allyBaseHp;
    D.enemyBaseHp = stage.enemyBaseHp;
    D.startingEnergy = stage.startingEnergy;
    const battlefieldScale = Math.max(1, finiteNumber(stage.logicalBattlefieldScale, 1));
    BASE.allyX = NORMAL_BASE.allyX;
    BASE.allySpawnX = NORMAL_BASE.allySpawnX;
    BASE.enemyX = NORMAL_BASE.allyX + (NORMAL_BASE.enemyX - NORMAL_BASE.allyX) * battlefieldScale;
    BASE.enemySpawnX = BASE.enemyX - (NORMAL_BASE.enemyX - NORMAL_BASE.enemySpawnX);
    document.body.dataset.stage = String(currentStageId);
    if ($('stageButtonLabel')) $('stageButtonLabel').textContent = currentStageDefinition().milestone ? `STAGE ${currentStageId} ◆難関` : `STAGE ${currentStageId}`;
    syncBgmTrack({ restart: true });
    updateMusicControls();
  }

  let energy;
  let coins;
  let level;
  let experience;
  let energyCapacityLevel;
  let unitUpgradeLevels;
  let allyBaseHp;
  let enemyBaseHp;
  let allies;
  let enemies;
  let unlocked;
  let summonTimers;
  let summonUiRefreshTimer = 0;
  let battleUiRefreshTimer = 0;
  let lastRenderedTimestamp = 0;
  let gameTime;
  let autoSaveTimer;
  let lastTimestamp = performance.now();
  let paused = false;
  let manualPaused = false;
  let resumePromptPending = false;
  let pauseReason = 'manual';
  let projectiles = [];
  let impactBursts = [];
  let gameStatus = 'playing';
  let activeQuiz = null;
  let practiceSession = null;
  let mockExamSession = null;
  let mockExamProgress;
  let activeMockReward = null;
  let lastQuizIndex = -1;
  let lastHardQuizIndex = -1;
  let messageTimeout = 0;
  let guestAssistEnabled = false;
  let guestAssistUsed = false;
  let aquaRegiaUnlocked = false;
  let aquaRegiaLevel = 1;
  let aquaAuContactComplete = false;
  let stage10State = null;
  let timeAttackProfile = null;
  let timeAttackRun = null;
  let timeAttackNormalSave = '';
  let timeAttackNormalAux = null;
  let timeAttackHiddenAt = 0;
  const prefersReducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  let performanceMetrics = null;

  function defaultPerformanceMetrics() {
    return {
      startedAt: performance.now(), frames: 0, intervalTotalMs: 0, maxGapMs: 0,
      longFrames: 0, lastFrameAt: 0, peakEffects: 0, peakProjectiles: 0,
      audioNodesActive: 0, audioNodesPeak: 0,
      heapStart: finiteNumber(performance.memory?.usedJSHeapSize, 0),
      heapPeak: finiteNumber(performance.memory?.usedJSHeapSize, 0)
    };
  }

  let currentWaveIndex;
  let nextWaveEnemyIndex;
  let wavePhase;
  let waveTimer;
  let waveSpawnTimer;
  let waveBannerTimer;
  let waveMilestoneClaims = new Set();
  let allySpawnSerial;
  let enemySpawnSerial;
  let finalBaseMessageShown;
  let endlessMode = false;
  let endlessWaveTimer = 30;
  let endlessWaveNumber = 0;
  let cumulativeStats;
  let achievementState;
  let runStats;
  let onboardingSeen;
  let tutorialSeen = false;
  let tutorialPending = false;
  let tutorialActive = false;
  let tutorialStep = 0;
  let tutorialTargetUnitId = '';
  let tutorialTargetElement = null;
  let tutorialLastCorrect = false;
  let tutorialAction = null;
  let selectedScope = D.defaultScope || 'all';
  let overlayPauseCount = 0;
  let overlayPauseObserver = null;
  let battleSpeedMultiplier = 1;
  let battleSpeedRemaining = 0;
  let speedTrialRetryAt = 0;
  let bossArrivalHideTimer = 0;
  let bossPhaseTransitionActive = false;
  let bossPhaseTransitionEnemy = null;
  let bossPhaseTransitionTimers = [];
  const BATTLE_SPEED_DURATION = 300;
  const SPEED_TRIAL_COOLDOWN_MS = 30 * 1000;
  let achievementToastTimer = 0;
  let combatEffects = [];
  let recentQuestionHistory = [];
  let learningResetReturnView = 'learning';
  let learningResetCompleted = false;
  const EXACT_QUESTION_HISTORY_LIMIT = 30;
  const NEAR_QUESTION_HISTORY_LIMIT = 20;
  const FAMILY_QUESTION_HISTORY_LIMIT = 8;
  const SPACING_HOUR = 60 * 60 * 1000;
  const SPACING_DAY = 24 * SPACING_HOUR;
  const SPACING_CORRECT_INTERVAL_DAYS = [3, 7, 14, 30, 45, 60];
  const SPACING_INCORRECT_DELAY_HOURS = 12;
  let achievementReturnToEnd = false;
  let battleInspectorKey = '';
  let battleInspectorPinnedUntil = 0;
  let battleInspectorLastAutoAt = 0;
  let battleInspectorHintUntil = 18;
  let activeResearchCards = [];
  let researchCardClaimedWaves = new Set();
  let researchCardIntroSeen = false;
  let pendingResearchWave = 0;
  const REVIEW_KEY = "chemionQuestReviewV1";
  const LEARNING_KEY = "chemionQuestLearningV1";
  const SOUND_KEY = "chemionQuestSoundV1";
  const BGM_KEY = "chemionQuestBgmV1";
  const BGM_VOLUME_KEY = "chemionQuestBgmVolumeV1";
  const BGM_TRACKS = Object.freeze({
    normal: { src: "assets/audio/chemion-normal-bgm.mp3", label: "通常Stage BGM" },
    difficult: { src: "assets/audio/chemion-difficult-bgm.mp3", label: "難関Stage BGM" },
    milestoneV3: { src: "assets/audio/chemion-milestone-stage-bgm-v3.mp3", label: "Stage 10 節目BGM・V3" },
    au: { src: "assets/audio/chemion-stage10-au-boss-v16-loop.mp3", label: "Stage 10 Au BOSS BGM・V16 loop" }
  });
  const LOW_POWER_KEY = "chemionQuestLowPowerV1";
  const SPEED_TRIAL_RETRY_KEY = "chemionQuestSpeedTrialRetryV1";
  const TRANSFER_NICK_KEY = "chemionQuestNicknameV13";
  const TRANSFER_ONLINE_SEEN_KEY = "chemionQuestOnlinePromptV13";
  const TRANSFER_BACKUP_KEY = "chemionQuestBeforeImportBackupV1";
  const MOCK_REWARDS = [
    { id: 'initial_energy', name: '初期Energy＋25', description: '次のバトル開始時のEnergyが25増加します。' },
    { id: 'energy_regen', name: 'Energy回復＋15%', description: '次のバトル中、Energyの回復速度が1.15倍になります。' },
    { id: 'coin_boost', name: '敵撃破コイン＋20%', description: '次のバトル中、敵撃破で得るコインが1.20倍になります。' }
  ];
  let soundEnabled = true;
  let bgmEnabled = true;
  let bgmVolume = 0.35;
  let bgmUserActivated = false;
  let activeBgmTrackKey = "";
  let bgmDuckFactor = 1;
  let lowPowerMode = false;
  let audioContext = null;
  const transientAudioSources = new Map();
  let lastAttackSoundAt = 0;
  try {
    soundEnabled = localStorage.getItem(SOUND_KEY) !== 'off';
    bgmEnabled = localStorage.getItem(BGM_KEY) !== 'off';
    const storedBgmVolumeRaw = localStorage.getItem(BGM_VOLUME_KEY);
    const storedBgmVolume = storedBgmVolumeRaw === null ? NaN : Number(storedBgmVolumeRaw);
    if (Number.isFinite(storedBgmVolume)) bgmVolume = Math.max(0, Math.min(1, storedBgmVolume));
    lowPowerMode = localStorage.getItem(LOW_POWER_KEY) === 'on';
  } catch (_) {}
  const CATEGORY_LABELS = { mol:'mol・量的関係', acidBase:'酸・塩基', redox:'酸化還元', electrolysis:'電池・電気分解', crystal:'結晶', gas:'気体・溶液', thermo:'熱化学・反応速度', equilibrium:'化学平衡', matter:'物質の構成', other:'その他' };

  const unitButtons = new Map();

  function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  const TIME_ATTACK_MIN_VALID_MS = 45000;
  const TIME_ATTACK_MAX_VALID_MS = 2 * 60 * 60 * 1000;
  const TIME_ATTACK_BACKGROUND_LIMIT_MS = 10000;

  function defaultTimeAttackProfile() {
    return {
      unlocked: false,
      localBestMs: null,
      pendingSubmission: null,
      lastSubmittedRunId: '',
      currentRunId: '',
      officialRunInProgress: false,
      runInvalid: false,
      lastInvalidReason: ''
    };
  }

  function normalizeTimeAttackProfile(value, stats = cumulativeStats) {
    const input = value && typeof value === 'object' ? value : {};
    const best = finiteNumber(input.localBestMs, NaN);
    const pending = input.pendingSubmission && typeof input.pendingSubmission === 'object'
      ? {
          runId: String(input.pendingSubmission.runId || ''),
          timeMs: Math.round(finiteNumber(input.pendingSubmission.timeMs, 0)),
          completedAt: String(input.pendingSubmission.completedAt || '')
        }
      : null;
    const validPending = pending && pending.runId && pending.timeMs >= TIME_ATTACK_MIN_VALID_MS && pending.timeMs <= TIME_ATTACK_MAX_VALID_MS ? pending : null;
    return {
      unlocked: Boolean(input.unlocked || finiteNumber(stats?.highestStageCleared, 0) >= 10 || finiteNumber(stats?.stage10Clears, 0) >= 1),
      localBestMs: Number.isFinite(best) && best >= TIME_ATTACK_MIN_VALID_MS && best <= TIME_ATTACK_MAX_VALID_MS ? Math.round(best) : null,
      pendingSubmission: validPending,
      lastSubmittedRunId: String(input.lastSubmittedRunId || ''),
      currentRunId: String(input.currentRunId || ''),
      officialRunInProgress: Boolean(input.officialRunInProgress),
      runInvalid: Boolean(input.runInvalid),
      lastInvalidReason: String(input.lastInvalidReason || '')
    };
  }

  function formatTimeAttackMs(value) {
    const milliseconds = Math.max(0, Math.round(finiteNumber(value, 0)));
    const minutes = Math.floor(milliseconds / 60000);
    const seconds = Math.floor(milliseconds % 60000 / 1000);
    const hundredths = Math.floor(milliseconds % 1000 / 10);
    return `${minutes}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
  }

  function createTimeAttackRunId() {
    try { if (crypto?.randomUUID) return crypto.randomUUID(); } catch (_) {}
    return `ta-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  }

  function isDeveloperOrAutomatedState() {
    try {
      const params = new URLSearchParams(location.search);
      return params.get('cqTest') === '1' || ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
    } catch (_) { return true; }
  }

  function isTimeAttackActive() {
    return Boolean(timeAttackRun?.active);
  }

  function currentTimeAttackMs() {
    if (!timeAttackRun) return 0;
    const end = finiteNumber(timeAttackRun.stoppedAt, 0) || performance.now();
    return Math.max(0, Math.round(end - finiteNumber(timeAttackRun.startedAt, end)));
  }

  function updateTimeAttackUi() {
    const active = isTimeAttackActive();
    if ($('timeAttackIndicator')) $('timeAttackIndicator').hidden = !active;
    if (active) {
      $('timeAttackClock').textContent = formatTimeAttackMs(currentTimeAttackMs());
      $('timeAttackValidity').textContent = timeAttackRun.valid ? '公式記録走行中' : 'この走行は公式記録の対象外です';
      $('timeAttackIndicator').classList.toggle('invalid', !timeAttackRun.valid);
    }
    const unlockedForUi = Boolean(timeAttackProfile?.unlocked || finiteNumber(cumulativeStats?.highestStageCleared, 0) >= 10);
    if ($('timeAttackStartBtn')) $('timeAttackStartBtn').disabled = !unlockedForUi || active;
    if ($('stageBtn')) $('stageBtn').disabled = active;
    if ($('timeAttackLaunchStatus')) {
      const best = timeAttackProfile?.localBestMs ? `あなたのベスト ${formatTimeAttackMs(timeAttackProfile.localBestMs)}` : '自己ベストはまだありません。';
      $('timeAttackLaunchStatus').textContent = unlockedForUi
        ? `${best} 通常セーブと完全に分離した初期状態で挑戦します。`
        : 'Stage 10を通常クリアすると解放されます。';
    }
  }

  function writeTimeAttackProfileToNormalSave(profile) {
    try {
      const raw = timeAttackNormalSave || localStorage.getItem(D.saveKey);
      if (!raw) return false;
      const payload = JSON.parse(raw);
      payload.progress = payload.progress && typeof payload.progress === 'object' ? payload.progress : {};
      payload.progress.timeAttack = JSON.parse(JSON.stringify(profile));
      localStorage.setItem(D.saveKey, JSON.stringify(payload));
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  function invalidateTimeAttackRun(reason) {
    if (!isTimeAttackActive() || !timeAttackRun.valid) return;
    timeAttackRun.valid = false;
    timeAttackRun.invalidReason = String(reason || '走行条件を確認できませんでした。');
    timeAttackProfile.runInvalid = true;
    timeAttackProfile.lastInvalidReason = timeAttackRun.invalidReason;
    updateTimeAttackUi();
  }

  function beginTimeAttack() {
    if (isTimeAttackActive() || !timeAttackProfile?.unlocked) return false;
    if (!saveGame({ silent: true })) {
      showMessage('通常セーブを保護できないため、タイムアタックを開始できません。', 4.2);
      return false;
    }
    timeAttackNormalSave = localStorage.getItem(D.saveKey) || '';
    if (!timeAttackNormalSave) return false;
    timeAttackNormalAux = {
      review: localStorage.getItem(REVIEW_KEY),
      learning: localStorage.getItem(LEARNING_KEY),
      speedTrialRetry: localStorage.getItem(SPEED_TRIAL_RETRY_KEY),
      recentQuestionHistory: JSON.parse(JSON.stringify(recentQuestionHistory || []))
    };
    const runId = createTimeAttackRunId();
    timeAttackProfile = normalizeTimeAttackProfile(timeAttackProfile);
    timeAttackProfile.currentRunId = runId;
    timeAttackProfile.officialRunInProgress = true;
    timeAttackProfile.runInvalid = false;
    timeAttackProfile.lastInvalidReason = '';
    if (!writeTimeAttackProfileToNormalSave(timeAttackProfile)) return false;

    applyStageDefinition(10);
    coins = 0;
    level = 1;
    experience = 0;
    unlocked = new Set(initialUnlockedIds());
    energyCapacityLevel = 1;
    unitUpgradeLevels = defaultUnitUpgradeLevels();
    aquaRegiaUnlocked = false;
    aquaRegiaLevel = 1;
    aquaAuContactComplete = false;
    guestAssistEnabled = false;
    resetStage({ keepProgress: true });
    coins = 0;
    level = 1;
    experience = 0;
    unlocked = new Set(initialUnlockedIds());
    energyCapacityLevel = 1;
    unitUpgradeLevels = defaultUnitUpgradeLevels();
    aquaRegiaUnlocked = false;
    aquaRegiaLevel = 1;
    aquaAuContactComplete = false;
    timeAttackRun = {
      active: true,
      runId,
      startedAt: performance.now(),
      stoppedAt: 0,
      valid: !isDeveloperOrAutomatedState(),
      invalidReason: isDeveloperOrAutomatedState() ? '開発者・自動テスト状態です。' : '',
      completed: false
    };
    timeAttackHiddenAt = 0;
    $('stageModal').hidden = true;
    overlayPauseCount = 0;
    paused = false;
    updateGuestAssistUi();
    updateTimeAttackUi();
    renderUnitButtons();
    renderUpgradePanel();
    showMessage('Stage 10タイムアタック開始｜問題中・操作待ちも計測します。', 4.2);
    return true;
  }

  function completeTimeAttackClock() {
    if (!isTimeAttackActive() || timeAttackRun.stoppedAt) return;
    timeAttackRun.stoppedAt = performance.now();
    timeAttackRun.completed = true;
    const elapsed = currentTimeAttackMs();
    if (elapsed < TIME_ATTACK_MIN_VALID_MS || elapsed > TIME_ATTACK_MAX_VALID_MS) invalidateTimeAttackRun('現実的でない異常な計測値です。');
    if (timeAttackProfile.currentRunId !== timeAttackRun.runId) invalidateTimeAttackRun('開始・終了走行IDが一致しません。');
  }

  function restoreNormalAfterTimeAttack({ victory = false, reason = '' } = {}) {
    if (!timeAttackRun) return false;
    if (victory) completeTimeAttackClock();
    else invalidateTimeAttackRun(reason || '走行を途中で終了しました。');
    const finishedRun = { ...timeAttackRun };
    const elapsed = currentTimeAttackMs();
    const official = Boolean(victory && finishedRun.valid && finishedRun.completed);
    const previousBest = timeAttackProfile.localBestMs;
    const improved = official && (!Number.isFinite(previousBest) || elapsed < previousBest);
    if (improved) {
      timeAttackProfile.localBestMs = elapsed;
      timeAttackProfile.pendingSubmission = { runId: finishedRun.runId, timeMs: elapsed, completedAt: new Date().toISOString() };
    }
    timeAttackProfile.currentRunId = '';
    timeAttackProfile.officialRunInProgress = false;
    timeAttackProfile.runInvalid = !official;
    timeAttackProfile.lastInvalidReason = official ? '' : (finishedRun.invalidReason || reason || 'この走行は公式記録の対象外です');
    if (!writeTimeAttackProfileToNormalSave(timeAttackProfile)) return false;
    timeAttackRun = null;
    timeAttackHiddenAt = 0;
    if (timeAttackNormalAux) {
      for (const [key, value] of [[REVIEW_KEY, timeAttackNormalAux.review], [LEARNING_KEY, timeAttackNormalAux.learning], [SPEED_TRIAL_RETRY_KEY, timeAttackNormalAux.speedTrialRetry]]) {
        if (typeof value === 'string') localStorage.setItem(key, value);
        else localStorage.removeItem(key);
      }
    }
    const restored = loadGame({ silent: true });
    recentQuestionHistory = Array.isArray(timeAttackNormalAux?.recentQuestionHistory) ? timeAttackNormalAux.recentQuestionHistory : recentQuestionHistory;
    timeAttackNormalSave = '';
    timeAttackNormalAux = null;
    if (!restored) return false;
    updateTimeAttackUi();
    $('timeAttackResultTime').textContent = formatTimeAttackMs(elapsed);
    $('timeAttackResultStatus').textContent = official
      ? improved ? '公式走行として完走し、自己ベストを更新しました。' : '公式走行として完走しました。自己ベストは更新されませんでした。'
      : `この走行は公式記録の対象外です${timeAttackProfile.lastInvalidReason ? `｜${timeAttackProfile.lastInvalidReason}` : ''}`;
    $('timeAttackResultBest').textContent = timeAttackProfile.localBestMs ? `あなたのベスト：${formatTimeAttackMs(timeAttackProfile.localBestMs)}` : '有効な自己ベストはありません。';
    $('timeAttackResultModal').hidden = false;
    pauseForOverlay();
    if (improved) window.dispatchEvent(new CustomEvent('cq-ta-record-ready', { detail: { ...timeAttackProfile.pendingSubmission } }));
    return true;
  }

  function exitTimeAttack() {
    if (!isTimeAttackActive()) return;
    if (!window.confirm('タイムアタックを中断して通常セーブへ戻りますか？この走行は公式記録になりません。')) return;
    restoreNormalAfterTimeAttack({ victory: false, reason: '途中離脱しました。' });
  }

  function openTimeAttackRanking() {
    window.dispatchEvent(new CustomEvent('cq-open-ta-ranking'));
  }

  function closeTimeAttackResult() {
    if (!$('timeAttackResultModal') || $('timeAttackResultModal').hidden) return;
    $('timeAttackResultModal').hidden = true;
    resumeFromOverlay();
  }

  function defaultStage10State() {
    return {
      phase: 'normal',
      phaseTimer: 0,
      contactStarted: Boolean(aquaAuContactComplete),
      contactComplete: Boolean(aquaAuContactComplete),
      contactTimer: 0,
      preparation: null,
      preparationSuccessTimer: 0,
      formationElapsed: 0,
      formationPushX: null,
      candidateKeys: [],
      stableSeconds: 0
    };
  }

  function normalizeStage10State(value) {
    const source = value && typeof value === 'object' ? value : {};
    const allowedPhases = new Set(['normal', 'forming', 'protected', 'combat', 'victory']);
    const state = defaultStage10State();
    state.phase = allowedPhases.has(source.phase) ? source.phase : 'normal';
    state.phaseTimer = Math.max(0, finiteNumber(source.phaseTimer, 0));
    state.contactStarted = Boolean(aquaAuContactComplete || source.contactStarted || source.contactComplete);
    state.contactComplete = Boolean(aquaAuContactComplete || source.contactComplete);
    state.contactTimer = Math.max(0, finiteNumber(source.contactTimer, 0));
    state.preparationSuccessTimer = Math.max(0, finiteNumber(source.preparationSuccessTimer, 0));
    state.formationElapsed = Math.max(0, finiteNumber(source.formationElapsed, 0));
    state.formationPushX = Number.isFinite(Number(source.formationPushX)) ? Number(source.formationPushX) : null;
    state.candidateKeys = Array.isArray(source.candidateKeys) ? source.candidateKeys.map(String).slice(0, 4) : [];
    state.stableSeconds = Math.max(0, finiteNumber(source.stableSeconds, 0));
    if (source.preparation && typeof source.preparation === 'object') {
      state.preparation = {
        phase: ['animating', 'committed'].includes(source.preparation.phase) ? source.preparation.phase : 'animating',
        timer: Math.max(0, finiteNumber(source.preparation.timer, 0)),
        ingredientKeys: Array.isArray(source.preparation.ingredientKeys) ? source.preparation.ingredientKeys.map(String).slice(0, 4) : [],
        hpRatio: clamp(finiteNumber(source.preparation.hpRatio, 1), 0.01, 1),
        created: Boolean(source.preparation.created)
      };
    }
    return state;
  }

  function isStage10() {
    return currentStageId === 10;
  }

  function stageLogicalScale() {
    return Math.max(1, finiteNumber(currentStageDefinition()?.logicalBattlefieldScale, 1));
  }

  function logicalToCanvasX(value) {
    if (!isStage10()) return value;
    const span = Math.max(1, BASE.enemyX - BASE.allyX);
    return NORMAL_BASE.allyX + (finiteNumber(value, BASE.allyX) - BASE.allyX) * (NORMAL_BASE.enemyX - NORMAL_BASE.allyX) / span;
  }

  function canvasToLogicalX(value) {
    if (!isStage10()) return value;
    const span = Math.max(1, NORMAL_BASE.enemyX - NORMAL_BASE.allyX);
    return BASE.allyX + (finiteNumber(value, NORMAL_BASE.allyX) - NORMAL_BASE.allyX) * (BASE.enemyX - BASE.allyX) / span;
  }

  function currentWaveIntervalSeconds() {
    return Math.max(1, finiteNumber(currentStageDefinition()?.waveIntervalSeconds, D.waveIntervalSeconds));
  }

  function currentFinalWaveStartSeconds() {
    return Math.max(currentWaveIntervalSeconds(), finiteNumber(currentStageDefinition()?.finalWaveStartSeconds, D.finalWaveStartSeconds));
  }

  function formatStat(value, digits = 1) {
    const number = finiteNumber(value, 0);
    return Number.isInteger(number) ? String(number) : number.toFixed(digits).replace(/\.0$/, '');
  }


  function ensureAudioContext() {
    if (!soundEnabled) return null;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioContext) audioContext = new AudioCtx();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    document.querySelector('.battle-panel')?.classList.add('sound-ready');
    return audioContext;
  }

  function trackTransientAudioSource(source, connectedNodes = []) {
    if (!source) return source;
    const nodes = Array.isArray(connectedNodes) ? connectedNodes.filter(Boolean) : [];
    transientAudioSources.set(source, nodes);
    if (performanceMetrics) {
      performanceMetrics.audioNodesActive += 1;
      performanceMetrics.audioNodesPeak = Math.max(performanceMetrics.audioNodesPeak, performanceMetrics.audioNodesActive);
    }
    source.addEventListener('ended', () => {
      if (!transientAudioSources.has(source)) return;
      transientAudioSources.delete(source);
      try { source.disconnect(); } catch (_) {}
      for (const node of nodes) { try { node.disconnect(); } catch (_) {} }
      if (performanceMetrics) performanceMetrics.audioNodesActive = Math.max(0, performanceMetrics.audioNodesActive - 1);
    }, { once: true });
    return source;
  }

  function stopTransientAudioNodes() {
    for (const [source, nodes] of transientAudioSources.entries()) {
      try { source.stop(); } catch (_) {}
      try { source.disconnect(); } catch (_) {}
      for (const node of nodes) { try { node.disconnect(); } catch (_) {} }
    }
    transientAudioSources.clear();
    if (performanceMetrics) performanceMetrics.audioNodesActive = 0;
  }

  function playTone(frequency, duration = .08, volume = .025, type = 'sine', delay = 0) {
    const audio = ensureAudioContext();
    if (!audio || !soundEnabled) return;
    const now = audio.currentTime + Math.max(0, delay);
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(40, frequency), now);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), now + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, now + Math.max(.025, duration));
    oscillator.connect(gain).connect(audio.destination);
    trackTransientAudioSource(oscillator, [gain]);
    oscillator.start(now);
    oscillator.stop(now + Math.max(.035, duration) + .02);
  }

  function playSound(name) {
    if (!soundEnabled) return;
    const nowMs = performance.now();
    if (name === 'attack' && nowMs - lastAttackSoundAt < (lowPowerMode ? 120 : 65)) return;
    if (name === 'attack') lastAttackSoundAt = nowMs;
    const patterns = {
      attack: [[390,.045,.012,'square',0],[620,.035,.008,'sine',.025]],
      hit: [[135,.05,.014,'triangle',0]],
      summon: [[440,.08,.025,'sine',0],[660,.10,.024,'sine',.07],[880,.12,.022,'sine',.14]],
      heal: [[520,.10,.018,'sine',0],[780,.13,.016,'sine',.06]],
      coin: [[740,.055,.018,'square',0],[980,.08,.016,'sine',.05]],
      wave: [[330,.08,.021,'triangle',0],[440,.08,.021,'triangle',.08],[660,.11,.022,'triangle',.16]],
      boss: [[105,.18,.036,'sawtooth',0],[82,.24,.028,'square',.12]],
      transform: [[170,.12,.025,'sawtooth',0],[260,.12,.024,'square',.10],[410,.18,.025,'sine',.20]],
      aqua: [[280,.10,.022,'triangle',0],[430,.16,.025,'sine',.07],[710,.22,.023,'sine',.16],[980,.18,.018,'sine',.27]],
      phaseShift: [[118,.22,.034,'sawtooth',0],[176,.18,.028,'square',.18],[264,.16,.026,'triangle',.34],[396,.20,.024,'sine',.50]],
      correct: [[660,.08,.022,'sine',0],[880,.12,.024,'sine',.08]],
      wrong: [[230,.12,.022,'sawtooth',0],[170,.15,.018,'triangle',.10]],
      level: [[520,.08,.024,'sine',0],[660,.08,.024,'sine',.08],[880,.16,.026,'sine',.16]],
      victory: [[523,.10,.027,'sine',0],[659,.10,.027,'sine',.10],[784,.10,.027,'sine',.20],[1047,.26,.029,'sine',.30]],
      defeat: [[260,.14,.024,'triangle',0],[196,.18,.022,'triangle',.12],[131,.25,.020,'sine',.27]],
      pause: [[420,.06,.018,'sine',0],[315,.09,.017,'sine',.06]],
      resume: [[315,.06,.018,'sine',0],[520,.10,.020,'sine',.06]],
      speed: [[520,.07,.020,'sine',0],[780,.08,.022,'sine',.06],[1040,.12,.024,'sine',.13]],
      baseHit: [[90,.10,.028,'square',0]]
    };
    (patterns[name] || []).forEach(([f,d,v,t,delay]) => playTone(f,d,v,t,delay));
  }


  function playBossArrivalSound() {
    const audio = ensureAudioContext();
    if (!audio || !soundEnabled) return;
    const now = audio.currentTime;
    const master = audio.createGain();
    master.gain.setValueAtTime(.0001, now);
    master.gain.exponentialRampToValueAtTime(.052, now + .035);
    master.gain.exponentialRampToValueAtTime(.0001, now + 1.28);
    master.connect(audio.destination);

    [
      { start: 92, end: 42, type: 'sawtooth', gain: .34, delay: 0, duration: .88 },
      { start: 67, end: 40, type: 'square', gain: .20, delay: .08, duration: 1.08 },
      { start: 148, end: 56, type: 'triangle', gain: .16, delay: .02, duration: .56 }
    ].forEach(({start,end,type,gain,delay,duration}) => {
      const oscillator = audio.createOscillator();
      const localGain = audio.createGain();
      const begin = now + delay;
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(start, begin);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, end), begin + duration);
      localGain.gain.setValueAtTime(.0001, begin);
      localGain.gain.exponentialRampToValueAtTime(gain, begin + .02);
      localGain.gain.exponentialRampToValueAtTime(.0001, begin + duration);
      oscillator.connect(localGain).connect(master);
      const cleanupMaster = delay + duration >= 1.1 ? [localGain, master] : [localGain];
      trackTransientAudioSource(oscillator, cleanupMaster);
      oscillator.start(begin);
      oscillator.stop(begin + duration + .04);
    });

    const length = Math.max(1, Math.floor(audio.sampleRate * .38));
    const buffer = audio.createBuffer(1, length, audio.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) channel[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const noise = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const noiseGain = audio.createGain();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(180, now);
    filter.frequency.exponentialRampToValueAtTime(70, now + .38);
    noiseGain.gain.setValueAtTime(.20, now);
    noiseGain.gain.exponentialRampToValueAtTime(.0001, now + .38);
    noise.buffer = buffer;
    noise.connect(filter).connect(noiseGain).connect(master);
    trackTransientAudioSource(noise, [filter, noiseGain]);
    noise.start(now);
  }

  function hideBossArrivalEffect() {
    const fx = $('bossArrivalFx');
    const panel = document.querySelector('.battle-panel');
    if (fx) { fx.classList.remove('is-active'); fx.hidden = true; }
    panel?.classList.remove('boss-arrival-shake');
    if (bossArrivalHideTimer) window.clearTimeout(bossArrivalHideTimer);
    bossArrivalHideTimer = 0;
  }

  function triggerBossArrivalEffect(enemy, definition) {
    const fx = $('bossArrivalFx');
    const panel = document.querySelector('.battle-panel');
    if (!fx || !enemy) { playSound('boss'); return; }
    if (bossArrivalHideTimer) window.clearTimeout(bossArrivalHideTimer);
    const xPercent = clamp((finiteNumber(enemy.x, cv.width * .86) / cv.width) * 100, 8, 92);
    const yPercent = clamp((entityVisualY(enemy) / cv.height) * 100, 16, 88);
    fx.style.setProperty('--boss-x', `${xPercent.toFixed(2)}%`);
    fx.style.setProperty('--boss-y', `${yPercent.toFixed(2)}%`);
    if ($('bossArrivalName')) $('bossArrivalName').textContent = `${definition?.formula || enemy.formula} ${definition?.name || enemy.name}`.trim();
    fx.hidden = false;
    fx.classList.remove('is-active');
    panel?.classList.remove('boss-arrival-shake');
    void fx.offsetWidth;
    fx.classList.add('is-active');
    panel?.classList.add('boss-arrival-shake');
    playBossArrivalSound();
    bossArrivalHideTimer = window.setTimeout(hideBossArrivalEffect, 2550);
  }


  function clearBossPhaseTransition({ resume = false } = {}) {
    for (const timer of bossPhaseTransitionTimers) window.clearTimeout(timer);
    bossPhaseTransitionTimers = [];
    const fx = $('bossPhaseFx');
    if (fx) {
      fx.classList.remove('is-active', 'is-transformed');
      fx.hidden = true;
    }
    if (bossPhaseTransitionEnemy) bossPhaseTransitionEnemy.phaseTransitioning = false;
    bossPhaseTransitionEnemy = null;
    bossPhaseTransitionActive = false;
    document.body.classList.remove('boss-phase-transition');
    if (resume && gameStatus === 'playing') {
      syncPauseStateFromUi();
      lastTimestamp = performance.now();
      updateHud();
      renderUnitButtons();
      renderUpgradePanel();
      updatePauseButton();
    }
  }

  function scheduleBossPhaseStep(callback, delay) {
    const timer = window.setTimeout(callback, delay);
    bossPhaseTransitionTimers.push(timer);
    return timer;
  }

  function updateBossPhaseOverlay(enemy, phase) {
    if ($('bossPhaseFrom')) $('bossPhaseFrom').textContent = enemy.formula;
    if ($('bossPhaseTo')) $('bossPhaseTo').textContent = phase.formula || '第二形態';
    if ($('bossPhaseName')) $('bossPhaseName').textContent = phase.name || '第二形態へ移行';
    if ($('bossPhaseReaction')) $('bossPhaseReaction').textContent = phase.transformText || `${enemy.formula} → ${phase.formula || '第二形態'}`;
  }

  function beginBossSecondPhaseSequence(enemy) {
    if (!enemy?.phaseTwo || enemy.bossPhase >= 2 || enemy.phaseTransitioning || bossPhaseTransitionActive) return false;
    const phase = enemy.phaseTwo;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const transformAt = reducedMotion ? 420 : 1050;
    const arrivalAt = reducedMotion ? 1050 : 2550;
    const resumeAt = reducedMotion ? 2450 : 5250;

    enemy.phaseTransitioning = true;
    enemy.hp = Math.max(1, enemy.hp);
    enemy.attackTimer = Math.max(enemy.attackTimer, 9);
    bossPhaseTransitionEnemy = enemy;
    bossPhaseTransitionActive = true;
    paused = true;
    document.body.classList.add('boss-phase-transition');
    if ($('pauseBtn')) $('pauseBtn').disabled = true;
    hideBossArrivalEffect();
    focusBattleEntity(enemy, 12, true);

    const fx = $('bossPhaseFx');
    updateBossPhaseOverlay(enemy, phase);
    if (fx) {
      const xPercent = clamp((finiteNumber(enemy.x, cv.width * .72) / cv.width) * 100, 12, 88);
      const yPercent = clamp((entityVisualY(enemy) / cv.height) * 100, 18, 86);
      fx.style.setProperty('--phase-x', `${xPercent.toFixed(2)}%`);
      fx.style.setProperty('--phase-y', `${yPercent.toFixed(2)}%`);
      fx.hidden = false;
      fx.classList.remove('is-active', 'is-transformed');
      void fx.offsetWidth;
      fx.classList.add('is-active');
    }
    showMessage('第1形態撃破――全戦闘反応を停止。第二形態へ移行します。', reducedMotion ? 2.2 : 4.5);
    playSound('phaseShift');
    updateHud(); renderUnitButtons(); renderUpgradePanel(); updatePauseButton();

    scheduleBossPhaseStep(() => {
      if (!bossPhaseTransitionActive || bossPhaseTransitionEnemy !== enemy || !enemies.includes(enemy)) return clearBossPhaseTransition({ resume: true });
      transformBossToSecondPhase(enemy, { announce: false });
      enemy.phaseTransitioning = true;
      fx?.classList.add('is-transformed');
      focusBattleEntity(enemy, 12, true);
      playSound('transform');
      showMessage(`⚠ ${phase.transformText || `${enemy.formula}へ変化`}｜第二形態を検出`, reducedMotion ? 1.8 : 3.3);
      $('waveBannerTitle').textContent = 'BOSS PHASE 2';
      $('waveBannerSub').textContent = `${enemy.chemistryLabel} ${enemy.formula}｜第二形態`;
      $('waveBanner').hidden = false;
      waveBannerTimer = reducedMotion ? 2.0 : 5.2;
    }, transformAt);

    scheduleBossPhaseStep(() => {
      if (!bossPhaseTransitionActive || bossPhaseTransitionEnemy !== enemy || !enemies.includes(enemy)) return clearBossPhaseTransition({ resume: true });
      if (fx) { fx.classList.remove('is-active', 'is-transformed'); fx.hidden = true; }
      triggerBossArrivalEffect(enemy, { formula: enemy.formula, name: enemy.name });
      showMessage(`⚠ BOSS第二形態出現：${enemy.chemistryLabel} ${enemy.formula} ${enemy.name}`, reducedMotion ? 1.8 : 3.6);
    }, arrivalAt);

    scheduleBossPhaseStep(() => {
      if (!bossPhaseTransitionActive || bossPhaseTransitionEnemy !== enemy) return;
      hideBossArrivalEffect();
      enemy.phaseTransitioning = false;
      clearBossPhaseTransition({ resume: true });
      showMessage('第二形態とのバトルを再開します。', 2.8);
      saveGame({ silent: true });
    }, resumeAt);
    return true;
  }


  function beginBossAnnihilationSequence(enemy, definition) {
    if (!enemy?.wipeAlliesOnArrival || enemy.ambushIntroCompleted || enemy.phaseTransitioning || bossPhaseTransitionActive) return false;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const wipeAt = reducedMotion ? 420 : 1050;
    const arrivalAt = reducedMotion ? 1050 : 2550;
    const resumeAt = reducedMotion ? 2450 : 5250;

    enemy.phaseTransitioning = true;
    enemy.attackTimer = Math.max(enemy.attackTimer, 9);
    bossPhaseTransitionEnemy = enemy;
    bossPhaseTransitionActive = true;
    paused = true;
    document.body.classList.add('boss-phase-transition');
    if ($('pauseBtn')) $('pauseBtn').disabled = true;
    hideBossArrivalEffect();
    focusBattleEntity(enemy, 12, true);

    const fx = $('bossPhaseFx');
    if ($('bossPhaseFrom')) $('bossPhaseFrom').textContent = 'ALLY UNITS';
    if ($('bossPhaseTo')) $('bossPhaseTo').textContent = '0';
    if ($('bossPhaseName')) $('bossPhaseName').textContent = enemy.ambushIntroTitle || '戦線崩壊';
    if ($('bossPhaseReaction')) $('bossPhaseReaction').textContent = enemy.ambushIntroText || '味方ユニット全消失';
    if (fx) {
      const xPercent = clamp((finiteNumber(enemy.x, cv.width * .82) / cv.width) * 100, 12, 88);
      const yPercent = clamp((entityVisualY(enemy) / cv.height) * 100, 18, 86);
      fx.style.setProperty('--phase-x', `${xPercent.toFixed(2)}%`);
      fx.style.setProperty('--phase-y', `${yPercent.toFixed(2)}%`);
      fx.hidden = false;
      fx.classList.remove('is-active', 'is-transformed');
      void fx.offsetWidth;
      fx.classList.add('is-active');
    }
    showMessage('特殊BOSS反応を検出――全戦闘を停止します。', reducedMotion ? 2.2 : 4.5);
    playSound('phaseShift');
    updateHud(); renderUnitButtons(); renderUpgradePanel(); updatePauseButton();

    scheduleBossPhaseStep(() => {
      if (!bossPhaseTransitionActive || bossPhaseTransitionEnemy !== enemy || !enemies.includes(enemy)) return clearBossPhaseTransition({ resume: true });
      const defeatedCount = allies.filter((ally) => ally.hp > 0).length;
      for (const ally of allies) {
        spawnImpactBurst(ally.x, entityVisualY(ally), '#d9d1ff', 1.8);
        combatEffects.push({ x: ally.x, y: entityVisualY(ally) - ally.radius - 18, text: '戦線崩壊', color: '#f1e8ff', kind: 'transform', life: 1.5, maxLife: 1.5, particles: [] });
      }
      runStats.alliesDefeated += defeatedCount;
      allies = [];
      projectiles = [];
      for (const unit of D.units) summonTimers[unit.id] = 0;
      summonUiRefreshTimer = 0;
      battleInspectorKey = '';
      enemy.ambushIntroCompleted = true;
      fx?.classList.add('is-transformed');
      playSound('transform');
      showMessage(`味方ユニット${defeatedCount}体が消失。蓄積Energyから戦線を再構築してください。`, reducedMotion ? 1.8 : 3.5);
      $('waveBannerTitle').textContent = 'ALLIED LINE COLLAPSED';
      $('waveBannerSub').textContent = `残存Energy ${Math.floor(energy)} / ${currentMaxEnergy()}｜再展開準備`;
      $('waveBanner').hidden = false;
      waveBannerTimer = reducedMotion ? 2.0 : 5.2;
    }, wipeAt);

    scheduleBossPhaseStep(() => {
      if (!bossPhaseTransitionActive || bossPhaseTransitionEnemy !== enemy || !enemies.includes(enemy)) return clearBossPhaseTransition({ resume: true });
      if (fx) { fx.classList.remove('is-active', 'is-transformed'); fx.hidden = true; }
      triggerBossArrivalEffect(enemy, definition || { formula: enemy.formula, name: enemy.name });
      showMessage(`⚠ 高速BOSS出現：${enemy.formula} ${enemy.name}｜速度${formatStat(enemy.speed, 1)}`, reducedMotion ? 1.8 : 3.6);
    }, arrivalAt);

    scheduleBossPhaseStep(() => {
      if (!bossPhaseTransitionActive || bossPhaseTransitionEnemy !== enemy) return;
      hideBossArrivalEffect();
      enemy.phaseTransitioning = false;
      enemy.attackTimer = Math.max(enemy.attackTimer, .8);
      clearBossPhaseTransition({ resume: true });
      showMessage(`BOSS戦開始。Energy ${Math.floor(energy)}を使って直ちに再展開してください。`, 3.2);
      saveGame({ silent: true });
    }, resumeAt);
    return true;
  }

  function updateSoundButtons() {
    const label = soundEnabled ? '🔊 効果音 ON' : '🔇 消音中';
    const top = $('soundBtn');
    if (top) { top.textContent = soundEnabled ? '🔊 効果音' : '🔇 消音'; top.classList.toggle('muted-state', !soundEnabled); }
    if ($('pauseSoundBtn')) $('pauseSoundBtn').textContent = label;
    if ($('settingsSoundState')) $('settingsSoundState').textContent = soundEnabled ? '現在ON｜攻撃・召喚・正誤などの効果音' : '現在OFF｜すべての効果音を消音';
  }

  function toggleSound() {
    soundEnabled = !soundEnabled;
    try { localStorage.setItem(SOUND_KEY, soundEnabled ? 'on' : 'off'); } catch (_) {}
    updateSoundButtons();
    if (soundEnabled) { ensureAudioContext(); playSound('resume'); }
  }


  function bgmElement() {
    return $('bgmAudio');
  }

  function desiredBgmTrackKey() {
    if (isStage10()) return ['protected', 'combat', 'victory'].includes(stage10State?.phase) ? 'au' : 'milestoneV3';
    return currentStageDefinition()?.milestone || currentStageId % 5 === 0 ? 'difficult' : 'normal';
  }

  function applyBgmVolume() {
    const audio = bgmElement();
    if (audio) audio.volume = clamp(bgmVolume * bgmDuckFactor, 0, 1);
  }

  function setBgmDuckFactor(value) {
    bgmDuckFactor = clamp(finiteNumber(value, 1), 0, 1);
    applyBgmVolume();
  }

  function desiredBgmTrack() {
    return BGM_TRACKS[desiredBgmTrackKey()] || BGM_TRACKS.normal;
  }

  function syncBgmTrack({ restart = false } = {}) {
    const audio = bgmElement();
    if (!audio) return;
    const key = desiredBgmTrackKey();
    const track = BGM_TRACKS[key] || BGM_TRACKS.normal;
    const changed = activeBgmTrackKey !== key || audio.getAttribute('src') !== track.src;
    if (!changed && !restart) return;
    const wasPlaying = !audio.paused;
    audio.pause();
    if (changed) {
      audio.src = track.src;
      audio.dataset.track = key;
      activeBgmTrackKey = key;
      audio.load();
    }
    if (restart) {
      try { audio.currentTime = 0; } catch (_) {}
    }
    if (wasPlaying && bgmEnabled && bgmUserActivated && !document.hidden) {
      const attempt = audio.play();
      if (attempt && typeof attempt.catch === 'function') attempt.catch(() => {});
    }
  }

  function updateMusicControls() {
    const percent = Math.round(bgmVolume * 100);
    const trackLabel = desiredBgmTrack().label;
    const stateText = bgmEnabled
      ? `現在ON｜${trackLabel}・音量${percent}%`
      : `現在OFF｜${trackLabel}を停止中・音量${percent}%`;
    if ($('settingsMusicState')) $('settingsMusicState').textContent = stateText;
    if ($('pauseMusicBtn')) $('pauseMusicBtn').textContent = bgmEnabled ? '🎵 BGM ON' : '🎵 BGM OFF';
    if ($('musicVolume')) $('musicVolume').value = String(percent);
    if ($('musicVolumeValue')) $('musicVolumeValue').textContent = `${percent}%`;
    document.querySelector('.music-settings-card')?.classList.toggle('is-muted', !bgmEnabled);
    const audio = bgmElement();
    applyBgmVolume();
  }

  function pauseBgm() {
    const audio = bgmElement();
    if (audio && !audio.paused) audio.pause();
  }

  function syncBgmPlayback() {
    const audio = bgmElement();
    if (!audio) return;
    syncBgmTrack();
    applyBgmVolume();
    if (!bgmEnabled || !bgmUserActivated || document.hidden) {
      pauseBgm();
      return;
    }
    const attempt = audio.play();
    if (attempt && typeof attempt.catch === 'function') attempt.catch(() => {});
  }

  function activateBgmFromUserGesture() {
    bgmUserActivated = true;
    syncBgmPlayback();
  }

  function toggleBgm() {
    bgmEnabled = !bgmEnabled;
    bgmUserActivated = true;
    try { localStorage.setItem(BGM_KEY, bgmEnabled ? 'on' : 'off'); } catch (_) {}
    updateMusicControls();
    syncBgmPlayback();
    if (bgmEnabled) playSound('resume');
  }

  function setBgmVolume(value) {
    bgmVolume = clamp(finiteNumber(value, 35) / 100, 0, 1);
    try { localStorage.setItem(BGM_VOLUME_KEY, String(bgmVolume)); } catch (_) {}
    updateMusicControls();
    syncBgmPlayback();
  }

  function currentRenderFps() {
    if (document.hidden) return 0;
    const idle = paused || gameStatus !== 'playing';
    if (idle) return lowPowerMode ? LOW_POWER_IDLE_RENDER_FPS : NORMAL_IDLE_RENDER_FPS;
    if (lowPowerMode) return LOW_POWER_RENDER_FPS;
    return isStage10() ? STAGE10_RENDER_FPS : NORMAL_RENDER_FPS;
  }

  function currentUiRefreshInterval() {
    return lowPowerMode ? LOW_POWER_UI_REFRESH_INTERVAL : NORMAL_UI_REFRESH_INTERVAL;
  }

  function updatePowerControls() {
    document.body.classList.toggle('low-power-mode', lowPowerMode);
    document.body.dataset.powerMode = lowPowerMode ? 'low' : 'normal';
    document.body.dataset.renderFps = String(currentRenderFps());
    const state = lowPowerMode
      ? '現在ON｜最大30fps・演出と画面効果を軽量化'
      : '現在OFF｜通常モード最大45fps・標準演出';
    if ($('settingsPowerState')) $('settingsPowerState').textContent = state;
    if ($('settingsPowerBtn')) $('settingsPowerBtn').classList.toggle('active-power-mode', lowPowerMode);
    if ($('pausePowerBtn')) $('pausePowerBtn').textContent = lowPowerMode ? '🔋 低電力 ON' : '🔋 低電力 OFF';
  }

  function setLowPowerMode(enabled, { persist = true, announce = true } = {}) {
    lowPowerMode = Boolean(enabled);
    if (persist) {
      try { localStorage.setItem(LOW_POWER_KEY, lowPowerMode ? 'on' : 'off'); } catch (_) {}
    }
    if (lowPowerMode) {
      for (const effect of combatEffects) effect.particles = [];
      impactBursts = impactBursts.filter((burst) => Boolean(burst.heal));
    }
    lastTimestamp = performance.now();
    lastRenderedTimestamp = 0;
    battleUiRefreshTimer = currentUiRefreshInterval();
    updatePowerControls();
    updateHud();
    renderUnitButtons();
    renderUpgradePanel();
    draw();
    if (announce) showMessage(lowPowerMode ? '低電力モードON：戦闘判定はそのまま、描画と演出を軽量化します。' : '通常モードへ戻しました。', 3.8);
  }

  function toggleLowPowerMode() {
    setLowPowerMode(!lowPowerMode);
  }

  function refreshPauseSummary() {
    if ($('pauseStageStat')) $('pauseStageStat').textContent = String(currentStageId);
    if ($('pauseWaveStat')) $('pauseWaveStat').textContent = `${currentWaveIndex + 1} / ${D.waves.length}`;
    if ($('pauseTimeStat')) $('pauseTimeStat').textContent = `${Math.floor(gameTime)}秒`;
    const descriptions = {
      manual: 'バトルを一時停止し、現在の戦況を保存しました。',
      background: '画面が非表示になったため、安全に自動停止して戦況を保存しました。',
      restored: '前回中断した戦況を読み込みました。準備ができたら再開してください。'
    };
    if ($('pauseDescription')) $('pauseDescription').textContent = descriptions[pauseReason] || descriptions.manual;
  }

  function showPauseModal(reason = pauseReason) {
    pauseReason = reason;
    refreshPauseSummary();
    if ($('pauseModal')) $('pauseModal').hidden = false;
    updatePauseButton();
  }

  function updatePauseButton() {
    const button = $('pauseBtn');
    if (!button) return;
    const isStopped = manualPaused && gameStatus === 'playing';
    button.textContent = isStopped ? '▶ 再開' : '⏸️ ポーズ';
    button.classList.toggle('paused-state', isStopped);
    button.dataset.phaseTransition = bossPhaseTransitionActive ? 'true' : 'false';
    button.disabled = gameStatus !== 'playing' || Boolean(activeQuiz) || tutorialActive || bossPhaseTransitionActive;
  }

  function pauseBattle({ reason = 'manual', show = true, save = true } = {}) {
    if (gameStatus !== 'playing' || activeQuiz || bossPhaseTransitionActive) return false;
    manualPaused = true;
    resumePromptPending = true;
    pauseReason = reason;
    paused = true;
    if (show) showPauseModal(reason);
    updatePowerControls();
    if (save) saveGame({ silent: true });
    if (reason === 'manual') playSound('pause');
    updateHud(); renderUnitButtons(); renderUpgradePanel(); updatePauseButton();
    return true;
  }

  function resumeBattle() {
    if (gameStatus !== 'playing') return;
    manualPaused = false;
    resumePromptPending = false;
    pauseReason = 'manual';
    if ($('pauseModal')) $('pauseModal').hidden = true;
    syncPauseStateFromUi();
    lastTimestamp = performance.now();
    lastRenderedTimestamp = 0;
    updatePowerControls();
    playSound('resume');
    saveGame({ silent: true });
    updateHud(); renderUnitButtons(); renderUpgradePanel(); updatePauseButton();
  }

  function toggleBattlePause() {
    if (manualPaused) resumeBattle(); else pauseBattle({ reason: 'manual', show: true, save: true });
  }

  function restartCurrentStageFromPause() {
    if (gameStatus !== 'playing' || !manualPaused) return;
    if (isTimeAttackActive()) {
      restoreNormalAfterTimeAttack({ victory: false, reason: '走行中にStageを再構築しました。' });
      return;
    }
    const accepted = window.confirm(`Stage ${currentStageId}の現在の挑戦を諦め、ウェーブ1から再開しますか？\n\n場の味方・敵と、この挑戦中の研究カードはリセットされます。所持コイン・解放・恒久強化・実績・学習記録は維持されます。`);
    if (!accepted) return;
    if ($('pauseModal')) $('pauseModal').hidden = true;
    manualPaused = false;
    resumePromptPending = false;
    pauseReason = 'manual';
    resetStage({ keepProgress: true });
    showMessage(`Stage ${currentStageId}を諦め、ウェーブ1から再開しました。`, 4.2);
    saveGame({ silent: true });
  }

  function suspendForHiddenPage() {
    if (isTimeAttackActive()) {
      timeAttackHiddenAt = performance.now();
      return;
    }
    if (gameStatus !== 'playing' || activeQuiz) return;
    pauseBattle({ reason: 'background', show: false, save: true });
  }

  function defaultUnitUpgradeLevels() {
    return Object.fromEntries(D.units.map((unit) => [unit.id, 1]));
  }

  function defaultMockExamProgress() {
    return { version: 1, exams: {}, pendingReward: null };
  }

  function normalizeMockReward(value) {
    if (!value || typeof value !== 'object') return null;
    const definition = MOCK_REWARDS.find((reward) => reward.id === value.id);
    if (!definition) return null;
    return { id: definition.id, earnedFrom: String(value.earnedFrom || ''), selectedAt: finiteNumber(value.selectedAt, Date.now()) };
  }

  function normalizeMockExamProgress(value) {
    const source = value && typeof value === 'object' ? value : {};
    const exams = {};
    if (source.exams && typeof source.exams === 'object') {
      for (const exam of D.mockExams || []) {
        const saved = source.exams[exam.id];
        if (!saved || typeof saved !== 'object') continue;
        exams[exam.id] = {
          attempts: Math.max(0, Math.floor(finiteNumber(saved.attempts, 0))),
          bestScore: clamp(Math.floor(finiteNumber(saved.bestScore, 0)), 0, exam.questions.length),
          passed: Boolean(saved.passed),
          perfect: Boolean(saved.perfect),
          bestTimeMs: Math.max(0, finiteNumber(saved.bestTimeMs, 0)),
          lastPlayedAt: Math.max(0, finiteNumber(saved.lastPlayedAt, 0))
        };
      }
    }
    return { version: 1, exams, pendingReward: normalizeMockReward(source.pendingReward) };
  }

  function mockRewardDefinition(value = activeMockReward) {
    return value ? MOCK_REWARDS.find((reward) => reward.id === value.id) || null : null;
  }

  function defaultCumulativeStats() {
    return {
      totalKills: 0,
      totalCoinsEarned: 0,
      totalClears: 0,
      flawlessClears: 0,
      perfectResearchClears: 0,
      highestStageReached: 1,
      highestStageCleared: 0,
      stage1Clears: 0,
      stage2Clears: 0,
      stage3Clears: 0,
      stage4Clears: 0,
      stage5Clears: 0,
      stage6Clears: 0,
      stage7Clears: 0,
      stage8Clears: 0,
      stage9Clears: 0,
      stage10Clears: 0,
      stage1Defeats: 0,
      stage2Defeats: 0,
      stage3Defeats: 0,
      stage4Defeats: 0,
      stage5Defeats: 0,
      stage6Defeats: 0,
      stage7Defeats: 0,
      stage8Defeats: 0,
      stage9Defeats: 0,
      stage10Defeats: 0,
      mockExamsCompleted: 0,
      mockExamPerfects: 0
    };
  }

  function defaultRunStats() {
    return {
      enemiesDefeated: 0,
      coinsEarned: 0,
      alliesDefeated: 0,
      baseDamageTaken: 0,
      waveBonusCoins: 0,
      defeatSupportCoins: 0
    };
  }

  function defaultAchievementState() {
    return Object.fromEntries(D.achievementDefinitions.map((achievement) => [achievement.id, { unlocked: false, unlockedAt: null }]));
  }

  function normalizeAchievementState(value) {
    const normalized = defaultAchievementState();
    if (!value || typeof value !== 'object') return normalized;
    for (const achievement of D.achievementDefinitions) {
      const saved = value[achievement.id];
      if (!saved) continue;
      normalized[achievement.id] = {
        unlocked: Boolean(saved.unlocked),
        unlockedAt: typeof saved.unlockedAt === 'string' ? saved.unlockedAt : null
      };
    }
    return normalized;
  }

  function researchCardCount(cardId) {
    return activeResearchCards.filter((id) => id === cardId).length;
  }

  function researchProduct(property) {
    return activeResearchCards.reduce((value, cardId) => {
      const card = (D.researchCards || []).find((item) => item.id === cardId);
      return value * Math.max(.1, finiteNumber(card?.[property], 1));
    }, 1);
  }

  function researchAttackMultiplier(attacker) {
    if (attacker?.kind !== 'ally') return 1;
    const family = chemistryFamily(attacker.chemistryClass || 'neutral');
    return activeResearchCards.reduce((value, cardId) => {
      const card = (D.researchCards || []).find((item) => item.id === cardId);
      if (!card?.attackMultiplier || card.attackFamily !== family) return value;
      return value * card.attackMultiplier;
    }, 1);
  }

  function effectiveUnitCost(unit) {
    return Math.max(1, Math.ceil(finiteNumber(unit?.cost, 1) * researchProduct('costMultiplier')));
  }

  function applyResearchStatsToAlly(ally) {
    if (!ally) return;
    const oldMax = Math.max(1, finiteNumber(ally.maxHp, 1));
    const ratio = clamp(finiteNumber(ally.hp, oldMax) / oldMax, 0, 1);
    const hpMultiplier = researchProduct('hpMultiplier');
    ally.maxHp = Math.max(1, Math.round(finiteNumber(ally.baseMaxHp, ally.maxHp) * hpMultiplier));
    ally.hp = Math.max(1, Math.round(ally.maxHp * ratio));
    ally.attack = Math.max(1, Math.round(finiteNumber(ally.baseAttack, ally.attack)));
    ally.speed = Number((finiteNumber(ally.baseSpeed, ally.speed) * researchProduct('speedMultiplier')).toFixed(2));
    ally.attackInterval = Number((finiteNumber(ally.baseAttackInterval, ally.attackInterval) * researchProduct('attackIntervalMultiplier')).toFixed(2));
    if (ally.healer) ally.healAmount = Math.max(1, Math.round(finiteNumber(ally.baseHealAmount, ally.healAmount) * researchProduct('healMultiplier')));
  }

  function renderResearchLoadout() {
    const area = $('researchLoadout');
    if (!area) return;
    const counts = new Map();
    activeResearchCards.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
    const chips = [...counts.entries()].map(([id, count]) => {
      const card = (D.researchCards || []).find((item) => item.id === id);
      return `<span class="research-loadout-chip">${card?.icon || '◆'} ${card?.name || id}${count > 1 ? ` ×${count}` : ''}</span>`;
    });
    const mockReward = mockRewardDefinition();
    if (mockReward) chips.unshift(`<span class="research-loadout-chip">📚 ${mockReward.name}</span>`);
    if (!chips.length) {
      area.hidden = true;
      area.innerHTML = '';
      return;
    }
    area.innerHTML = '<span class="research-loadout-title">ACTIVE BONUS</span>' + chips.join('');
    area.hidden = false;
  }

  function availableResearchCards() {
    return (D.researchCards || []).filter((card) => currentStageId >= Math.max(3, finiteNumber(card.minStage, 3)));
  }

  function researchChoices() {
    const pool = [...availableResearchCards()];
    for (let index = pool.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [pool[index], pool[target]] = [pool[target], pool[index]];
    }
    return pool.slice(0, 3);
  }

  function applySelectedResearchCard(card) {
    if (!card) return;
    activeResearchCards.push(card.id);
    if (card.baseHeal) allyBaseHp = Math.min(D.allyBaseHp, allyBaseHp + card.baseHeal);
    allies.forEach(applyResearchStatsToAlly);
    renderResearchLoadout();
  }

  function chooseResearchCard(card) {
    applySelectedResearchCard(card);
    researchCardClaimedWaves.add(pendingResearchWave);
    pendingResearchWave = 0;
    researchCardIntroSeen = true;
    manualPaused = false;
    resumePromptPending = false;
    pauseReason = 'manual';
    $('researchCardModal').hidden = true;
    wavePhase = 'spawning';
    waveSpawnTimer = 0;
    resumeFromOverlay();
    showMessage(`研究カード「${card.name}」を獲得。${card.description}`, 4.2);
    playSound('level');
    saveGame({ silent: true });
  }

  function openResearchCardSelection(completedWaveNumber) {
    if (currentStageId < 3 || researchCardClaimedWaves.has(completedWaveNumber)) return false;
    const choices = researchChoices();
    if (!choices.length) return false;
    pendingResearchWave = completedWaveNumber;
    wavePhase = 'research';
    const area = $('researchCardOptions');
    area.innerHTML = '';
    for (const card of choices) {
      const count = researchCardCount(card.id);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'research-card-choice';
      button.innerHTML = `<span class="research-icon">${card.icon || '◆'}</span><strong>${card.name}</strong><p>${card.description}</p><small>${count > 0 ? `現在 ${count}枚｜さらに重複可能` : '未取得'}</small>`;
      button.addEventListener('click', () => chooseResearchCard(card));
      area.appendChild(button);
    }
    $('researchCardLead').textContent = researchCardIntroSeen
      ? `Wave ${completedWaveNumber}終了。3枚から1枚を選ぶと戦闘を再開します。`
      : '研究カードはこのバトル中だけ有効です。Stage 3以降、Wave 3・6・9の終了後に1枚選びます。';
    $('researchCardModal').hidden = false;
    pauseForOverlay();
    return true;
  }

  function maxEnergyCapacityLevel() {
    return Math.max(1, Math.floor(finiteNumber(D.maxEnergyCapacityLevel, D.maxUpgradeLevel)));
  }

  function currentMaxEnergy() {
    return D.maxEnergy + D.energyCapacityPerLevel * (energyCapacityLevel - 1);
  }

  function unitUpgradeLevel(unitId) {
    return clamp(Math.floor(finiteNumber(unitUpgradeLevels?.[unitId], 1)), 1, D.maxUpgradeLevel);
  }

  function upgradedUnitStats(unit) {
    const upgradeLevel = unitUpgradeLevel(unit.id);
    return {
      ...unit,
      upgradeLevel,
      hp: Math.round(unit.hp * (1 + D.unitUpgradeHpGrowth * (upgradeLevel - 1))),
      attack: Math.round(unit.attack * (1 + D.unitUpgradeAttackGrowth * (upgradeLevel - 1))),
      healAmount: unit.healer ? Math.round((unit.healAmount || 0) * (1 + finiteNumber(D.unitUpgradeHealGrowth, .10) * (upgradeLevel - 1))) : unit.healAmount,
      range: unit.range + Math.floor((upgradeLevel - 1) / D.unitUpgradeRangeEvery)
    };
  }

  function energyCapacityUpgradeCost() {
    if (energyCapacityLevel >= maxEnergyCapacityLevel()) return null;
    return D.energyCapacityUpgradeCosts[energyCapacityLevel - 1];
  }

  function unitUpgradeCost(unit) {
    const upgradeLevel = unitUpgradeLevel(unit.id);
    if (upgradeLevel >= D.maxUpgradeLevel) return null;
    return Math.round(unit.upgradeBaseCost * Math.pow(D.unitUpgradeCostGrowth, upgradeLevel - 1));
  }

  function updateExistingAlliesForUpgrade(unitId, oldStats, newStats) {
    for (const ally of allies) {
      if (ally.typeId !== unitId) continue;
      const hpRatio = ally.maxHp > 0 ? ally.hp / ally.maxHp : 1;
      ally.baseMaxHp = newStats.hp;
      ally.baseAttack = newStats.attack;
      ally.baseSpeed = newStats.speed;
      ally.baseAttackInterval = newStats.attackInterval;
      ally.baseHealAmount = newStats.healAmount || 0;
      ally.range = newStats.range;
      applyResearchStatsToAlly(ally);
      ally.hp = clamp(Math.round(ally.maxHp * hpRatio), 1, ally.maxHp);
    }
  }


  function levelFromExperience(totalExperience) {
    const safeExperience = Math.max(0, finiteNumber(totalExperience, 0));
    let calculatedLevel = 1;
    for (let index = 1; index < D.levelXpThresholds.length; index += 1) {
      if (safeExperience >= D.levelXpThresholds[index]) calculatedLevel = index + 1;
      else break;
    }
    return clamp(calculatedLevel, 1, D.maxLevel);
  }

  function currentEnergyRegenRate() {
    const multiplier = 1 + D.levelEnergyGrowth * (level - 1);
    const mockMultiplier = activeMockReward?.id === 'energy_regen' ? 1.15 : 1;
    return D.energyRegenPerSecond * multiplier * researchProduct('energyMultiplier') * mockMultiplier;
  }

  function currentCoinRewardMultiplier() {
    const mockMultiplier = activeMockReward?.id === 'coin_boost' ? 1.20 : 1;
    return Math.max(1, finiteNumber(currentStageDefinition().coinRewardMultiplier, 1) * mockMultiplier);
  }

  function grantProgressCoins(amount) {
    const gained = Math.max(0, Math.floor(finiteNumber(amount, 0)));
    if (gained <= 0) return 0;
    coins += gained;
    runStats.coinsEarned += gained;
    cumulativeStats.totalCoinsEarned += gained;
    return gained;
  }

  function grantWaveMilestoneBonus(waveNumber) {
    const reward = Math.max(0, Math.floor(finiteNumber(D.waveMilestoneCoinRewards?.[String(waveNumber)], 0)));
    if (reward <= 0 || waveMilestoneClaims.has(waveNumber)) return 0;
    waveMilestoneClaims.add(waveNumber);
    grantProgressCoins(reward);
    runStats.waveBonusCoins += reward;
    evaluateAchievements();
    showMessage(`第${waveNumber}ウェーブ到達ボーナス：${reward}コイン獲得！`, 3.8);
    return reward;
  }

  function refundFailedResearch(cost) {
    const refund = Math.max(0, Math.ceil(Math.max(0, finiteNumber(cost, 0)) * D.researchFailureRefundRate));
    coins += refund;
    return refund;
  }

  function experienceProgress() {
    if (level >= D.maxLevel) {
      return { current: 0, needed: 0, remaining: 0, ratio: 1 };
    }
    const start = D.levelXpThresholds[level - 1];
    const next = D.levelXpThresholds[level];
    const current = Math.max(0, experience - start);
    const needed = Math.max(1, next - start);
    return {
      current,
      needed,
      remaining: Math.max(0, next - experience),
      ratio: clamp(current / needed, 0, 1)
    };
  }

  function addExperience(amount) {
    const gained = Math.max(0, Math.floor(finiteNumber(amount, 0)));
    if (gained <= 0) return { gained: 0, oldLevel: level, newLevel: level };

    const oldLevel = level;
    const maxExperience = D.levelXpThresholds[D.maxLevel - 1];
    experience = Math.min(maxExperience, experience + gained);
    level = levelFromExperience(experience);
    return { gained, oldLevel, newLevel: level };
  }

  function achievementMetricValue(achievement) {
    switch (achievement.metric) {
      case 'chemistryLevel': return level;
      case 'totalKills': return cumulativeStats.totalKills;
      case 'totalCoinsEarned': return cumulativeStats.totalCoinsEarned;
      case 'flawlessClears': return cumulativeStats.flawlessClears;
      case 'perfectResearchClears': return cumulativeStats.perfectResearchClears;
      case 'highestStageReached': return cumulativeStats.highestStageReached;
      case 'highestStageCleared': return cumulativeStats.highestStageCleared;
      case 'stage5Clears': return cumulativeStats.stage5Clears;
      case 'mockExamsCompleted': return cumulativeStats.mockExamsCompleted;
      case 'mockExamPerfects': return cumulativeStats.mockExamPerfects;
      default: return 0;
    }
  }

  function achievementProgress(achievement) {
    const value = Math.max(0, finiteNumber(achievementMetricValue(achievement), 0));
    return {
      value,
      goal: achievement.goal,
      ratio: clamp(value / achievement.goal, 0, 1),
      complete: value >= achievement.goal
    };
  }

  function completedAchievementCount() {
    return D.achievementDefinitions.filter((achievement) => achievementState?.[achievement.id]?.unlocked).length;
  }

  function isPerfectResearchReady() {
    return level >= D.maxLevel
      && energyCapacityLevel >= maxEnergyCapacityLevel()
      && D.units.every((unit) => unitUpgradeLevel(unit.id) >= D.maxUpgradeLevel);
  }

  function showAchievementToast(achievement) {
    $('achievementToastTitle').textContent = achievement.title;
    $('achievementToast').hidden = false;
    achievementToastTimer = 5;
  }

  function evaluateAchievements({ notify = true } = {}) {
    if (guestAssistEnabled) return [];
    const newlyUnlocked = [];
    for (const achievement of D.achievementDefinitions) {
      const state = achievementState[achievement.id];
      if (state.unlocked) continue;
      if (!achievementProgress(achievement).complete) continue;
      state.unlocked = true;
      state.unlockedAt = new Date().toISOString();
      newlyUnlocked.push(achievement);
    }
    renderAchievementButton();
    if (!$('achievementModal').hidden) renderAchievements();
    if (notify && newlyUnlocked.length > 0) {
      showAchievementToast(newlyUnlocked[0]);
      showMessage(`🏆 アチーブメント達成：${newlyUnlocked.map((item) => item.title).join('・')}`, 5);
    }
    return newlyUnlocked;
  }

  function renderAchievementButton() {
    const completed = completedAchievementCount();
    $('achievementBadge').textContent = `${completed}/${D.achievementDefinitions.length}`;
    $('achievementBtn').classList.toggle('has-new-progress', completed > 0);
  }

  function formatAchievementValue(achievement, value) {
    if (achievement.metric === 'chemistryLevel') return `Lv.${Math.min(value, achievement.goal)}`;
    return `${Math.min(value, achievement.goal)}${achievement.unit}`;
  }

  function renderAchievements() {
    const completed = completedAchievementCount();
    $('achievementSummary').textContent = `${completed} / ${D.achievementDefinitions.length} 達成`;
    $('achievementSummaryText').textContent = completed === D.achievementDefinitions.length
      ? '全アチーブメント制覇！'
      : `残り${D.achievementDefinitions.length - completed}種類`;
    const list = $('achievementList');
    list.innerHTML = '';

    for (const achievement of D.achievementDefinitions) {
      const state = achievementState[achievement.id];
      const progress = achievementProgress(achievement);
      const card = document.createElement('article');
      card.className = `achievement-card ${state.unlocked ? 'unlocked' : 'locked'} ${achievement.category === '難' ? 'hard' : ''}`;
      const dateText = state.unlockedAt
        ? new Date(state.unlockedAt).toLocaleDateString('ja-JP')
        : '';
      card.innerHTML = `
        <div class="achievement-icon" aria-hidden="true">${achievement.icon}</div>
        <div class="achievement-content">
          <div class="achievement-title-row">
            <div><span class="achievement-category">${achievement.category === '難' ? '難アチーブメント' : '基本アチーブメント'}</span><h3>${achievement.title}</h3></div>
            <strong class="achievement-state">${state.unlocked ? '達成' : '未達成'}</strong>
          </div>
          <p>${achievement.description}</p>
          <div class="achievement-progress-line"><span>${formatAchievementValue(achievement, progress.value)} / ${formatAchievementValue(achievement, achievement.goal)}</span>${dateText ? `<time>${dateText}</time>` : ''}</div>
          <div class="achievement-progress"><span style="width:${progress.ratio * 100}%"></span></div>
        </div>`;
      list.appendChild(card);
    }
  }

  function visibleBlockingOverlays() {
    const overlays = [...document.querySelectorAll('.modal')].filter((element) => element.id !== 'endModal' && !element.hidden);
    const launchGate = $('mobileLaunchGate');
    if (launchGate && !launchGate.hidden) overlays.push(launchGate);
    return overlays;
  }

  function syncPauseStateFromUi() {
    overlayPauseCount = visibleBlockingOverlays().length;
    const nextPaused = gameStatus !== 'playing' || manualPaused || Boolean(activeQuiz) || overlayPauseCount > 0 || tutorialActive || bossPhaseTransitionActive;
    const wasPaused = paused;
    paused = nextPaused;
    if (wasPaused && !paused) lastTimestamp = performance.now();
    updatePauseButton();
  }

  function pauseForOverlay() {
    paused = true;
    queueMicrotask(syncPauseStateFromUi);
  }

  function resumeFromOverlay() {
    queueMicrotask(syncPauseStateFromUi);
  }

  function installOverlayPauseObserver() {
    if (overlayPauseObserver) overlayPauseObserver.disconnect();
    overlayPauseObserver = new MutationObserver(syncPauseStateFromUi);
    [...document.querySelectorAll('.modal'), $('mobileLaunchGate')].filter(Boolean).forEach((element) => {
      overlayPauseObserver.observe(element, { attributes: true, attributeFilter: ['hidden'] });
    });
    syncPauseStateFromUi();
  }

  function openAchievements() {
    achievementReturnToEnd = !$('endModal').hidden;
    if (achievementReturnToEnd) $('endModal').hidden = true;
    renderAchievements();
    $('achievementModal').hidden = false;
    pauseForOverlay();
    $('achievementCloseBtn').focus();
  }

  function closeAchievements() {
    $('achievementModal').hidden = true;
    if (achievementReturnToEnd) { $('endModal').hidden = false; achievementReturnToEnd = false; }
    resumeFromOverlay();
  }


  function tutorialReadyUnit() {
    return D.units.find((unit) => unlocked.has(unit.id) && summonCooldownRemaining(unit.id) === 0 && energy >= effectiveUnitCost(unit)) || null;
  }

  function positionTutorialOverlay() {
    if (!tutorialActive) return;
    const spotlight = $('tutorialSpotlight');
    const bubble = $('tutorialBubble');
    const target = tutorialTargetElement;
    if (!target || !document.documentElement.contains(target)) {
      spotlight.hidden = true;
      bubble.style.left = `${Math.max(12, (innerWidth - Math.min(360, innerWidth - 24)) / 2)}px`;
      bubble.style.top = `${Math.max(18, innerHeight * .18)}px`;
      return;
    }
    const rect = target.getBoundingClientRect();
    const pad = tutorialStep === 1 ? 8 : 12;
    spotlight.hidden = false;
    spotlight.style.left = `${Math.max(4, rect.left - pad)}px`;
    spotlight.style.top = `${Math.max(4, rect.top - pad)}px`;
    spotlight.style.width = `${Math.min(innerWidth - 8, rect.width + pad * 2)}px`;
    spotlight.style.height = `${Math.min(innerHeight - 8, rect.height + pad * 2)}px`;
    const bubbleWidth = Math.min(360, innerWidth - 24);
    bubble.style.width = `${bubbleWidth}px`;
    const bubbleHeight = bubble.offsetHeight || 190;
    let left = clamp(rect.left + rect.width / 2 - bubbleWidth / 2, 12, innerWidth - bubbleWidth - 12);
    let top = rect.bottom + 18;
    if (top + bubbleHeight > innerHeight - 12) top = rect.top - bubbleHeight - 18;
    if (top < 12) top = clamp(innerHeight - bubbleHeight - 12, 12, innerHeight - 12);
    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
  }

  function showTutorialStep(step, { title, text, target = null, actionLabel = '', action = null } = {}) {
    tutorialStep = step;
    tutorialTargetElement?.classList?.remove('tutorial-target-pulse');
    tutorialTargetElement = target;
    tutorialTargetElement?.classList?.add('tutorial-target-pulse');
    $('tutorialStepLabel').textContent = `STEP ${step} / 4`;
    $('tutorialTitle').textContent = title;
    $('tutorialText').textContent = text;
    tutorialAction = typeof action === 'function' ? action : null;
    const actionButton = $('tutorialActionBtn');
    actionButton.hidden = !tutorialAction;
    actionButton.textContent = actionLabel || '次へ';
    $('tutorialOverlay').hidden = false;
    if (target && step === 1) target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    syncPauseStateFromUi();
    renderUnitButtons();
    setTimeout(positionTutorialOverlay, target && step === 1 ? 360 : 20);
  }

  function startTutorial({ force = false } = {}) {
    if (gameStatus !== 'playing' || activeQuiz) {
      showMessage('バトル中にクイズが開いていない状態でチュートリアルを開始してください。', 4);
      return false;
    }
    const unit = tutorialReadyUnit();
    if (!unit) {
      showMessage('召喚可能なユニットがありません。エナジーと再召喚時間を確認してから開始してください。', 4.5);
      return false;
    }
    tutorialPending = false;
    tutorialActive = true;
    tutorialLastCorrect = false;
    tutorialTargetUnitId = unit.id;
    showTutorialStep(1, {
      title: '① 召喚ボタンを押す',
      text: `光っている「${unit.formula}」を押してください。召喚にはエナジーを使い、その後に化学問題が出ます。右下の「スキップ」でいつでも終了できます。`,
      target: unitButtons.get(unit.id)?.button || null
    });
    return true;
  }

  function showTutorialQuizStep() {
    showTutorialStep(2, {
      title: '② 問題を解く',
      text: '4つの選択肢から答えを1つ選んでください。問題を読んでいる間、バトルと倍速の残り時間は止まっています。',
      target: $('opts')
    });
  }

  function showTutorialAnswerStep(correct) {
    tutorialLastCorrect = Boolean(correct);
    showTutorialStep(3, {
      title: correct ? '③ 正解すると召喚成功' : '③ 正解したときだけ召喚成功',
      text: correct
        ? '正解です。解説を確認して「戦闘に戻る」を押すと、ユニットが戦場へ召喚されます。'
        : '今回は不正解なので召喚されません。正解・解説を確認し、「戦闘に戻る」を押してください。次の召喚で再挑戦できます。',
      target: $('continueBtn')
    });
  }

  function showTutorialCompleteStep(correct) {
    showTutorialStep(4, {
      title: '基本操作は完了です',
      text: correct
        ? '召喚に成功しました。エナジーがたまったら同じ流れで味方を増やし、敵を倒してコインを集めましょう。'
        : '召喚の流れを確認できました。不正解でも解説を読んで、次の召喚で正解すれば味方を出せます。',
      target: cv,
      actionLabel: 'チュートリアルを終了',
      action: () => finishTutorial(false)
    });
  }

  function finishTutorial(skipped = false) {
    tutorialTargetElement?.classList?.remove('tutorial-target-pulse');
    tutorialTargetElement = null;
    tutorialActive = false;
    tutorialPending = false;
    tutorialSeen = true;
    onboardingSeen = true;
    tutorialStep = 0;
    tutorialAction = null;
    $('tutorialOverlay').hidden = true;
    syncPauseStateFromUi();
    renderUnitButtons();
    saveGame({ silent: true });
    showMessage(skipped ? 'チュートリアルをスキップしました。設定からいつでも再開できます。' : 'チュートリアル完了！', 3.5);
  }

  function maybeStartPendingTutorial() {
    if (!tutorialPending || tutorialSeen || tutorialActive) return;
    const launchGate = $('mobileLaunchGate');
    if ((launchGate && !launchGate.hidden) || !$('profileModal').hidden || visibleBlockingOverlays().length > 0) {
      setTimeout(maybeStartPendingTutorial, 500);
      return;
    }
    startTutorial();
  }

  function guardTutorialPointer(event) {
    if (!tutorialActive) return;
    if ($('tutorialBubble').contains(event.target)) return;
    const allowed = tutorialStep === 1
      ? tutorialTargetElement?.contains(event.target)
      : tutorialStep === 2
        ? $('opts').contains(event.target)
        : tutorialStep === 3
          ? $('continueBtn').contains(event.target)
          : false;
    if (!allowed) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  function scopeLabel() {
    return D.scopeModes.find((mode) => mode.id === selectedScope)?.label || '現在の学習範囲（推奨）';
  }

  function updateScopeButton() {
    const button = $('scopeBtn');
    if (button) button.textContent = `出題範囲：${scopeLabel()}`;
  }

  function openScopeModal() {
    const area = $('scopeOptions');
    area.innerHTML = '';
    for (const mode of D.scopeModes) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'option-button';
      button.innerHTML = `<b>${mode.label}</b><br><small>${mode.description}</small>`;
      button.addEventListener('click', () => {
        const changed = selectedScope !== mode.id;
        selectedScope = mode.id;
        $('scopeModal').hidden = true;
        resumeFromOverlay();
        updateScopeButton();
        if (changed) {
          resetStage({ keepProgress: true });
          showMessage(`出題範囲を「${mode.label}」に変更しました。`, 3.5);
          saveGame({ silent: true });
        }
      });
      area.appendChild(button);
    }
    $('scopeModal').hidden = false;
    pauseForOverlay();
  }

  function openGuide({ firstLaunch = false } = {}) {
    $('guideDontShow').checked = firstLaunch ? true : onboardingSeen;
    $('guideModal').hidden = false;
    $('guideModal').dataset.firstLaunch = firstLaunch ? 'true' : 'false';
    pauseForOverlay();
    $('guideStartBtn').focus();
  }

  function closeGuide() {
    onboardingSeen = $('guideDontShow').checked;
    $('guideModal').hidden = true;
    resumeFromOverlay();
    saveGame({ silent: true });
    if (tutorialPending) setTimeout(maybeStartPendingTutorial, 120);
  }

  function captureCurrentStageProgress() {
    const progress = {
      coins: Math.max(0, Math.floor(finiteNumber(coins, 0))),
      unlocked: [...(unlocked || new Set(initialUnlockedIds()))],
      energyCapacityLevel: clamp(Math.floor(finiteNumber(energyCapacityLevel, 1)), 1, maxEnergyCapacityLevel()),
      unitUpgradeLevels: { ...defaultUnitUpgradeLevels(), ...(unitUpgradeLevels || {}) }
    };
    if (isStage10()) {
      progress.aquaRegiaUnlocked = Boolean(aquaRegiaUnlocked);
      progress.aquaRegiaLevel = clamp(Math.floor(finiteNumber(aquaRegiaLevel, 1)), 1, 10);
      progress.aquaAuContactComplete = Boolean(aquaAuContactComplete);
    }
    return progress;
  }

  function rememberCurrentStageProgress() {
    stageProgress[currentStageId] = captureCurrentStageProgress();
  }

  function restoreStageProgress(stageId) {
    const saved = stageProgress[stageId];
    const validIds = new Set(D.units.map((unit) => unit.id));
    const loadedUnlocked = Array.isArray(saved?.unlocked) ? saved.unlocked.filter((id) => validIds.has(id)) : [];
    unlocked = new Set([...initialUnlockedIds(), ...loadedUnlocked]);
    coins = Math.max(0, Math.floor(finiteNumber(saved?.coins, 0)));
    energyCapacityLevel = clamp(Math.floor(finiteNumber(saved?.energyCapacityLevel, 1)), 1, maxEnergyCapacityLevel());
    unitUpgradeLevels = defaultUnitUpgradeLevels();
    for (const unit of D.units) {
      unitUpgradeLevels[unit.id] = clamp(Math.floor(finiteNumber(saved?.unitUpgradeLevels?.[unit.id], 1)), 1, D.maxUpgradeLevel);
    }
    if (stageId === 10) {
      aquaRegiaUnlocked = Boolean(saved?.aquaRegiaUnlocked);
      aquaRegiaLevel = clamp(Math.floor(finiteNumber(saved?.aquaRegiaLevel, 1)), 1, 10);
      aquaAuContactComplete = Boolean(saved?.aquaAuContactComplete);
    }
    updateAquaRegiaUi();
  }

  function initialUnlockedIds() {
    return D.units.filter((unit) => unit.initiallyUnlocked).map((unit) => unit.id);
  }

  function currentWave() {
    return D.waves[clamp(currentWaveIndex, 0, D.waves.length - 1)];
  }

  function isFinalWave() {
    return currentWaveIndex === D.waves.length - 1;
  }

  function isEnemyBaseVulnerable() {
    if (isStage10()) return false;
    if (!isFinalWave()) return false;
    const wave = currentWave();
    return nextWaveEnemyIndex >= wave.enemies.length && wavePhase !== 'announcement';
  }

  function wavePhaseText() {
    if (isStage10() && isFinalWave()) return stage10State?.phase === 'combat' ? `Au戦｜敵 ${enemies.length}体` : `Au形成段階｜敵 ${enemies.length}体`;
    if (wavePhase === 'finalBase') return '敵拠点を破壊';
    const nextAt = Math.min(currentFinalWaveStartSeconds(), (currentWaveIndex + 1) * currentWaveIntervalSeconds());
    const remaining = Math.max(0, Math.ceil(nextAt - gameTime));
    if (isFinalWave()) return `最終ウェーブ｜敵 ${enemies.length}体`;
    return `次まで ${remaining}秒｜敵 ${enemies.length}体`;
  }

  function showWaveBanner(index) {
    const wave = D.waves[index];
    $('waveBannerTitle').textContent = `第${index + 1}ウェーブ`;
    $('waveBannerSub').textContent = `${wave.name}｜全${D.waves.length}ウェーブ`;
    $('waveBanner').hidden = false;
    waveBannerTimer = D.waveAnnouncementDuration;
  }

  function hideWaveBanner() {
    $('waveBanner').hidden = true;
    waveBannerTimer = 0;
  }

  function beginWave(index) {
    currentWaveIndex = clamp(index, 0, D.waves.length - 1);
    nextWaveEnemyIndex = 0;
    wavePhase = 'spawning';
    waveTimer = 0;
    waveSpawnTimer = 0;
    finalBaseMessageShown = false;
    showWaveBanner(currentWaveIndex);
    showMessage(`${currentWaveIndex === D.waves.length - 1 ? '最終' : `第${currentWaveIndex + 1}`}ウェーブ開始：${currentWave().name}`, 3);
    playSound(currentWaveIndex === 9 ? 'boss' : 'wave');
    grantWaveMilestoneBonus(currentWaveIndex + 1);
    const completedWaveNumber = currentWaveIndex;
    if ([3, 6, 9].includes(completedWaveNumber)) openResearchCardSelection(completedWaveNumber);
    updateHud();
  }

  function resetStage({ keepProgress = true } = {}) {
    stopTransientAudioNodes();
    if (!keepProgress) {
      coins = 0;
      unlocked = new Set(initialUnlockedIds());
      level = 1;
      experience = 0;
      energyCapacityLevel = 1;
      unitUpgradeLevels = defaultUnitUpgradeLevels();
      cumulativeStats = defaultCumulativeStats();
      achievementState = defaultAchievementState();
      onboardingSeen = false;
    } else {
      level = clamp(Math.floor(finiteNumber(level, 1)), 1, D.maxLevel);
      experience = clamp(Math.floor(finiteNumber(experience, 0)), 0, D.levelXpThresholds[D.maxLevel - 1]);
      energyCapacityLevel = clamp(Math.floor(finiteNumber(energyCapacityLevel, 1)), 1, D.maxUpgradeLevel);
      unitUpgradeLevels = { ...defaultUnitUpgradeLevels(), ...(unitUpgradeLevels || {}) };
    }

    cumulativeStats = { ...defaultCumulativeStats(), ...(cumulativeStats || {}) };
    achievementState = normalizeAchievementState(achievementState);
    runStats = defaultRunStats();
    waveMilestoneClaims = new Set();
    overlayPauseCount = 0;
    battleSpeedMultiplier = 1;
    battleSpeedRemaining = 0;
    activeMockReward = normalizeMockReward(mockExamProgress?.pendingReward);
    if (activeMockReward && mockExamProgress) mockExamProgress.pendingReward = null;
    achievementToastTimer = 0;
    $('achievementToast').hidden = true;

    const mockInitialEnergy = activeMockReward?.id === 'initial_energy' ? 25 : 0;
    energy = Math.min(D.startingEnergy + mockInitialEnergy, currentMaxEnergy());
    allyBaseHp = D.allyBaseHp;
    enemyBaseHp = D.enemyBaseHp;
    allies = [];
    enemies = [];
    combatEffects = [];
    projectiles = [];
    impactBursts = [];
    stage10State = defaultStage10State();
    setBgmDuckFactor(1);
    hideStage10Cinematic();
    hideBossArrivalEffect();
    clearBossPhaseTransition({ resume: false });
    battleInspectorKey = '';
    battleInspectorPinnedUntil = 0;
    battleInspectorLastAutoAt = 0;
    battleInspectorHintUntil = 18;
    activeResearchCards = [];
    researchCardClaimedWaves = new Set();
    pendingResearchWave = 0;
    renderResearchLoadout();
    if ($('researchCardModal')) $('researchCardModal').hidden = true;
    manualPaused = false;
    resumePromptPending = false;
    pauseReason = 'manual';
    if ($('pauseModal')) $('pauseModal').hidden = true;
    summonTimers = Object.fromEntries(D.units.map((unit) => [unit.id, 0]));
    summonUiRefreshTimer = 0;
    gameTime = 0;
    autoSaveTimer = 0;
    gameStatus = 'playing';
    endlessMode = false;
    endlessWaveTimer = 30;
    endlessWaveNumber = 0;
    paused = false;
    activeQuiz = null;
    allySpawnSerial = 0;
    enemySpawnSerial = 0;
    $('modal').hidden = true;
    $('achievementModal').hidden = true;
    $('guideModal').hidden = true;
    $('transferModal').hidden = true;
    $('tutorialOverlay').hidden = true;
    tutorialActive = false;
    $('endModal').hidden = true;
    if ($('researchCardModal')) $('researchCardModal').hidden = true;
    if ($('stageModal')) $('stageModal').hidden = true;
    if ($('stageGuideModal')) $('stageGuideModal').hidden = true;
    if ($('settingsModal')) $('settingsModal').hidden = true;
    if ($('infoModal')) $('infoModal').hidden = true;
    if ($('requestSubmitModal')) $('requestSubmitModal').hidden = true;
    lastTimestamp = performance.now();
    beginWave(0);
    syncBgmTrack({ restart: true });
    updateHud();
    renderUnitButtons();
    renderUpgradePanel();
    updateAquaRegiaUi();
    evaluateAchievements({ notify: false });
    const rewardMessage = mockRewardDefinition() ? `｜実戦報酬：${mockRewardDefinition().name}` : '';
    const stageRuleMessage = currentStageDefinition().rules?.disableRangedAllyAttacks ? '｜遠距離攻撃禁止・回復は使用可能' : '';
    showMessage(`${currentStageDefinition().milestone ? '◆ 難関｜' : ''}Stage ${currentStageId}「${currentStageDefinition().name}」開始${rewardMessage}${stageRuleMessage}。${formatStat(currentWaveIntervalSeconds(), 1)}秒ごとにWaveが進行します。`, currentStageDefinition().milestone ? 5.4 : 4.8);
  }

  function escapeGuideText(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function stageGuideDefinition(stageId) {
    return D.stageGuides?.[String(stageId)] || null;
  }

  function stageDefeatCount(stageId) {
    return Math.max(0, Math.floor(finiteNumber(cumulativeStats?.[`stage${stageId}Defeats`], 0)));
  }

  function stageGuideList(items) {
    return `<ul>${(Array.isArray(items) ? items : []).map((item) => `<li>${escapeGuideText(item)}</li>`).join('')}</ul>`;
  }

  function stageDefeatAnalysis() {
    const waveNumber = Math.max(1, currentWaveIndex + 1);
    const allyLosses = Math.max(0, Math.floor(finiteNumber(runStats?.alliesDefeated, 0)));
    const baseDamage = Math.max(0, Math.round(finiteNumber(runStats?.baseDamageTaken, 0)));
    if (currentStageId === 8 && waveNumber >= 10) {
      return `Wave ${waveNumber}で敗北しました。O₃出現後の再展開が間に合わなかった可能性が高いです。BOSS突入時のEnergyを125以上にし、演出終了直後は盾役を先に出してください。`;
    }
    if (currentStageId === 9) {
      return `Wave ${waveNumber}で敗北しました。遠距離攻撃は禁止されています。Alで射手の攻撃を受け、Feを接近させ、H₂Oで前線を維持してください。`;
    }
    if (waveNumber <= 3) {
      return `Wave ${waveNumber}で敗北しました。序盤の展開が遅いか、同じ役割へEnergyを使いすぎた可能性があります。最初は低コスト役を出し、盾または遠距離役の解放用コインを確保してください。`;
    }
    if (baseDamage >= D.allyBaseHp * 0.5) {
      return `拠点が${baseDamage}ダメージを受けています。前線が崩れてから立て直せなかった可能性があります。攻撃役を増やす前に盾役と回復役を補充してください。`;
    }
    if (allyLosses >= 8) {
      return `味方が${allyLosses}体倒されています。高コスト役が前へ出すぎたか、盾と回復が不足した可能性があります。召喚順を「盾→攻撃→回復」に整えてください。`;
    }
    if (waveNumber >= 9) {
      return `終盤のWave ${waveNumber}まで到達しています。基本編成は機能しています。BOSS直前にEnergyを使い切らず、特殊行動または第二形態への追加召喚分を残してください。`;
    }
    return `Wave ${waveNumber}で敗北しました。味方撃破${allyLosses}体、拠点被害${baseDamage}です。攻略情報の推奨役割とEnergy目安を確認し、欠けている役割を1つずつ補ってください。`;
  }

  function renderStageGuide(stageId, { source = 'stage-select' } = {}) {
    const id = STAGE_LIBRARY[stageId] ? stageId : currentStageId;
    const stage = STAGE_LIBRARY[id];
    const guide = stageGuideDefinition(id);
    if (!stage || !guide) return false;
    activeStageGuideId = id;
    activeStageGuideSource = source;
    const defeats = stageDefeatCount(id);
    const hints = [...(guide.progressiveHints || [])].sort((a, b) => finiteNumber(a.minDefeats, 0) - finiteNumber(b.minDefeats, 0));
    const hint = hints.filter((item) => defeats >= finiteNumber(item.minDefeats, 0)).at(-1) || hints[0] || { title: '攻略ヒント', body: '役割を分けて編成しましょう。' };
    $('stageGuideTitle').textContent = `Stage ${id}「${stage.name}」攻略`;
    $('stageGuideLead').textContent = guide.overview;
    $('stageGuideContent').innerHTML = `
      <section class="stage-guide-section wide"><h3>特殊ルール</h3><p>${escapeGuideText(guide.specialRule)}</p></section>
      <section class="stage-guide-section"><h3>危険な敵・注意点</h3>${stageGuideList(guide.dangerousEnemies)}</section>
      <section class="stage-guide-section"><h3>推奨する役割</h3>${stageGuideList(guide.recommendedRoles)}</section>
      <section class="stage-guide-section"><h3>化学相性・学習ポイント</h3><p>${escapeGuideText(guide.chemistryTip)}</p></section>
      <section class="stage-guide-section"><h3>BOSS対策</h3><p>${escapeGuideText(guide.bossStrategy)}</p></section>
      <section class="stage-guide-section wide"><h3>Energy・強化目安</h3><p>${escapeGuideText(guide.energyGuide)}</p></section>`;
    const fromDefeat = source === 'defeat' && id === currentStageId && gameStatus === 'defeat';
    const analysis = $('stageGuideDefeatAnalysis');
    analysis.hidden = !fromDefeat;
    analysis.innerHTML = fromDefeat ? `<strong>直前の敗北分析：</strong>${escapeGuideText(stageDefeatAnalysis())}` : '';
    $('stageGuideDefeatCount').textContent = `敗北 ${defeats}回`;
    $('stageGuideHintTitle').textContent = hint.title;
    $('stageGuideHintBody').textContent = hint.body;
    const unlocked = id <= Math.max(1, cumulativeStats.highestStageReached || 1);
    $('stageGuideSelectBtn').hidden = fromDefeat || id === currentStageId || !unlocked;
    $('stageGuideSelectBtn').textContent = `Stage ${id}を開始`;
    $('stageGuideRetryBtn').hidden = !fromDefeat;
    $('stageGuideCloseBottomBtn').textContent = fromDefeat ? '敗北画面へ戻る' : '閉じる';
    return true;
  }

  function openStageGuide(stageId, { source = 'stage-select' } = {}) {
    if (!renderStageGuide(stageId, { source })) return;
    $('stageGuideModal').hidden = false;
    pauseForOverlay();
    $('stageGuideCloseBtn').focus();
  }

  function closeStageGuide() {
    if ($('stageGuideModal').hidden) return;
    $('stageGuideModal').hidden = true;
    resumeFromOverlay();
  }

  function selectStageFromGuide() {
    const target = activeStageGuideId;
    $('stageGuideModal').hidden = true;
    if (target === currentStageId) {
      if (!$('stageModal').hidden) closeStageModal();
      else resumeFromOverlay();
      return;
    }
    switchStage(target);
  }

  function retryStageFromGuide() {
    if (activeStageGuideSource !== 'defeat' || activeStageGuideId !== currentStageId || gameStatus !== 'defeat') return;
    $('stageGuideModal').hidden = true;
    $('endModal').hidden = true;
    resetStage({ keepProgress: true });
    saveGame({ silent: true });
    showMessage(`Stage ${currentStageId}を第1ウェーブから再挑戦します。攻略情報を参考に、役割とEnergy配分を調整しましょう。`, 4.5);
  }

  function renderStageOptions() {
    const area = $('stageOptions');
    if (!area) return;
    area.innerHTML = '';
    for (const stage of Object.values(STAGE_LIBRARY)) {
      const locked = stage.id > Math.max(1, cumulativeStats.highestStageReached || 1);
      const current = stage.id === currentStageId;
      const cleared = (cumulativeStats.highestStageCleared || 0) >= stage.id;
      const saved = stageProgress[stage.id];
      const wrapper = document.createElement('div');
      wrapper.className = 'stage-card-wrap';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `stage-card${locked ? ' locked' : ''}${current ? ' current' : ''}${stage.milestone ? ' milestone' : ''}`;
      button.disabled = locked;
      const status = locked ? 'LOCKED' : current ? 'PLAYING' : cleared ? 'CLEAR' : saved ? 'PROGRESS' : 'NEW';
      button.innerHTML = `
        <span class="stage-card-stage">${stage.milestone ? '◆ MILESTONE ' : ''}STAGE ${stage.id}</span>
        <span class="stage-card-status">${status}</span>
        <h3>${stage.name}</h3>
        <p>${stage.description}</p>
        <div class="stage-card-meta"><span>ユニット ${stage.units.length}体</span><span>全${stage.waves.length}WAVE</span><span>${stage.difficultyLabel || '通常'}</span><span>${stage.enemyAttributeSummary || (saved ? `所持 ${saved.coins || 0} COIN` : '新規進行')}</span></div>`;
      button.addEventListener('click', () => switchStage(stage.id));
      const guideButton = document.createElement('button');
      guideButton.type = 'button';
      guideButton.className = 'stage-guide-button';
      guideButton.disabled = locked;
      guideButton.textContent = locked ? '🔒 Stage解放後に攻略を見る' : '🧭 攻略情報を見る';
      guideButton.addEventListener('click', () => openStageGuide(stage.id, { source: 'stage-select' }));
      wrapper.append(button, guideButton);
      area.appendChild(wrapper);
    }
  }

  function openStageModal() {
    if (isTimeAttackActive()) return;
    rememberCurrentStageProgress();
    renderStageOptions();
    updateTimeAttackUi();
    $('stageModal').hidden = false;
    pauseForOverlay();
  }

  function closeStageModal() {
    if ($('stageModal').hidden) return;
    $('stageModal').hidden = true;
    resumeFromOverlay();
  }

  function switchStage(stageId) {
    if (isTimeAttackActive()) return;
    const requested = Math.floor(finiteNumber(stageId, 1));
    const target = STAGE_LIBRARY[requested] ? requested : 1;
    if (target === currentStageId) { closeStageModal(); return; }
    if (target > Math.max(1, cumulativeStats.highestStageReached || 1)) return;
    rememberCurrentStageProgress();
    applyStageDefinition(target);
    restoreStageProgress(target);
    buildUnitButtons();
    buildUpgradePanel();
    buildFormulaGuide();
    $('stageModal').hidden = true;
    overlayPauseCount = 0;
    resetStage({ keepProgress: true });
    rememberCurrentStageProgress();
    saveGame({ silent: true });
    showMessage(`${currentStageDefinition().milestone ? '◆ 難関｜' : ''}Stage ${currentStageId}「${currentStageDefinition().name}」開始。ステージ固有進行を読み込みました。`, currentStageDefinition().milestone ? 5.2 : 4.2);
  }

  function activeBattleSpeed() {
    return battleSpeedRemaining > 0 ? battleSpeedMultiplier : 1;
  }

  function formatBattleSpeedTime(seconds) {
    const safe = Math.max(0, Math.ceil(finiteNumber(seconds, 0)));
    return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
  }

  function updateBattleSpeedTimer(realDt) {
    if (battleSpeedRemaining <= 0) return;
    battleSpeedRemaining = Math.max(0, battleSpeedRemaining - Math.max(0, realDt));
    if (battleSpeedRemaining <= 0) {
      battleSpeedMultiplier = 1;
      showMessage('倍速研究が終了し、通常速度へ戻りました。', 3.2);
    }
  }

  function storedSpeedTrialRetryAt() {
    try { return Math.max(0, finiteNumber(localStorage.getItem(SPEED_TRIAL_RETRY_KEY), 0)); } catch (_) { return 0; }
  }

  function speedTrialCooldownRemainingMs(now = Date.now()) {
    const remaining = Math.max(0, Math.max(speedTrialRetryAt, storedSpeedTrialRetryAt()) - now);
    if (remaining <= 0 && speedTrialRetryAt > 0) {
      speedTrialRetryAt = 0;
      try { localStorage.removeItem(SPEED_TRIAL_RETRY_KEY); } catch (_) {}
    }
    return remaining;
  }

  function startSpeedTrialCooldown() {
    speedTrialRetryAt = Date.now() + SPEED_TRIAL_COOLDOWN_MS;
    try { localStorage.setItem(SPEED_TRIAL_RETRY_KEY, String(speedTrialRetryAt)); } catch (_) {}
    return Math.ceil(SPEED_TRIAL_COOLDOWN_MS / 1000);
  }

  function applySpeedQuizResult(correct, quiz) {
    if (!quiz || quiz.mode !== 'speed' || quiz.allowOutsideGame || gameStatus !== 'playing') return '';
    const penalty = correct ? '' : ` 不正解のため、${startSpeedTrialCooldown()}秒間は再挑戦できません。`;
    if (battleSpeedRemaining <= 0) {
      if (!correct) return `倍速試験は不合格でした。通常速度のまま戦闘へ戻ります。${penalty}`;
      battleSpeedMultiplier = 1.5;
      battleSpeedRemaining = BATTLE_SPEED_DURATION;
      playSound('speed');
      return '⚡ 1.5倍速を獲得しました。戦闘が進行している時間だけ5:00減少します。';
    }
    if (battleSpeedMultiplier < 2.25) {
      if (correct) {
        battleSpeedMultiplier = 2.25;
        playSound('speed');
        return `⚡ 2.25倍速へ強化しました。残り${formatBattleSpeedTime(battleSpeedRemaining)}は延長されません。`;
      }
      return `⚡ 1.5倍速は残り${formatBattleSpeedTime(battleSpeedRemaining)}のまま継続します。${penalty}`;
    }
    return correct
      ? `⚡ 2.25倍速を継続します。残り${formatBattleSpeedTime(battleSpeedRemaining)}は延長されません。`
      : `⚡ 不正解でも2.25倍速は残り${formatBattleSpeedTime(battleSpeedRemaining)}のまま継続します。${penalty}`;
  }

  function updateHud() {
    $('energy').textContent = Math.floor(energy);
    $('maxEnergy').textContent = currentMaxEnergy();
    $('energyRate').textContent = formatStat(currentEnergyRegenRate(), 3);
    $('coins').textContent = coins;
    $('totalCoinsEarned').textContent = cumulativeStats.totalCoinsEarned;
    $('totalKills').textContent = cumulativeStats.totalKills;
    $('runKills').textContent = runStats.enemiesDefeated;
    $('level').textContent = level;
    $('maxLevel').textContent = D.maxLevel;

    const progress = experienceProgress();
    if (level >= D.maxLevel) {
      $('xpProgress').textContent = 'EXP MAX';
      $('xpRemaining').textContent = '最大レベル';
      $('xpFill').style.width = '100%';
    } else {
      $('xpProgress').textContent = `EXP ${progress.current} / ${progress.needed}`;
      $('xpRemaining').textContent = `次まで ${progress.remaining}`;
      $('xpFill').style.width = `${progress.ratio * 100}%`;
    }

    $('gameTime').textContent = Math.floor(gameTime);
    const speed = activeBattleSpeed();
    if ($('battleSpeed')) $('battleSpeed').textContent = `×${speed.toFixed(2)}`;
    if ($('speedTime')) $('speedTime').textContent = battleSpeedRemaining > 0 ? `残り ${formatBattleSpeedTime(battleSpeedRemaining)}` : '倍速試験で5:00';
    if ($('speedCard')) {
      $('speedCard').classList.toggle('active', battleSpeedRemaining > 0);
      $('speedCard').classList.toggle('tier-two', speed >= 2.25);
    }
    $('currentWave').textContent = currentWaveIndex + 1;
    $('finalWave').textContent = D.waves.length;
    $('wavePhase').textContent = `${currentStageDefinition().name}｜${wavePhaseText()}`;
    if ($('stageButtonLabel')) $('stageButtonLabel').textContent = currentStageDefinition().milestone ? `STAGE ${currentStageId} ◆難関` : `STAGE ${currentStageId}`;
    renderAchievementButton();
    updateTimeAttackUi();
  }

  function setSaveStatus(text) {
    $('saveStatus').textContent = text;
  }

  function showMessage(text, seconds = 2.2) {
    const element = $('battleMessage');
    element.textContent = text;
    element.classList.add('show');
    messageTimeout = seconds;
  }

  function availableQuestions(set) {
    const scopeOf = (question) => question.scope || 'foundation';
    if (selectedScope === 'foundation') {
      return set.filter((question) => scopeOf(question) === 'foundation');
    }
    if (selectedScope === 'foundation_electrolysis') {
      return set.filter((question) => ['foundation', 'foundation_electrolysis', 'electrolysis'].includes(scopeOf(question)));
    }
    if (selectedScope === 'all') {
      return set.filter((question) => scopeOf(question) !== 'theory');
    }
    if (selectedScope === 'theory_all') return set;
    return set.filter((question) => scopeOf(question) !== 'theory');
  }

  function normalizeQuestionForSimilarity(value) {
    return String(value || '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[0-9０-９₀-₉⁰¹²³⁴⁵⁶⁷⁸⁹]+(?:[.,．][0-9０-９]+)?/g, '#')
      .replace(/[\s　、。．，,.・:：;；!?！？「」『』（）()\[\]{}]/g, '')
      .replace(/mol\/l/g, '濃度')
      .replace(/標準状態における気体#molの体積を#lとする/g, '標準状態気体');
  }

  function questionKey(question) {
    return question?.id || normalizeQuestionForSimilarity(question?.q) || JSON.stringify(question);
  }

  function questionSignature(question) {
    const normalized = normalizeQuestionForSimilarity(question?.q);
    const grams = new Set();
    if (normalized.length < 3) {
      if (normalized) grams.add(normalized);
      return grams;
    }
    for (let index = 0; index <= normalized.length - 3; index += 1) grams.add(normalized.slice(index, index + 3));
    return grams;
  }

  function signatureSimilarity(left, right) {
    if (!left?.size || !right?.size) return 0;
    let overlap = 0;
    const smaller = left.size <= right.size ? left : right;
    const larger = left.size <= right.size ? right : left;
    smaller.forEach((token) => { if (larger.has(token)) overlap += 1; });
    return overlap / (left.size + right.size - overlap);
  }

  function questionFamily(question) {
    if (question?.similarityGroup) return String(question.similarityGroup);
    const text = normalizeQuestionForSimilarity(`${question?.q || ''} ${question?.explanation || ''}`);
    const category = questionCategory(question);
    const rules = [
      ['isotope_abundance', /同位体|平均原子量|存在比/],
      ['particle_count', /原子の個数|分子の個数|粒子数|アボガドロ/],
      ['solution_dilution', /希釈|水を加えて全体|c₁v₁|濃度.*体積/],
      ['neutralization', /中和|hcl.*naoh|h₂so₄.*naoh|酸.*塩基/],
      ['strong_ph', /ph|水素イオン濃度|oh⁻濃度/],
      ['precipitation', /沈殿|agcl|agbr|baso₄/],
      ['gas_stoichiometry', /標準状態.*体積|発生する.*h₂|発生する.*co₂/],
      ['limiting_reagent', /限界反応物|先に使い切|最大.*生成|混合物.*塩酸/],
      ['purity_yield', /純度|収率|質量百分率/],
      ['hydrate', /結晶水|·xh₂o|無水.*加熱/],
      ['empirical_formula', /組成式|酸化物.*還元/],
      ['oxidation_number', /酸化数/],
      ['redox_titration', /滴定.*mno₄|kmno₄.*滴定|cr₂o₇|c₂o₄/],
      ['half_reaction', /半反応式|受け取る電子|失う電子/],
      ['daniel_cell', /ダニエル電池|zn｜zn|zn極.*cu極/],
      ['lead_battery', /鉛蓄電池|pbo₂|pbso₄/],
      ['electrolysis_mass', /電気分解.*析出|析出.*電気量|ファラデー/],
      ['electrolysis_gas', /電気分解.*h₂|電気分解.*o₂|陽極.*cl₂|陰極.*h₂/],
      ['series_electrolysis', /直列.*電気分解|同じ電気量/],
      ['fcc', /面心立方|fcc/],
      ['bcc', /体心立方|bcc/],
      ['hcp', /六方最密|最密充填/],
      ['nacl_crystal', /nacl型|塩化ナトリウム型/],
      ['unit_cell_density', /格子定数.*密度|密度.*格子定数|単位格子.*密度/]
    ];
    const matched = rules.find(([, pattern]) => pattern.test(text));
    return `${category}:${matched ? matched[0] : text.slice(0, 18)}`;
  }

  function isNearRecentQuestion(question, history) {
    const signature = questionSignature(question);
    return history.some((entry) => signatureSimilarity(signature, entry.signature) >= 0.56);
  }

  function spacingKey(question, isHard = false) {
    return `${isHard ? 'hard' : 'basic'}:${questionKey(question)}`;
  }

  function normalizeSpacingData(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      version: 1,
      items: source.items && typeof source.items === 'object' ? source.items : {}
    };
  }

  function spacingStateFor(data, question, isHard = false) {
    return data?.spacing?.items?.[spacingKey(question, isHard)] || null;
  }

  function weightedQuestionPick(entries) {
    if (!entries.length) return null;
    const total = entries.reduce((sum, entry) => sum + Math.max(.001, finiteNumber(entry.weight, 1)), 0);
    let cursor = Math.random() * total;
    for (const entry of entries) {
      cursor -= Math.max(.001, finiteNumber(entry.weight, 1));
      if (cursor <= 0) return entry.question;
    }
    return entries[entries.length - 1].question;
  }

  function selectSpacedQuestion(pool, isHard = false, now = Date.now()) {
    if (!pool.length) return null;
    const data = readLearningData();
    const due = [];
    const unseen = [];
    const all = [];
    for (const question of pool) {
      const state = spacingStateFor(data, question, isHard);
      if (!state || !finiteNumber(state.attempts, 0)) {
        unseen.push(question);
        all.push({ question, weight: 2.4 });
        continue;
      }
      const dueAt = finiteNumber(state.dueAt, 0);
      const overdueDays = Math.max(0, (now - dueAt) / SPACING_DAY);
      if (dueAt <= now) {
        const weight = 6 + Math.min(10, overdueDays) + Math.min(4, finiteNumber(state.lapses, 0));
        due.push({ question, weight });
        all.push({ question, weight });
      } else {
        const daysUntilDue = Math.max(.05, (dueAt - now) / SPACING_DAY);
        all.push({ question, weight: Math.max(.05, .35 / daysUntilDue) });
      }
    }

    const roll = Math.random();
    if (due.length && roll < .60) return weightedQuestionPick(due);
    if (unseen.length && roll < .85) return unseen[Math.floor(Math.random() * unseen.length)];
    return weightedQuestionPick(all);
  }

  function chooseQuestion(set, isHard) {
    let filtered = availableQuestions(set);
    if (isHard) {
      const difficultyTier = currentStageId;
      const stageMatched = filtered.filter((question) => !question.stageTier || question.stageTier === difficultyTier);
      if (stageMatched.length) filtered = stageMatched;
    }
    const basePool = filtered.length ? filtered : set;
    const exactHistory = recentQuestionHistory.slice(-EXACT_QUESTION_HISTORY_LIMIT);
    const nearHistory = recentQuestionHistory.slice(-NEAR_QUESTION_HISTORY_LIMIT);
    const familyHistory = recentQuestionHistory.slice(-FAMILY_QUESTION_HISTORY_LIMIT);
    const exactKeys = new Set(exactHistory.map((entry) => entry.key));
    const recentFamilies = new Set(familyHistory.map((entry) => entry.family));

    const strictPool = basePool.filter((question) => {
      const key = questionKey(question);
      if (exactKeys.has(key)) return false;
      if (recentFamilies.has(questionFamily(question))) return false;
      return !isNearRecentQuestion(question, nearHistory);
    });
    const noNearPool = basePool.filter((question) => !exactKeys.has(questionKey(question)) && !isNearRecentQuestion(question, nearHistory));
    const noExactPool = basePool.filter((question) => !exactKeys.has(questionKey(question)));
    const pool = strictPool.length ? strictPool : noNearPool.length ? noNearPool : noExactPool.length ? noExactPool : basePool;
    const question = selectSpacedQuestion(pool, isHard) || pool[Math.floor(Math.random() * pool.length)];
    recentQuestionHistory.push({ key: questionKey(question), family: questionFamily(question), signature: questionSignature(question) });
    if (recentQuestionHistory.length > EXACT_QUESTION_HISTORY_LIMIT) recentQuestionHistory.shift();
    return question;
  }

  function toSuperscriptExponent(value) {
    const map = { '-': '⁻', '+': '⁺', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
    const exponent = String(value ?? '').replace(/^\+/, '');
    return [...exponent].map((character) => map[character] || character).join('');
  }

  function formatChemicalText(value) {
    return String(value ?? '')
      .replace(/\b(\d+(?:\.\d+)?)[eE]([+-]?\d+)\b/g, (_, coefficient, exponent) => `${coefficient}×10${toSuperscriptExponent(exponent)}`)
      .replace(/([A-Za-z0-9₀-₉⁺⁻²³⁴⁵⁶⁷⁸⁹\)])([。．、，])/g, '$1\u00A0$2');
  }

  function formatQuestionText(value) {
    return formatChemicalText(value)
      .replace(/(^|[。\n])([^。\n]*→[^。\n]*?)\u00A0?。(?=\S)/g, '$1$2\n')
      .replace(/([A-Za-z][A-Za-z₀-₉⁺⁻²³⁴⁵⁶⁷⁸⁹()]*[₀-₉])\u00A0。(?=\S)/g, '$1\n')
      .replace(/([A-Za-z][A-Za-z₀-₉⁺⁻²³⁴⁵⁶⁷⁸⁹()]*[₀-₉])\u00A0。$/g, '$1');
  }

  function questionCategory(question) {
    if (question?.category && CATEGORY_LABELS[question.category]) return question.category;
    const text = `${question?.q || ''} ${question?.explanation || ''}`;
    if (/エンタルピー|反応熱|ヘス|結合エネルギー|活性化エネルギー|反応速度|触媒/.test(text)) return 'thermo';
    if (/化学平衡|平衡定数|ルシャトリエ|電離平衡|緩衝|共通イオン|加水分解|水のイオン積/.test(text)) return 'equilibrium';
    if (/mol|モル|物質量|質量|収率|純度|係数比|限界反応物|濃度/.test(text)) return 'mol';
    if (/酸化|還元|電子|酸化数|MnO₄|Cr₂O₇|ClO₃/.test(text)) return 'redox';
    if (/電気分解|電池|陰極|陽極|電極|ファラデー|F=|起電力/.test(text)) return 'electrolysis';
    if (/格子|結晶|配位|単位格子|密度/.test(text)) return 'crystal';
    if (/酸|塩基|中和|pH|HCO₃|CO₃|滴定/.test(text)) return 'acidBase';
    if (/気体|分圧|蒸気圧|ヘンリー|状態方程式/.test(text)) return 'gas';
    if (/原子|同位体|電子配置|周期表/.test(text)) return 'matter';
    return 'other';
  }

  function defaultLearningData() {
    return { version: 2, totalAttempts: 0, totalCorrect: 0, summonAttempts: 0, summonCorrect: 0, hardAttempts: 0, hardCorrect: 0, practiceAttempts: 0, practiceCorrect: 0, mockAttempts: 0, mockCorrect: 0, currentStreak: 0, bestStreak: 0, byCategory: {}, spacing: normalizeSpacingData(null) };
  }

  function readLearningData() {
    try {
      const parsed = JSON.parse(localStorage.getItem(LEARNING_KEY) || 'null');
      if (!parsed || typeof parsed !== 'object') return defaultLearningData();
      return {
        ...defaultLearningData(),
        ...parsed,
        version: 2,
        byCategory: parsed.byCategory && typeof parsed.byCategory === 'object' ? parsed.byCategory : {},
        spacing: normalizeSpacingData(parsed.spacing)
      };
    } catch { return defaultLearningData(); }
  }

  function writeLearningData(data) {
    localStorage.setItem(LEARNING_KEY, JSON.stringify(data));
  }

  function setLearningResetStatus(message, tone = '') {
    const status = $('learningResetStatus');
    if (!status) return;
    status.textContent = message || '';
    status.className = `learning-reset-status${tone ? ` ${tone}` : ''}`;
  }

  function updateLearningResetConfirmation() {
    const input = $('learningResetConfirmInput');
    const execute = $('learningResetExecuteBtn');
    if (!input || !execute) return;
    execute.disabled = learningResetCompleted || input.value.trim() !== '初期化する';
    if (!learningResetCompleted) {
      setLearningResetStatus(execute.disabled ? 'この操作は取り消せません。' : '入力を確認しました。学習データだけを初期化できます。');
    }
  }

  function openLearningResetModal(returnView = 'learning') {
    learningResetReturnView = returnView === 'settings' ? 'settings' : 'learning';
    learningResetCompleted = false;
    $('settingsModal').hidden = true;
    $('infoModal').hidden = true;
    $('learningResetModal').hidden = false;
    const input = $('learningResetConfirmInput');
    input.value = '';
    input.disabled = false;
    $('learningResetExecuteBtn').disabled = true;
    setLearningResetStatus('この操作は取り消せません。');
    pauseForOverlay();
    window.setTimeout(() => input.focus(), 40);
  }

  function closeLearningResetModal() {
    if (learningResetCompleted) return;
    $('learningResetModal').hidden = true;
    if (learningResetReturnView === 'settings') {
      $('settingsModal').hidden = false;
      pauseForOverlay();
    } else {
      showInfoView('learning');
      pauseForOverlay();
    }
  }

  function resetLearningData() {
    const input = $('learningResetConfirmInput');
    if (input.value.trim() !== '初期化する') {
      setLearningResetStatus('確認語が一致していません。「初期化する」と入力してください。', 'error');
      return;
    }
    try {
      localStorage.removeItem(LEARNING_KEY);
      localStorage.removeItem(REVIEW_KEY);
      recentQuestionHistory = [];
      learningResetCompleted = true;
      input.disabled = true;
      $('learningResetExecuteBtn').disabled = true;
      setSaveStatus('学習データを初期化しました');
      setLearningResetStatus('初期化が完了しました。次の問題から新しい学習記録を開始します。', 'success');
      showMessage('学習データを初期化しました。ゲーム進行は維持されています。', 4.5);
      window.setTimeout(() => {
        $('learningResetModal').hidden = true;
        learningResetCompleted = false;
        showInfoView('learning');
        pauseForOverlay();
      }, 700);
    } catch (error) {
      console.error(error);
      learningResetCompleted = false;
      input.disabled = false;
      updateLearningResetConfirmation();
      setLearningResetStatus('学習データを削除できませんでした。ブラウザーの保存設定を確認してください。', 'error');
    }
  }

  function updateQuestionSpacing(data, question, correct, mode, now = Date.now()) {
    data.spacing = normalizeSpacingData(data.spacing);
    const isHard = mode === 'hard' || mode === 'speed';
    const key = spacingKey(question, isHard);
    const previous = data.spacing.items[key] && typeof data.spacing.items[key] === 'object' ? data.spacing.items[key] : {};
    const attempts = Math.max(0, Math.floor(finiteNumber(previous.attempts, 0))) + 1;
    const previousStreak = Math.max(0, Math.floor(finiteNumber(previous.correctStreak, 0)));
    const nextStreak = correct ? previousStreak + 1 : 0;
    const intervalDays = correct
      ? SPACING_CORRECT_INTERVAL_DAYS[Math.min(nextStreak - 1, SPACING_CORRECT_INTERVAL_DAYS.length - 1)]
      : 0;
    const delay = correct ? intervalDays * SPACING_DAY : SPACING_INCORRECT_DELAY_HOURS * SPACING_HOUR;
    data.spacing.items[key] = {
      attempts,
      correct: Math.max(0, Math.floor(finiteNumber(previous.correct, 0))) + (correct ? 1 : 0),
      correctStreak: nextStreak,
      lapses: Math.max(0, Math.floor(finiteNumber(previous.lapses, 0))) + (correct ? 0 : 1),
      lastAnsweredAt: now,
      lastResult: correct ? 'correct' : 'incorrect',
      dueAt: now + delay,
      intervalDays,
      family: questionFamily(question)
    };
  }

  function recordLearningResult(question, correct, mode) {
    const data = readLearningData();
    data.totalAttempts += 1;
    if (correct) data.totalCorrect += 1;
    if (mode === 'summon') { data.summonAttempts += 1; if (correct) data.summonCorrect += 1; }
    if (mode === 'hard' || mode === 'speed') { data.hardAttempts += 1; if (correct) data.hardCorrect += 1; }
    if (mode === 'practice' || mode === 'review') { data.practiceAttempts += 1; if (correct) data.practiceCorrect += 1; }
    if (mode === 'mock') { data.mockAttempts += 1; if (correct) data.mockCorrect += 1; }
    data.currentStreak = correct ? data.currentStreak + 1 : 0;
    data.bestStreak = Math.max(data.bestStreak, data.currentStreak);
    const category = questionCategory(question);
    const stats = data.byCategory[category] || { attempts: 0, correct: 0, recent: [] };
    stats.attempts += 1;
    if (correct) stats.correct += 1;
    stats.recent = [...(Array.isArray(stats.recent) ? stats.recent : []), Boolean(correct)].slice(-12);
    data.byCategory[category] = stats;
    updateQuestionSpacing(data, question, correct, mode);
    writeLearningData(data);
  }

  function percent(correct, attempts) {
    return attempts > 0 ? Math.round((correct / attempts) * 100) : 0;
  }

  function masteryInfo(stats = {}) {
    const attempts = finiteNumber(stats.attempts, 0);
    const rate = percent(finiteNumber(stats.correct, 0), attempts);
    const recent = Array.isArray(stats.recent) ? stats.recent : [];
    const recentRate = recent.length ? percent(recent.filter(Boolean).length, recent.length) : rate;
    if (!attempts) return { label: '未学習', score: 0 };
    if (attempts < 5 || rate < 50) return { label: '学習中', score: Math.min(35, 10 + attempts * 5) };
    if (attempts >= 15 && rate >= 90 && recentRate >= 85) return { label: 'マスター', score: 100 };
    if (attempts >= 10 && rate >= 75 && recentRate >= 70) return { label: '安定', score: 80 };
    if (rate >= 60) return { label: '基本習得', score: 60 };
    return { label: '学習中', score: 40 };
  }

  function readReviewItems() {
    try { const value = JSON.parse(localStorage.getItem(REVIEW_KEY) || '[]'); return Array.isArray(value) ? value.slice(0, 30) : []; }
    catch { return []; }
  }

  function snapshotQuestion(question) {
    return { id: question.id || '', q: question.q, options: question.options, answer: question.answer, explanation: question.explanation, source: question.source || '', scope: question.scope || 'foundation', category: questionCategory(question), difficulty: question.difficulty || '', stageTier: question.stageTier || null, similarityGroup: question.similarityGroup || '', calculation: Boolean(question.calculation), visual: question.visual || null, hints: Array.isArray(question.hints) ? question.hints : [], feedback: Array.isArray(question.feedback) ? question.feedback : [] };
  }

  function addReviewItem(question, selectedIndex) {
    const items = readReviewItems();
    const existing = items.find((item) => item.q === question.q);
    const next = {
      key: questionKey(question), q: question.q,
      correct: question.options[question.answer], selected: question.options[selectedIndex] || '', explanation: question.explanation,
      question: snapshotQuestion(question), wrongCount: finiteNumber(existing?.wrongCount, 0) + 1,
      reviewCorrectCount: 0, savedAt: Date.now(), lastWrongAt: Date.now()
    };
    localStorage.setItem(REVIEW_KEY, JSON.stringify([next, ...items.filter((item) => item.q !== question.q)].slice(0, 30)));
  }

  function markReviewCorrect(question) {
    const items = readReviewItems();
    const index = items.findIndex((item) => item.q === question.q);
    if (index < 0) return null;
    const count = finiteNumber(items[index].reviewCorrectCount, 0) + 1;
    if (count >= 3) {
      items.splice(index, 1);
      localStorage.setItem(REVIEW_KEY, JSON.stringify(items));
      return { mastered: true, count: 3 };
    }
    items[index].reviewCorrectCount = count;
    items[index].lastReviewedAt = Date.now();
    localStorage.setItem(REVIEW_KEY, JSON.stringify(items));
    return { mastered: false, count };
  }

  function removeReviewItem(q) {
    localStorage.setItem(REVIEW_KEY, JSON.stringify(readReviewItems().filter((item) => item.q !== q)));
  }

  function reviewQuestionFromItem(item) {
    if (item.question?.options?.length) return item.question;
    return [...D.quiz, ...D.hardQuiz].find((question) => question.q === item.q) || null;
  }

  function wrongReason(question, selectedIndex) {
    if (Array.isArray(question.feedback) && question.feedback[selectedIndex]) return question.feedback[selectedIndex];
    const category = questionCategory(question);
    if (category === 'mol') return 'g・L・mLを直接つながず、いったんmolへ直し、反応式の係数比と単位換算を順に確認してください。';
    if (category === 'redox') return '酸化数の増減と、電子を受け取る側・与える側を逆にしていないか確認してください。';
    if (category === 'electrolysis') return '陰極は還元、陽極は酸化です。電子の物質量と反応式の係数比も確認してください。';
    if (category === 'crystal') return '単位格子中の粒子数と、原子が接する対角線の種類を確認してください。';
    if (category === 'acidBase') return '酸・塩基の価数、中和の段階、H⁺とOH⁻の物質量比を確認してください。';
    if (category === 'gas') return '圧力・体積・絶対温度、蒸気圧、溶解量のどの関係を使うか整理してください。';
    if (category === 'thermo') return '反応エンタルピーの符号、反応式の向き・係数、活性化エネルギーを区別してください。';
    if (category === 'equilibrium') return '平衡は停止ではなく動的です。濃度・圧力・温度の変化を打ち消す向きを確認してください。';
    return '問題文の条件と、選択肢ごとの根拠をもう一度照合してください。';
  }


  function svgWrap(inner, viewBox='0 0 240 180') {
    return `<div class="visual-svg-wrap"><svg class="visual-svg" viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg></div>`;
  }

  function buildVisualAid(kind) {
    if (kind === 'fcc') {
      return {
        title: '結晶イメージ',
        badge: '面心立方格子',
        html: `<div class="visual-aid-card"><div class="visual-aid-head"><span class="visual-aid-title">VISUAL AID</span><span class="visual-aid-badge">面心立方格子</span></div><div class="visual-aid-layout"><div class="visual-aid-copy"><b>ポイント</b><ul><li>頂点8個と面心6個からできる立方体です。</li><li>単位格子中の原子数は <b>8×1/8 + 6×1/2 = 4</b>。</li><li>原子は<b>面対角線上</b>で接します。</li></ul></div>${svgWrap(`<rect x="36" y="38" width="92" height="92" rx="4" fill="none" stroke="#7fd9ff" stroke-width="2.2"/><rect x="96" y="18" width="92" height="92" rx="4" fill="none" stroke="#b5a1ff" stroke-width="2.2"/><line x1="36" y1="38" x2="96" y2="18" stroke="#6cd8ff" stroke-width="1.6"/><line x1="128" y1="38" x2="188" y2="18" stroke="#6cd8ff" stroke-width="1.6"/><line x1="36" y1="130" x2="96" y2="110" stroke="#6cd8ff" stroke-width="1.6"/><line x1="128" y1="130" x2="188" y2="110" stroke="#6cd8ff" stroke-width="1.6"/><line x1="36" y1="38" x2="36" y2="130" stroke="#6cd8ff" stroke-width="1.6"/><line x1="128" y1="38" x2="128" y2="130" stroke="#6cd8ff" stroke-width="1.6"/><line x1="96" y1="18" x2="96" y2="110" stroke="#6cd8ff" stroke-width="1.6"/><line x1="188" y1="18" x2="188" y2="110" stroke="#6cd8ff" stroke-width="1.6"/><g fill="#f4fbff" stroke="#062033" stroke-width="1.8"><circle cx="36" cy="38" r="9"/><circle cx="128" cy="38" r="9"/><circle cx="36" cy="130" r="9"/><circle cx="128" cy="130" r="9"/><circle cx="96" cy="18" r="9"/><circle cx="188" cy="18" r="9"/><circle cx="96" cy="110" r="9"/><circle cx="188" cy="110" r="9"/></g><g fill="#8ef1b3" stroke="#062033" stroke-width="1.8"><circle cx="82" cy="38" r="10"/><circle cx="82" cy="130" r="10"/><circle cx="36" cy="84" r="10"/><circle cx="128" cy="84" r="10"/><circle cx="142" cy="18" r="10"/><circle cx="142" cy="110" r="10"/></g><line x1="96" y1="18" x2="188" y2="110" stroke="#ffd779" stroke-width="3" stroke-dasharray="5 5"/><text x="148" y="58" fill="#ffd779" font-size="12" font-weight="700">面対角線</text>`)}</div><p class="visual-caption">面心立方格子では、原子半径rと格子定数aの関係は <b>a = 2√2r</b> です。</p></div>`,
        inline: svgWrap(`<rect x="34" y="34" width="74" height="74" fill="none" stroke="#7fd9ff" stroke-width="2"/><rect x="76" y="18" width="74" height="74" fill="none" stroke="#b5a1ff" stroke-width="2"/><line x1="34" y1="34" x2="76" y2="18" stroke="#7fd9ff" stroke-width="1.5"/><line x1="108" y1="34" x2="150" y2="18" stroke="#7fd9ff" stroke-width="1.5"/><line x1="34" y1="108" x2="76" y2="92" stroke="#7fd9ff" stroke-width="1.5"/><line x1="108" y1="108" x2="150" y2="92" stroke="#7fd9ff" stroke-width="1.5"/><g fill="#eefcff" stroke="#062033" stroke-width="1.5"><circle cx="34" cy="34" r="8"/><circle cx="108" cy="34" r="8"/><circle cx="34" cy="108" r="8"/><circle cx="108" cy="108" r="8"/><circle cx="76" cy="18" r="8"/><circle cx="150" cy="18" r="8"/><circle cx="76" cy="92" r="8"/><circle cx="150" cy="92" r="8"/></g><g fill="#8ef1b3" stroke="#062033" stroke-width="1.5"><circle cx="71" cy="34" r="8"/><circle cx="71" cy="108" r="8"/><circle cx="34" cy="71" r="8"/><circle cx="108" cy="71" r="8"/><circle cx="113" cy="18" r="8"/><circle cx="113" cy="92" r="8"/></g>`, '0 0 180 130')
      };
    }
    if (kind === 'nacl') {
      return {
        title: '結晶イメージ',
        badge: 'NaCl型結晶',
        html: `<div class="visual-aid-card"><div class="visual-aid-head"><span class="visual-aid-title">VISUAL AID</span><span class="visual-aid-badge">NaCl型</span></div><div class="visual-aid-layout"><div class="visual-aid-copy"><b>ポイント</b><ul><li>一方のイオンが面心立方格子、他方が八面体孔を埋めます。</li><li>Na⁺もCl⁻も<b>6配位</b>です。</li><li>単位格子中には <b>NaClが4組</b> 含まれます。</li></ul></div>${svgWrap(`<rect x="40" y="34" width="104" height="104" fill="none" stroke="#8ecfff" stroke-width="2.2"/><g fill="#80d8ff" stroke="#092133" stroke-width="1.8"><circle cx="40" cy="34" r="10"/><circle cx="144" cy="34" r="10"/><circle cx="40" cy="138" r="10"/><circle cx="144" cy="138" r="10"/><circle cx="92" cy="34" r="11"/><circle cx="92" cy="138" r="11"/><circle cx="40" cy="86" r="11"/><circle cx="144" cy="86" r="11"/></g><g fill="#ff9cc7" stroke="#092133" stroke-width="1.8"><circle cx="92" cy="86" r="11"/><circle cx="92" cy="58" r="8.5"/><circle cx="92" cy="114" r="8.5"/><circle cx="66" cy="86" r="8.5"/><circle cx="118" cy="86" r="8.5"/></g><text x="15" y="28" fill="#80d8ff" font-size="12" font-weight="700">Cl⁻</text><text x="156" y="86" fill="#ff9cc7" font-size="12" font-weight="700">Na⁺</text><line x1="92" y1="86" x2="136" y2="86" stroke="#ffd779" stroke-width="2" stroke-dasharray="4 4"/><text x="133" y="79" fill="#ffd779" font-size="11" font-weight="700">6配位</text>`)}</div><p class="visual-caption">NaCl型では、各イオンのまわりに反対符号のイオンが6個集まります。CsCl型の8配位と区別しましょう。</p></div>`,
        inline: svgWrap(`<rect x="28" y="24" width="90" height="90" fill="none" stroke="#8ecfff" stroke-width="2"/><g fill="#80d8ff" stroke="#092133" stroke-width="1.4"><circle cx="28" cy="24" r="7"/><circle cx="118" cy="24" r="7"/><circle cx="28" cy="114" r="7"/><circle cx="118" cy="114" r="7"/><circle cx="73" cy="24" r="8"/><circle cx="73" cy="114" r="8"/><circle cx="28" cy="69" r="8"/><circle cx="118" cy="69" r="8"/></g><g fill="#ff9cc7" stroke="#092133" stroke-width="1.4"><circle cx="73" cy="69" r="8"/><circle cx="73" cy="44" r="6"/><circle cx="73" cy="94" r="6"/><circle cx="48" cy="69" r="6"/><circle cx="98" cy="69" r="6"/></g>`, '0 0 145 138')
      };
    }
    if (kind === 'cscl') {
      return {
        title: '結晶イメージ',
        badge: 'CsCl型結晶',
        html: `<div class="visual-aid-card"><div class="visual-aid-head"><span class="visual-aid-title">VISUAL AID</span><span class="visual-aid-badge">CsCl型</span></div><div class="visual-aid-layout"><div class="visual-aid-copy"><b>ポイント</b><ul><li>立方体の中心にもう一方のイオンが入ります。</li><li>Cs⁺もCl⁻も<b>8配位</b>です。</li><li>単位格子中のCsClは <b>1組</b> です。</li></ul></div>${svgWrap(`<rect x="40" y="34" width="104" height="104" fill="none" stroke="#8ecfff" stroke-width="2.2"/><rect x="78" y="18" width="104" height="104" fill="none" stroke="#b6a4ff" stroke-width="2.2"/><line x1="40" y1="34" x2="78" y2="18" stroke="#8ecfff" stroke-width="1.6"/><line x1="144" y1="34" x2="182" y2="18" stroke="#8ecfff" stroke-width="1.6"/><line x1="40" y1="138" x2="78" y2="122" stroke="#8ecfff" stroke-width="1.6"/><line x1="144" y1="138" x2="182" y2="122" stroke="#8ecfff" stroke-width="1.6"/><g fill="#80d8ff" stroke="#092133" stroke-width="1.7"><circle cx="40" cy="34" r="10"/><circle cx="144" cy="34" r="10"/><circle cx="40" cy="138" r="10"/><circle cx="144" cy="138" r="10"/><circle cx="78" cy="18" r="10"/><circle cx="182" cy="18" r="10"/><circle cx="78" cy="122" r="10"/><circle cx="182" cy="122" r="10"/></g><g fill="#ffcf74" stroke="#092133" stroke-width="1.8"><circle cx="111" cy="78" r="14"/></g><line x1="40" y1="34" x2="111" y2="78" stroke="#ffd779" stroke-width="2" stroke-dasharray="4 4"/><text x="122" y="84" fill="#ffd779" font-size="12" font-weight="700">8配位</text>`)}</div><p class="visual-caption">CsCl型では、中心のイオンのまわりを立方体の8つの頂点のイオンが取り囲みます。</p></div>`,
        inline: svgWrap(`<rect x="24" y="24" width="88" height="88" fill="none" stroke="#8ecfff" stroke-width="2"/><rect x="56" y="10" width="88" height="88" fill="none" stroke="#b6a4ff" stroke-width="2"/><line x1="24" y1="24" x2="56" y2="10" stroke="#8ecfff" stroke-width="1.5"/><line x1="112" y1="24" x2="144" y2="10" stroke="#8ecfff" stroke-width="1.5"/><line x1="24" y1="112" x2="56" y2="98" stroke="#8ecfff" stroke-width="1.5"/><line x1="112" y1="112" x2="144" y2="98" stroke="#8ecfff" stroke-width="1.5"/><g fill="#80d8ff" stroke="#092133" stroke-width="1.4"><circle cx="24" cy="24" r="7"/><circle cx="112" cy="24" r="7"/><circle cx="24" cy="112" r="7"/><circle cx="112" cy="112" r="7"/><circle cx="56" cy="10" r="7"/><circle cx="144" cy="10" r="7"/><circle cx="56" cy="98" r="7"/><circle cx="144" cy="98" r="7"/></g><circle cx="84" cy="60" r="10" fill="#ffcf74" stroke="#092133" stroke-width="1.5"/>`, '0 0 170 130')
      };
    }
    if (kind === 'electrolysis') {
      return {
        title: '反応イメージ',
        badge: '電気分解',
        html: `<div class="visual-aid-card"><div class="visual-aid-head"><span class="visual-aid-title">VISUAL AID</span><span class="visual-aid-badge">電気分解</span></div><div class="visual-aid-layout"><div class="visual-aid-copy"><b>ポイント</b><ul><li><b>陰極(−)</b>では還元、<b>陽極(+)</b>では酸化が起こります。</li><li>電子は電源から陰極へ流れ込み、陽極から電源へ戻ります。</li><li>問題文にある物質から、どの半反応式が起こるかを判断します。</li></ul></div>${svgWrap(`<rect x="36" y="34" width="168" height="108" rx="12" fill="#10304f" stroke="#8ecfff" stroke-width="2"/><rect x="66" y="18" width="18" height="96" rx="8" fill="#d7eef7"/><rect x="156" y="18" width="18" height="96" rx="8" fill="#d7eef7"/><rect x="70" y="10" width="100" height="18" rx="9" fill="#19324b" stroke="#7bd8ff" stroke-width="1.4"/><text x="79" y="23" fill="#f4fbff" font-size="12" font-weight="700">電源</text><text x="55" y="17" fill="#8ef1b3" font-size="12" font-weight="700">−</text><text x="178" y="17" fill="#ff9bb1" font-size="12" font-weight="700">＋</text><text x="42" y="156" fill="#8ef1b3" font-size="12" font-weight="700">陰極：還元</text><text x="130" y="156" fill="#ff9bb1" font-size="12" font-weight="700">陽極：酸化</text><path d="M84 58 C112 46, 126 46, 154 58" fill="none" stroke="#ffe277" stroke-width="3" marker-end="url(#arrow)"/><path d="M154 100 C126 112, 112 112, 84 100" fill="none" stroke="#ffe277" stroke-width="3" marker-end="url(#arrow)"/><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="#ffe277"/></marker></defs><circle cx="98" cy="124" r="5" fill="#8ef1b3"/><circle cx="112" cy="126" r="5" fill="#8ef1b3"/><circle cx="171" cy="122" r="5" fill="#ff9bb1"/><circle cx="183" cy="127" r="5" fill="#ff9bb1"/>`)}</div><p class="visual-caption">覚え方：<b>陰極で還元・陽極で酸化</b>。溶融塩か水溶液かによって生じる物質も変わります。</p></div>`,
        inline: ''
      };
    }
    if (kind === 'hall') {
      return {
        title: '反応イメージ',
        badge: 'アルミニウム製錬',
        html: `<div class="visual-aid-card"><div class="visual-aid-head"><span class="visual-aid-title">VISUAL AID</span><span class="visual-aid-badge">氷晶石・Al₂O₃</span></div><div class="visual-aid-layout"><div class="visual-aid-copy"><b>ポイント</b><ul><li>Al₂O₃はそのままでは融点が高すぎるため、<b>氷晶石 Na₃AlF₆</b> に溶かします。</li><li><b>陰極</b>で Al³⁺ + 3e⁻ → Al、<b>陽極</b>ではO²⁻が酸化されます。</li><li>炭素電極は酸素と反応して消耗します。</li></ul></div>${svgWrap(`<rect x="38" y="28" width="162" height="112" rx="14" fill="#0f2841" stroke="#8ecfff" stroke-width="2"/><path d="M48 78 L190 78 L182 132 L56 132 Z" fill="#1b5373" stroke="#5fd2ff" stroke-width="1.4"/><rect x="70" y="10" width="14" height="56" rx="6" fill="#575f6c"/><rect x="112" y="10" width="14" height="56" rx="6" fill="#575f6c"/><rect x="154" y="10" width="14" height="56" rx="6" fill="#575f6c"/><text x="55" y="23" fill="#ffde84" font-size="12" font-weight="700">炭素陽極</text><text x="75" y="98" fill="#f4fbff" font-size="12" font-weight="700">溶融氷晶石 + Al₂O₃</text><text x="84" y="148" fill="#8ef1b3" font-size="12" font-weight="700">底部にAlがたまる</text><circle cx="82" cy="64" r="4" fill="#ff9bb1"/><circle cx="96" cy="68" r="4" fill="#ff9bb1"/><circle cx="111" cy="63" r="4" fill="#ff9bb1"/><path d="M95 86 C95 108, 95 118, 95 128" fill="none" stroke="#8ef1b3" stroke-width="3" marker-end="url(#arrow2)"/><defs><marker id="arrow2" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="#8ef1b3"/></marker></defs>`)}</div><p class="visual-caption">氷晶石を加える目的は、Al₂O₃の融点を下げ、電気分解しやすくすることです。</p></div>`,
        inline: ''
      };
    }
    if (kind === 'redox') {
      return {
        title: '酸化還元イメージ',
        badge: '電子の移動',
        html: `<div class="visual-aid-card"><div class="visual-aid-head"><span class="visual-aid-title">VISUAL AID</span><span class="visual-aid-badge">酸化還元</span></div><div class="visual-aid-layout"><div class="visual-aid-copy"><b>基本</b><ul><li>電子を失う側：酸化・還元剤</li><li>電子を受け取る側：還元・酸化剤</li><li>酸化数は酸化で増加、還元で減少</li></ul></div>${svgWrap(`<rect x="20" y="44" width="72" height="72" rx="18" fill="#173a57" stroke="#7fd9ff" stroke-width="2"/><rect x="148" y="44" width="72" height="72" rx="18" fill="#4b2440" stroke="#ff9fc5" stroke-width="2"/><text x="38" y="72" fill="#eaffff" font-size="14" font-weight="700">還元剤</text><text x="165" y="72" fill="#fff0f7" font-size="14" font-weight="700">酸化剤</text><text x="32" y="98" fill="#8ef1b3" font-size="12">電子を失う</text><text x="158" y="98" fill="#ffd1e6" font-size="12">電子を受け取る</text><path d="M92 80 C112 62,128 62,148 80" fill="none" stroke="#ffe277" stroke-width="4" marker-end="url(#eArrow)"/><text x="108" y="52" fill="#ffe277" font-size="14" font-weight="700">e⁻</text><defs><marker id="eArrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="#ffe277"/></marker></defs><text x="31" y="136" fill="#8ef1b3" font-size="13" font-weight="700">酸化数 ↑</text><text x="160" y="136" fill="#ffb4d1" font-size="13" font-weight="700">酸化数 ↓</text>`)}</div><p class="visual-caption">酸化剤自身は還元され、還元剤自身は酸化されます。</p></div>`,
        inline: ''
      };
    }
    if (kind === 'cell') {
      return {
        title: '電池イメージ',
        badge: 'ダニエル電池',
        html: `<div class="visual-aid-card"><div class="visual-aid-head"><span class="visual-aid-title">VISUAL AID</span><span class="visual-aid-badge">電池</span></div><div class="visual-aid-layout"><div class="visual-aid-copy"><b>ダニエル電池</b><ul><li>Zn極：負極・酸化</li><li>Cu極：正極・還元</li><li>電子はZn極からCu極へ流れる</li></ul></div>${svgWrap(`<rect x="24" y="44" width="78" height="92" rx="12" fill="#183952" stroke="#74d8ff" stroke-width="2"/><rect x="138" y="44" width="78" height="92" rx="12" fill="#452a43" stroke="#ff9fc5" stroke-width="2"/><rect x="54" y="24" width="12" height="90" fill="#b7c2cc"/><rect x="174" y="24" width="12" height="90" fill="#d7875d"/><text x="43" y="153" fill="#dff7ff" font-size="13" font-weight="700">Zn極 (−)</text><text x="158" y="153" fill="#ffe3ef" font-size="13" font-weight="700">Cu極 (+)</text><path d="M66 28 C104 8,136 8,174 28" fill="none" stroke="#ffe277" stroke-width="4" marker-end="url(#cArrow)"/><text x="108" y="17" fill="#ffe277" font-size="13" font-weight="700">e⁻</text><path d="M102 92 C116 72,124 72,138 92" fill="none" stroke="#8ef1b3" stroke-width="5"/><defs><marker id="cArrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="#ffe277"/></marker></defs>`)}</div><p class="visual-caption">外部回路では電子が負極から正極へ流れます。</p></div>`,
        inline: ''
      };
    }
    if (kind === 'moleMap' || kind === 'stoich') {
      return {html:`<div class="visual-aid-card"><div class="visual-aid-head"><span class="visual-aid-title">CALCULATION MAP</span><span class="visual-aid-badge">mol計算</span></div><div class="visual-aid-layout"><div class="visual-aid-copy"><b>変換の順序</b><ul><li>質量 ÷ モル質量 → mol</li><li>反応式の係数比でmolを移す</li><li>mol × 22.4 → 標準状態のL</li></ul></div>${svgWrap(`<rect x="8" y="60" width="58" height="46" rx="12" fill="#183952" stroke="#79dfff" stroke-width="2"/><rect x="91" y="60" width="58" height="46" rx="12" fill="#324163" stroke="#aab6ff" stroke-width="2"/><rect x="174" y="60" width="58" height="46" rx="12" fill="#47314a" stroke="#ffb0d4" stroke-width="2"/><text x="28" y="88" fill="#eaffff" font-size="14" font-weight="700">g</text><text x="107" y="88" fill="#fff" font-size="14" font-weight="700">mol</text><text x="194" y="88" fill="#fff0f7" font-size="14" font-weight="700">L</text><path d="M66 83 L91 83" stroke="#ffe277" stroke-width="4" marker-end="url(#m1)"/><path d="M149 83 L174 83" stroke="#ffe277" stroke-width="4" marker-end="url(#m1)"/><text x="67" y="50" fill="#ffe7a4" font-size="10">÷モル質量</text><text x="159" y="50" fill="#ffe7a4" font-size="10">×22.4</text><defs><marker id="m1" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="#ffe277"/></marker></defs><text x="76" y="132" fill="#8ef1b3" font-size="12" font-weight="700">反応式ではmol比を使う</text>`)}</div><p class="visual-caption">数値を直接つなげず、必ずmolを中継すると整理しやすくなります。</p></div>`};
    }
    if (kind === 'particles') {
      return {html:`<div class="visual-aid-card"><div class="visual-aid-head"><span class="visual-aid-title">PARTICLE MAP</span><span class="visual-aid-badge">粒子数</span></div><div class="visual-aid-layout"><div class="visual-aid-copy"><b>粒子数とmol</b><ul><li>6.0×10²³個＝1 mol</li><li>粒子数÷Nₐでmol</li><li>molから質量・体積へ変換</li></ul></div>${svgWrap(`<g fill="#7fd9ff">${Array.from({length:18},(_,i)=>`<circle cx="${25+(i%6)*28}" cy="${35+Math.floor(i/6)*35}" r="7"/>`).join('')}</g><path d="M190 75 L225 75" stroke="#ffe277" stroke-width="4" marker-end="url(#p1)"/><text x="182" y="55" fill="#ffe277" font-size="11">÷6.0×10²³</text><circle cx="228" cy="75" r="18" fill="#8ef1b3"/><text x="217" y="80" fill="#092133" font-size="12" font-weight="700">mol</text><defs><marker id="p1" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="#ffe277"/></marker></defs>`)}</div></div>`};
    }
    if (kind === 'solution') {
      return {html:`<div class="visual-aid-card"><div class="visual-aid-head"><span class="visual-aid-title">SOLUTION MAP</span><span class="visual-aid-badge">モル濃度</span></div><div class="visual-aid-layout"><div class="visual-aid-copy"><b>n＝cV</b><ul><li>mLは1000で割ってLへ</li><li>濃度×体積(L)＝mol</li><li>その後に係数比を使う</li></ul></div>${svgWrap(`<path d="M70 30 L150 30 L165 140 L55 140 Z" fill="#164b69" stroke="#7fd9ff" stroke-width="2"/><path d="M61 95 L159 95 L165 140 L55 140 Z" fill="#4ca4c7" opacity=".65"/><text x="78" y="83" fill="#fff" font-size="15" font-weight="700">c mol/L</text><text x="86" y="122" fill="#fff" font-size="15" font-weight="700">V L</text><text x="74" y="162" fill="#ffe277" font-size="14" font-weight="700">n = c × V</text>`)}</div></div>`};
    }
    if (kind === 'limiting') {
      return {html:`<div class="visual-aid-card"><div class="visual-aid-head"><span class="visual-aid-title">LIMITING REACTANT</span><span class="visual-aid-badge">不足する反応物</span></div><div class="visual-aid-layout"><div class="visual-aid-copy"><b>判定法</b><ul><li>両方をmolに直す</li><li>それぞれ係数で割る</li><li>小さい方が先になくなる</li></ul></div>${svgWrap(`<g fill="#79dfff"><circle cx="45" cy="55" r="15"/><circle cx="82" cy="55" r="15"/></g><text x="38" y="95" fill="#dff8ff" font-size="12">A：2個</text><g fill="#ffb0d4"><circle cx="145" cy="45" r="13"/><circle cx="175" cy="45" r="13"/><circle cx="205" cy="45" r="13"/></g><text x="145" y="95" fill="#ffe4ef" font-size="12">B：3個</text><path d="M100 120 L140 120" stroke="#ffe277" stroke-width="4" marker-end="url(#l1)"/><text x="45" y="145" fill="#8ef1b3" font-size="12" font-weight="700">係数比で比較</text><defs><marker id="l1" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="#ffe277"/></marker></defs>`)}</div></div>`};
    }
    if (kind === 'purity' || kind === 'yield' || kind === 'hydrate') {
      return {html:`<div class="visual-aid-card"><div class="visual-aid-head"><span class="visual-aid-title">STEP MAP</span><span class="visual-aid-badge">補正計算</span></div><div class="visual-aid-layout"><div class="visual-aid-copy"><b>先に補正</b><ul><li>純度：試料×純度</li><li>収率：理論量×収率</li><li>結晶水：式量の内訳を確認</li></ul></div>${svgWrap(`<rect x="25" y="48" width="70" height="70" rx="12" fill="#31455f" stroke="#9cbcff" stroke-width="2"/><rect x="145" y="48" width="70" height="70" rx="12" fill="#315343" stroke="#8ef1b3" stroke-width="2"/><text x="40" y="78" fill="#fff" font-size="12">全体量</text><text x="158" y="78" fill="#fff" font-size="12">有効量</text><path d="M95 83 L145 83" stroke="#ffe277" stroke-width="4" marker-end="url(#y1)"/><text x="100" y="63" fill="#ffe277" font-size="11">×割合</text><defs><marker id="y1" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="#ffe277"/></marker></defs>`)}</div></div>`};
    }
    return null;
  }

  function questionVisualKind(question) {
    if (question.visual) return question.visual;
    const text = `${question.q} ${question.explanation || ''} ${question.source || ''}`;
    if (/NaCl型/.test(text)) return 'nacl';
    if (/CsCl型/.test(text)) return 'cscl';
    if (/面心立方/.test(text)) return 'fcc';
    if (/氷晶石|Al₂O₃|アルミニウム製錬|融解塩電解/.test(text)) return 'hall';
    if (/ダニエル電池|電池の負極|電池の正極|Zn極|Cu極/.test(text)) return 'cell';
    if (/酸化剤|還元剤|酸化数|電子を失|電子を受け取|MnO₄|Cr₂O₇|H₂O₂/.test(text)) return 'redox';
    if (/電気分解|陰極|陽極|半反応式/.test(text)) return 'electrolysis';
    return null;
  }

  function renderVisualInto(hostId, question) {
    const visualHost = $(hostId);
    const kind = questionVisualKind(question);
    if (!kind) {
      visualHost.hidden = true;
      visualHost.innerHTML = '';
      return;
    }
    const visual = buildVisualAid(kind);
    if (!visual) {
      visualHost.hidden = true;
      visualHost.innerHTML = '';
      return;
    }
    visualHost.hidden = false;
    visualHost.innerHTML = visual.html;
    visualHost.querySelector('.visual-svg-wrap')?.addEventListener('click', () => visualHost.classList.toggle('zoomed'));
  }

  function renderQuestionVisual(question) { renderVisualInto('visualAid', question); }

  function renderPromptVisual(question) {
    if (question.requiresVisual) renderVisualInto('questionVisualAid', question);
    else {
      $('questionVisualAid').hidden = true;
      $('questionVisualAid').innerHTML = '';
    }
  }

  function renderInlineGuideVisuals() {
    document.querySelectorAll('[data-visual-inline]').forEach((element) => {
      const kind = element.dataset.visualInline;
      const visual = buildVisualAid(kind);
      if (visual?.inline) element.innerHTML = visual.inline;
    });
  }

  function hardHintCost() { return currentStageId >= 2 ? 8 : 5; }

  function renderHardHintPanel() {
    const panel = $('hardHintPanel');
    if (!activeQuiz?.isHard || activeQuiz.answered) {
      panel.hidden = true;
      $('hintText').hidden = true;
      $('hintText').textContent = '';
      return;
    }
    const hints = Array.isArray(activeQuiz.question.hints) ? activeQuiz.question.hints : [];
    panel.hidden = !hints.length;
    if (!hints.length) return;
    const revealed = activeQuiz.hintsRevealed || 0;
    $('hintCostNote').textContent = `ヒント1個につき${hardHintCost()} COINを消費します。正解そのものは表示しません。`;
    $('hintBtn').disabled = revealed >= hints.length;
    $('hintBtn').textContent = revealed >= hints.length ? 'すべて表示済み' : `ヒント${revealed + 1}を見る（${hardHintCost()} COIN）`;
    $('hintText').hidden = revealed === 0;
    $('hintText').textContent = hints.slice(0, revealed).map((hint, index) => `ヒント${index + 1}：${formatChemicalText(hint)}`).join('\n');
  }

  function revealHardHint() {
    if (!activeQuiz?.isHard || activeQuiz.answered) return;
    const hints = Array.isArray(activeQuiz.question.hints) ? activeQuiz.question.hints : [];
    const revealed = activeQuiz.hintsRevealed || 0;
    if (revealed >= hints.length) return;
    const cost = hardHintCost();
    if (coins < cost) {
      $('hintCostNote').textContent = `コイン不足です。ヒントには${cost} COIN必要です。`;
      return;
    }
    coins -= cost;
    activeQuiz.hintsRevealed = revealed + 1;
    updateHud();
    renderHardHintPanel();
    saveGame({ silent: true });
  }

  function fallbackFourthOption(question) {
    const existing = new Set((question.options || []).map((option) => String(option)));
    const text = `${question.q || ''} ${question.explanation || ''}`;
    const candidates = [];
    if (question.calculation || /mol|物質量|質量|体積|濃度|電気量|密度/.test(text)) candidates.push('条件からは一意に求められない');
    if (/電気分解|陰極|陽極|電極/.test(text)) candidates.push('電極では反応が起こらない');
    if (/酸化|還元|電子/.test(text)) candidates.push('電子の授受は起こらない');
    if (/結晶|格子|配位数/.test(text)) candidates.push('結晶の種類だけでは決められない');
    candidates.push('いずれにも当てはまらない', '条件だけでは判断できない');
    return candidates.find((candidate) => !existing.has(candidate)) || '別の条件が必要である';
  }

  function prepareQuestionForDisplay(originalQuestion) {
    const baseOptions = Array.isArray(originalQuestion.options) ? [...originalQuestion.options] : [];
    while (baseOptions.length < 4) baseOptions.push(fallbackFourthOption({ ...originalQuestion, options: baseOptions }));
    const originalFeedback = Array.isArray(originalQuestion.feedback) ? originalQuestion.feedback : [];
    const entries = baseOptions.map((text, index) => ({
      text,
      correct: index === originalQuestion.answer,
      feedback: originalFeedback[index] || ''
    }));
    for (let index = entries.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [entries[index], entries[target]] = [entries[target], entries[index]];
    }
    return {
      ...originalQuestion,
      options: entries.map((entry) => entry.text),
      answer: entries.findIndex((entry) => entry.correct),
      feedback: entries.map((entry) => entry.feedback)
    };
  }

  function openQuiz(question, { kicker, title, onComplete, isHard = false, mode = 'battle', allowOutsideGame = false, allowDuringTutorial = false } = {}) {
    if (!question) return;
    question = prepareQuestionForDisplay(question);
    if (!allowOutsideGame && ((paused && !allowDuringTutorial) || gameStatus !== 'playing')) return;

    if (guestAssistEnabled) {
      const callback = typeof onComplete === 'function' ? onComplete : () => {};
      const assistedQuiz = { question, isHard, mode, allowOutsideGame, hintsRevealed: 0, assisted: true };
      queueMicrotask(() => {
        applySpeedQuizResult(true, assistedQuiz);
        callback(true, { assisted: true });
        if (tutorialActive && mode === 'summon') showTutorialCompleteStep(true);
        lastTimestamp = performance.now();
        updateHud();
        renderUnitButtons();
        renderUpgradePanel();
        saveGame({ silent: true });
      });
      return;
    }

    paused = true;
    activeQuiz = { question, onComplete: typeof onComplete === 'function' ? onComplete : () => {}, answered: false, isHard, mode, allowOutsideGame, hintsRevealed: 0 };
    $('modalKicker').textContent = kicker || (isHard ? 'UNIVERSITY EXAM STYLE' : 'CHEMISTRY QUIZ');
    $('modalTitle').textContent = title || '化学クイズ';
    const sourceElement = $('questionSource');
    if (question.source) {
      const meta = [`出典・参考資料：${question.source}`, question.difficulty ? `難易度：${question.difficulty}` : '', CATEGORY_LABELS[questionCategory(question)]].filter(Boolean);
      sourceElement.textContent = formatChemicalText(meta.join('｜'));
      sourceElement.hidden = false;
    } else {
      sourceElement.textContent = '';
      sourceElement.hidden = true;
    }
    const contextElement = $('questionContext');
    if (question.context) { contextElement.textContent = formatQuestionText(question.context); contextElement.hidden = false; }
    else { contextElement.textContent = ''; contextElement.hidden = true; }
    $('qtext').textContent = formatQuestionText(question.q);
    $('calculationHint').hidden = true;
    $('visualAid').hidden = true;
    $('visualAid').innerHTML = '';
    renderPromptVisual(question);
    $('answerPanel').hidden = true;
    $('answerResult').className = 'answer-result';
    if ($('speedBoostNote')) { $('speedBoostNote').hidden = true; $('speedBoostNote').textContent = ''; }
    $('continueBtn').textContent = allowOutsideGame ? '次へ' : '戦闘に戻る';

    const optionsArea = $('opts');
    optionsArea.innerHTML = '';
    question.options.forEach((optionText, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'option-button';
      button.textContent = formatChemicalText(optionText);
      button.addEventListener('click', () => answerQuiz(index));
      optionsArea.appendChild(button);
    });
    renderHardHintPanel();
    $('modal').hidden = false;
  }

  function answerQuiz(selectedIndex) {
    if (!activeQuiz || activeQuiz.answered) return;

    activeQuiz.answered = true;
    const { question, mode } = activeQuiz;
    const correct = selectedIndex === question.answer;
    const optionButtons = [...$('opts').querySelectorAll('.option-button')];

    optionButtons.forEach((button, index) => {
      button.disabled = true;
      if (index === question.answer) button.classList.add('correct');
      if (index === selectedIndex && !correct) button.classList.add('wrong');
    });

    if (!isTimeAttackActive()) recordLearningResult(question, correct, mode);
    const speedBoostMessage = applySpeedQuizResult(correct, activeQuiz);
    if ($('speedBoostNote')) {
      $('speedBoostNote').textContent = speedBoostMessage;
      $('speedBoostNote').hidden = !speedBoostMessage;
    }
    $('answerResult').textContent = correct ? '正解！' : '不正解';
    $('answerResult').classList.add(correct ? 'good' : 'bad');
    playSound(correct ? 'correct' : 'wrong');
    $('correctAnswer').textContent = `正解：${formatChemicalText(question.options[question.answer])}`;
    if (!isTimeAttackActive()) {
      if (!correct) addReviewItem(question, selectedIndex);
      else if (mode === 'review' || mode === 'practice') markReviewCorrect(question);
    }
    const selectedFeedback = !correct ? wrongReason(question, selectedIndex) : '';
    $('explanation').textContent = formatChemicalText(question.explanation + (selectedFeedback ? `\n\n【誤答原因の確認】${selectedFeedback}` : ''));
    $('calculationHint').hidden = !question.calculation;
    renderQuestionVisual(question);
    $('answerPanel').hidden = false;
    $('hardHintPanel').hidden = true;
    if (tutorialActive && tutorialStep === 2 && mode === 'summon') showTutorialAnswerStep(correct);
    $('continueBtn').focus();
  }

  function clearQuizVisuals() {
    $('questionContext').hidden = true;
    $('questionContext').textContent = '';
    for (const id of ['visualAid', 'questionVisualAid']) {
      $(id).hidden = true;
      $(id).classList.remove('zoomed');
      $(id).innerHTML = '';
    }
    $('calculationHint').hidden = true;
    if ($('speedBoostNote')) { $('speedBoostNote').hidden = true; $('speedBoostNote').textContent = ''; }
    $('hardHintPanel').hidden = true;
    $('hintText').hidden = true;
    $('hintText').textContent = '';
  }

  function closeQuiz() {
    if (!activeQuiz || !activeQuiz.answered) return;

    const completedQuiz = activeQuiz;
    const callback = completedQuiz.onComplete;
    const correct = $('answerResult').classList.contains('good');
    activeQuiz = null;
    $('modal').hidden = true;
    clearQuizVisuals();
    lastTimestamp = performance.now();
    callback(correct);
    if (tutorialActive && tutorialStep === 3 && completedQuiz.mode === 'summon') showTutorialCompleteStep(correct);
    syncPauseStateFromUi();
    updateHud();
    renderUnitButtons();
    renderUpgradePanel();
    saveGame({ silent: true });
  }


  function summonCooldownRemaining(unitId) {
    const remaining = Math.max(0, finiteNumber(summonTimers?.[unitId], 0));
    if (remaining <= SUMMON_READY_EPSILON) {
      if (summonTimers) summonTimers[unitId] = 0;
      return 0;
    }
    return remaining;
  }

  function stageBlocksRangedAlly(unit) {
    return Boolean(currentStageDefinition().rules?.disableRangedAllyAttacks && unit?.rangedAttack);
  }

  function requestSummon(unit) {
    const tutorialAllowed = tutorialActive && tutorialStep === 1 && unit.id === tutorialTargetUnitId;
    if ((paused && !tutorialAllowed) || gameStatus !== 'playing') return;
    const summonCost = effectiveUnitCost(unit);

    if (!unlocked.has(unit.id)) {
      requestUnlock(unit);
      return;
    }

    if (stageBlocksRangedAlly(unit)) {
      showMessage(currentStageDefinition().rules?.rangedAttackMessage || 'このStageでは遠距離攻撃が禁止されています。', 4.2);
      return;
    }

    const cooldownRemaining = summonCooldownRemaining(unit.id);
    if (cooldownRemaining > 0) {
      showMessage(`${unit.formula}は再召喚まで${cooldownRemaining.toFixed(1)}秒です。`);
      return;
    }

    if (energy < summonCost) {
      showMessage(`エネルギー不足：${unit.formula}には${summonCost}必要です。`);
      return;
    }

    saveGame({ silent: true });
    energy -= summonCost;
    updateHud();
    renderUnitButtons();

    openQuiz(chooseQuestion(D.quiz, false), {
      isHard: false,
      mode: 'summon',
      kicker: `召喚試験｜ENERGY −${summonCost}`,
      title: `${unit.formula}を召喚`,
      allowDuringTutorial: tutorialAllowed,
      onComplete: (correct) => {
        if (correct) {
          allies.push(createAlly(unit));
          summonTimers[unit.id] = unit.summonCooldown;
          playSound('summon');
          showMessage(`${unit.formula}の召喚に成功しました。`);
        } else {
          showMessage(`${unit.formula}の召喚に失敗。エネルギーは消費されました。`, 3);
        }
      }
    });
    if (tutorialAllowed && activeQuiz) showTutorialQuizStep();
  }

  function requestUnlock(unit) {
    if (unit.unlockAfter && !unlocked.has(unit.unlockAfter)) {
      const previous = D.units.find((candidate) => candidate.id === unit.unlockAfter);
      showMessage(`${previous?.formula || '前のユニット'}を先に解放してください。`);
      return;
    }
    if (coins < unit.unlockCost) {
      showMessage(`解放挑戦には${unit.unlockCost}コイン必要です。`);
      return;
    }

    saveGame({ silent: true });
    coins -= unit.unlockCost;
    updateHud();
    renderUnitButtons();

    openQuiz(chooseQuestion(D.hardQuiz, true), {
      isHard: true,
      mode: 'hard',
      kicker: `解放試験｜COIN −${unit.unlockCost}`,
      title: `${unit.formula}を解放`,
      onComplete: (correct) => {
        if (correct) {
          unlocked.add(unit.id);
          showMessage(`${unit.formula}を解放しました。セーブデータに記録されます。`, 3.2);
          playSound('level');
        } else {
          const refund = refundFailedResearch(unit.unlockCost);
          showMessage(`解放失敗。${refund}コイン返金され、実質${unit.unlockCost - refund}コインの消費です。`, 3.5);
        }
      }
    });
  }

  function requestBattleSpeedChallenge() {
    if (paused || gameStatus !== 'playing') return;
    const cooldownMs = speedTrialCooldownRemainingMs();
    if (cooldownMs > 0) {
      showMessage(`倍速試験は再挑戦まであと${Math.ceil(cooldownMs / 1000)}秒です。`, 3.2);
      renderUpgradePanel();
      return;
    }
    if (battleSpeedRemaining > 0 && battleSpeedMultiplier >= 2.25) {
      showMessage(`現在2.25倍速です。残り${formatBattleSpeedTime(battleSpeedRemaining)}です。`, 3.2);
      return;
    }
    const targetSpeed = battleSpeedRemaining > 0 ? 2.25 : 1.5;
    openQuiz(chooseQuestion(D.hardQuiz, true), {
      isHard: true,
      mode: 'speed',
      kicker: '倍速試験｜専用難問',
      title: `正解で${targetSpeed.toFixed(2)}倍速`,
      onComplete: (correct) => {
        if (correct) {
          showMessage(`${targetSpeed.toFixed(2)}倍速で戦闘を再開します。`, 3.4);
        } else {
          showMessage('倍速試験は不合格でした。現在の戦闘速度を維持します。', 3.4);
        }
      }
    });
  }

  function requestEnergyCapacityUpgrade() {
    if (paused || gameStatus !== 'playing') return;
    if (energyCapacityLevel >= maxEnergyCapacityLevel()) {
      showMessage(`エナジー上限は最大Lv.${maxEnergyCapacityLevel()}です。`);
      return;
    }
    const cost = energyCapacityUpgradeCost();
    if (coins < cost) {
      showMessage(`上限強化試験には${cost}コイン必要です。`);
      return;
    }

    saveGame({ silent: true });
    coins -= cost;
    updateHud();
    renderUpgradePanel();

    openQuiz(chooseQuestion(D.hardQuiz, true), {
      isHard: true,
      mode: 'hard',
      kicker: `研究強化試験｜COIN −${cost}`,
      title: `エナジー上限 Lv.${energyCapacityLevel} → Lv.${energyCapacityLevel + 1}`,
      onComplete: (correct) => {
        if (correct) {
          const oldMax = currentMaxEnergy();
          energyCapacityLevel += 1;
          const newMax = currentMaxEnergy();
          energy = Math.min(newMax, energy + (newMax - oldMax));
          showMessage(`エナジー上限がLv.${energyCapacityLevel}へ上昇。最大${newMax}になりました。`, 3.5);
          playSound('level');
        } else {
          const refund = refundFailedResearch(cost);
          showMessage(`強化失敗。${refund}コイン返金され、実質${cost - refund}コインの消費です。`, 3.5);
        }
      }
    });
  }

  function requestUnitUpgrade(unit) {
    if (paused || gameStatus !== 'playing') return;
    if (!unlocked.has(unit.id)) {
      showMessage(`${unit.formula}を先に解放してください。`);
      return;
    }
    const currentLevel = unitUpgradeLevel(unit.id);
    if (currentLevel >= D.maxUpgradeLevel) {
      showMessage(`${unit.formula}は最大Lv.10です。`);
      return;
    }
    const cost = unitUpgradeCost(unit);
    if (coins < cost) {
      showMessage(`${unit.formula}の強化試験には${cost}コイン必要です。`);
      return;
    }

    saveGame({ silent: true });
    coins -= cost;
    updateHud();
    renderUpgradePanel();

    openQuiz(chooseQuestion(D.hardQuiz, true), {
      isHard: true,
      mode: 'hard',
      kicker: `ユニット強化試験｜COIN −${cost}`,
      title: `${unit.formula} Lv.${currentLevel} → Lv.${currentLevel + 1}`,
      onComplete: (correct) => {
        if (correct) {
          const oldStats = upgradedUnitStats(unit);
          unitUpgradeLevels[unit.id] = currentLevel + 1;
          const newStats = upgradedUnitStats(unit);
          updateExistingAlliesForUpgrade(unit.id, oldStats, newStats);
          showMessage(`${unit.formula}がLv.${currentLevel + 1}へ強化されました。`, 3.4);
          playSound('level');
        } else {
          const refund = refundFailedResearch(cost);
          showMessage(`強化失敗。${refund}コイン返金され、実質${cost - refund}コインの消費です。`, 3.5);
        }
      }
    });
  }

  function nextLaneY(serial) {
    return BASE.unitY + BASE.laneOffsets[serial % BASE.laneOffsets.length];
  }

  function createAlly(unit) {
    const serial = allySpawnSerial++;
    const stats = upgradedUnitStats(unit);
    return {
      kind: 'ally',
      typeId: unit.id,
      formula: unit.formula,
      name: unit.name,
      chemistryClass: unit.chemistryClass || 'neutral',
      chemistryLabel: unit.chemistryLabel || '相性なし',
      affinityTarget: unit.affinityTarget || null,
      liberationReaction: unit.liberationReaction || '',
      projectileLabel: unit.projectileLabel || '',
      damageType: unit.damageType || 'chemical',
      role: unit.role || '標準型',
      upgradeLevel: stats.upgradeLevel,
      x: BASE.allySpawnX,
      y: nextLaneY(serial),
      hp: Math.max(1, Math.round(stats.hp * researchProduct('hpMultiplier'))),
      maxHp: Math.max(1, Math.round(stats.hp * researchProduct('hpMultiplier'))),
      baseMaxHp: stats.hp,
      attack: stats.attack,
      baseAttack: stats.attack,
      speed: Number((stats.speed * researchProduct('speedMultiplier')).toFixed(2)),
      baseSpeed: stats.speed,
      range: stats.range,
      radius: stats.radius,
      attackInterval: Number((stats.attackInterval * researchProduct('attackIntervalMultiplier')).toFixed(2)),
      baseAttackInterval: stats.attackInterval,
      attackTimer: 0,
      stunTimer: 0,
      healer: Boolean(stats.healer),
      rangedAttack: Boolean(stats.rangedAttack),
      healAmount: Math.max(0, Math.round((stats.healAmount || 0) * researchProduct('healMultiplier'))),
      baseHealAmount: stats.healAmount || 0,
      healRange: stats.healRange || stats.range,
      splashRadius: Math.max(0, finiteNumber(stats.splashRadius, 0)),
      splashFactor: clamp(finiteNumber(stats.splashFactor, 0), 0, 1),
      flying: Boolean(stats.flying),
      antiAir: Boolean(stats.antiAir || stats.flying || /弓兵|速射|範囲/.test(stats.role || '')),
      flightHeight: Math.max(34, finiteNumber(stats.flightHeight, 46)),
      airVulnerability: Math.max(1, finiteNumber(stats.airVulnerability, 1.7)),
      baseDamageMultiplier: clamp(finiteNumber(stats.baseDamageMultiplier, 1), 0.1, 1),
      guard: Boolean(stats.guard),
      damageReduction: clamp(finiteNumber(stats.damageReduction, 0), 0, 0.8),
      firstStrikeMultiplier: Math.max(1, finiteNumber(stats.firstStrikeMultiplier, 1)),
      firstStrikeReady: finiteNumber(stats.firstStrikeMultiplier, 1) > 1,
      pushback: Math.max(0, finiteNumber(stats.pushback, 0)),
      attackFlash: 0,
      hitFlash: 0,
      multiHit: null,
      visualSerial: serial
    };
  }

  function createEnemy(enemy, waveIndex = currentWaveIndex) {
    const wave = D.waves[clamp(waveIndex, 0, D.waves.length - 1)];
    const serial = enemySpawnSerial++;
    const maxHp = Math.max(1, Math.round(enemy.hp * wave.hpScale));

    return {
      kind: 'enemy',
      typeId: enemy.id,
      formula: enemy.formula,
      name: enemy.name,
      chemistryClass: enemy.chemistryClass || 'neutral',
      chemistryLabel: enemy.chemistryLabel || '相性なし',
      affinityTarget: enemy.affinityTarget || null,
      liberationReaction: enemy.liberationReaction || '',
      projectileLabel: enemy.projectileLabel || '',
      damageType: enemy.damageType || 'chemical',
      x: BASE.enemySpawnX,
      y: nextLaneY(serial),
      hp: maxHp,
      maxHp,
      attack: Math.max(1, Math.round(enemy.attack * wave.attackScale)),
      speed: Number((enemy.speed * wave.speedScale).toFixed(2)),
      range: Math.max(1, Math.round(enemy.range + wave.rangeBonus)),
      radius: enemy.radius,
      attackInterval: Number((enemy.attackInterval * wave.intervalScale).toFixed(2)),
      attackTimer: 0,
      reward: Math.max(1, Math.round(enemy.reward * wave.rewardScale * currentCoinRewardMultiplier())),
      xpReward: Math.max(1, Math.round(enemy.xp * wave.rewardScale)),
      waveIndex,
      visualSerial: serial,
      moveVelocity: 0,
      boss: Boolean(enemy.boss),
      bossPhase: 1,
      phaseTwo: enemy.phaseTwo ? { ...enemy.phaseTwo } : null,
      role: enemy.role || '標準型',
      flying: Boolean(enemy.flying),
      antiAir: Boolean(enemy.antiAir || enemy.flying || /弓兵|速射|範囲/.test(enemy.role || '')),
      flightHeight: Math.max(34, finiteNumber(enemy.flightHeight, 46)),
      airVulnerability: Math.max(1, finiteNumber(enemy.airVulnerability, 1.7)),
      baseDamageMultiplier: clamp(finiteNumber(enemy.baseDamageMultiplier, 1), 0.1, 1),
      healer: Boolean(enemy.healer),
      healAmount: Math.max(0, Math.round(finiteNumber(enemy.healAmount, 0) * wave.attackScale)),
      healRange: Math.max(0, finiteNumber(enemy.healRange, enemy.range || 0)),
      splashRadius: Math.max(0, finiteNumber(enemy.splashRadius, 0)),
      splashFactor: clamp(finiteNumber(enemy.splashFactor, 0), 0, 1),
      guard: Boolean(enemy.guard),
      damageReduction: clamp(finiteNumber(enemy.damageReduction, 0), 0, 0.8),
      chemicalDamageReduction: clamp(finiteNumber(enemy.chemicalDamageReduction, 0), 0, 0.95),
      auBoss: Boolean(enemy.auBoss),
      firstStrikeMultiplier: Math.max(1, finiteNumber(enemy.firstStrikeMultiplier, 1)),
      firstStrikeReady: finiteNumber(enemy.firstStrikeMultiplier, 1) > 1,
      pushback: Math.max(0, finiteNumber(enemy.pushback, 0)),
      bossSummonInterval: Math.max(0, finiteNumber(enemy.bossSummonInterval, 0)),
      bossSummonTimer: Math.max(0, finiteNumber(enemy.bossSummonInterval, 0)),
      bossSummonWarning: Math.max(0, finiteNumber(enemy.bossSummonWarning, 2)),
      bossSummonPending: false,
      bossSummonPendingTimer: 0,
      bossSummonCount: Math.max(0, Math.floor(finiteNumber(enemy.bossSummonCount, 0))),
      bossSummonPool: Array.isArray(enemy.bossSummonPool) ? [...enemy.bossSummonPool] : [],
      goldFoilInterval: Math.max(0, finiteNumber(enemy.goldFoilInterval, 0)),
      goldFoilTimer: Math.max(0, finiteNumber(enemy.goldFoilInterval, 0)),
      goldFoilWarning: Math.max(.5, finiteNumber(enemy.goldFoilWarning, 1.7)),
      goldFoilPendingTimer: 0,
      goldFoilDamage: Math.max(0, finiteNumber(enemy.goldFoilDamage, 0)),
      goldFoilPushback: Math.max(0, finiteNumber(enemy.goldFoilPushback, 0)),
      goldCrushWarning: Math.max(.3, finiteNumber(enemy.goldCrushWarning, .65)),
      goldCrushPendingTimer: 0,
      goldCrushTargetKey: '',
      goldCrushSplashRadius: Math.max(0, finiteNumber(enemy.goldCrushSplashRadius, 0)),
      goldCrushSplashFactor: clamp(finiteNumber(enemy.goldCrushSplashFactor, 0), 0, 1),
      goldCrushPushback: Math.max(0, finiteNumber(enemy.goldCrushPushback, 0)),
      stage10Hidden: Boolean(enemy.auBoss),
      stage10Protected: Boolean(enemy.auBoss),
      wipeAlliesOnArrival: Boolean(enemy.wipeAlliesOnArrival),
      ambushIntroCompleted: !enemy.wipeAlliesOnArrival,
      ambushIntroTitle: String(enemy.ambushIntroTitle || '戦線崩壊'),
      ambushIntroText: String(enemy.ambushIntroText || '味方ユニット全消失'),
      recommendedStoredEnergy: Math.max(0, finiteNumber(enemy.recommendedStoredEnergy, 0)),
      attackFlash: 0,
      hitFlash: 0
    };
  }

  function stage10AquaDefinition() {
    return currentStageDefinition()?.aquaRegia || D.stage10?.aquaRegia || null;
  }

  function aquaRegiaStats() {
    const definition = stage10AquaDefinition();
    if (!definition) return null;
    const levelIndex = clamp(aquaRegiaLevel - 1, 0, 9);
    return {
      ...definition,
      level: levelIndex + 1,
      hp: Math.round(definition.hp * (1 + finiteNumber(definition.hpGrowth, .13) * levelIndex)),
      attack: Math.round(definition.attack * (1 + finiteNumber(definition.attackGrowth, .18) * levelIndex))
    };
  }

  function createAquaRegiaAlly(hpRatio = 1) {
    const stats = aquaRegiaStats();
    if (!stats) return null;
    const serial = allySpawnSerial++;
    const maxHp = Math.max(1, stats.hp);
    return {
      kind: 'ally', typeId: stats.id, formula: stats.formula, name: stats.name,
      chemistryClass: stats.chemistryClass, chemistryLabel: stats.chemistryLabel,
      affinityTarget: null, liberationReaction: '', projectileLabel: stats.projectileLabel,
      damageType: 'aqua_regia', role: stats.role, upgradeLevel: stats.level,
      x: BASE.allySpawnX + 18, y: nextLaneY(serial), hp: Math.max(1, Math.round(maxHp * clamp(hpRatio, .01, 1))), maxHp,
      baseMaxHp: maxHp, attack: stats.attack, baseAttack: stats.attack, speed: stats.speed, baseSpeed: stats.speed,
      range: stats.range, radius: stats.radius, attackInterval: stats.attackInterval, baseAttackInterval: stats.attackInterval,
      attackTimer: 0, stunTimer: 0, healer: false, rangedAttack: false, healAmount: 0, baseHealAmount: 0,
      healRange: stats.range, splashRadius: 0, splashFactor: 0, flying: false, antiAir: false, flightHeight: 46,
      airVulnerability: 1.7, baseDamageMultiplier: 1, guard: false, damageReduction: 0,
      firstStrikeMultiplier: 1, firstStrikeReady: false, pushback: 0, attackFlash: 0, hitFlash: 0,
      aquaRegia: true, hitCount: Math.max(1, Math.floor(finiteNumber(stats.hitCount, 6))),
      hitInterval: Math.max(.06, finiteNumber(stats.hitInterval, .14)), multiHit: null, visualSerial: serial,
      motionTrail: [], visualPhase: 0
    };
  }

  function aquaRegiaExists() {
    return allies.some((ally) => ally.hp > 0 && ally.aquaRegia);
  }

  function sameStringList(left, right) {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  function stage10PreparationCandidates() {
    if (!isStage10() || !aquaRegiaUnlocked || aquaRegiaExists() || stage10State?.preparation) return [];
    const definition = stage10AquaDefinition();
    const radius = Math.max(40, finiteNumber(definition?.preparationRadius, 90));
    const nitricUnits = allies.filter((ally) => ally.hp > 0 && ally.typeId === 'nitricAcidAlly5');
    const hydrochloricUnits = allies.filter((ally) => ally.hp > 0 && ally.typeId === 'hydrochloricAcidAlly6');
    let best = [];
    let bestScore = Infinity;
    for (const nitric of nitricUnits) {
      const nearby = hydrochloricUnits
        .map((unit) => ({ unit, distance: Math.hypot(unit.x - nitric.x, unit.y - nitric.y) }))
        .filter(({ distance }) => distance <= radius)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 3);
      if (nearby.length < 3) continue;
      const score = nearby.reduce((sum, item) => sum + item.distance, 0);
      if (score < bestScore) {
        best = [nitric, ...nearby.map((item) => item.unit)];
        bestScore = score;
      }
    }
    return best;
  }

  function updateStage10PreparationCandidates(dt) {
    if (!isStage10() || !stage10State || stage10State.preparation) return;
    const candidates = stage10PreparationCandidates();
    const keys = candidates.map(entityBattleKey);
    if (sameStringList(keys, stage10State.candidateKeys)) stage10State.stableSeconds += dt;
    else {
      stage10State.candidateKeys = keys;
      stage10State.stableSeconds = 0;
    }
  }

  function stage10HighlightedKeys() {
    if (!isStage10() || !stage10State) return new Set();
    const preparationKeys = stage10State.preparation?.ingredientKeys || [];
    return new Set(preparationKeys.length ? preparationKeys : stage10State.candidateKeys);
  }

  function showStage10Cinematic(kicker, title, body, note = '') {
    if (!$('stage10Cinematic')) return;
    $('stage10CinematicKicker').textContent = kicker;
    $('stage10CinematicTitle').textContent = title;
    $('stage10CinematicText').textContent = body;
    $('stage10CinematicNote').textContent = note;
    $('stage10Cinematic').dataset.kind = kicker.startsWith('AQUA REGIA') ? 'aqua' : kicker.includes('REACTION COMPLETE') ? 'victory' : 'gold';
    $('stage10Cinematic').hidden = false;
  }

  function hideStage10Cinematic() {
    if ($('stage10Cinematic')) {
      $('stage10Cinematic').hidden = true;
      delete $('stage10Cinematic').dataset.kind;
    }
  }

  function updateAquaRegiaUi() {
    const panel = $('aquaRegiaPanel');
    if (!panel) return;
    panel.hidden = !isStage10();
    if (!isStage10()) return;
    const definition = stage10AquaDefinition();
    const nitricUnlocked = unlocked?.has('nitricAcidAlly5');
    const hydrochloricUnlocked = unlocked?.has('hydrochloricAcidAlly6');
    const materialReady = Boolean(nitricUnlocked && hydrochloricUnlocked);
    const candidates = stage10PreparationCandidates();
    const nitricCount = candidates.length === 4 ? 1 : Math.min(1, allies.filter((ally) => ally.hp > 0 && ally.typeId === 'nitricAcidAlly5').length);
    const hydrochloricCount = candidates.length === 4 ? 3 : Math.min(3, allies.filter((ally) => ally.hp > 0 && ally.typeId === 'hydrochloricAcidAlly6').length);
    const stableRequired = Math.max(.5, finiteNumber(definition?.stableSeconds, 1));
    const stableReady = stage10State?.candidateKeys?.length === 4 && stage10State.stableSeconds >= stableRequired;
    $('aquaRegiaLevel').textContent = `Lv.${aquaRegiaLevel} / 10`;
    $('aquaNitricCount').textContent = `HNO₃ ${nitricCount}/1`;
    $('aquaHydrochloricCount').textContent = `HCl ${hydrochloricCount}/3`;
    $('aquaNitricCount').classList.toggle('ready', nitricCount >= 1);
    $('aquaHydrochloricCount').classList.toggle('ready', hydrochloricCount >= 3);
    $('aquaStableState').textContent = stableReady ? '調製条件が安定しました' : candidates.length === 4 ? `安定判定 ${Math.min(stableRequired, stage10State.stableSeconds).toFixed(1)} / ${stableRequired.toFixed(1)}秒` : 'HNO₃の近くにHClを3体配置';
    $('aquaStableState').classList.toggle('ready', stableReady);
    $('aquaRegiaUnlockBtn').hidden = aquaRegiaUnlocked;
    $('aquaRegiaUnlockBtn').disabled = !materialReady || coins < finiteNumber(definition?.unlockCost, 220) || paused || gameStatus !== 'playing';
    $('aquaRegiaUnlockBtn').textContent = materialReady ? `${definition.unlockCost} COINで王水調製を解放` : 'HNO₃とHClを先に解放';
    const upgradeCosts = Array.isArray(definition?.upgradeCosts) ? definition.upgradeCosts : [];
    const upgradeCost = aquaRegiaLevel < 10 ? upgradeCosts[aquaRegiaLevel - 1] : null;
    $('aquaRegiaUpgradeBtn').hidden = !aquaRegiaUnlocked;
    $('aquaRegiaUpgradeBtn').disabled = upgradeCost == null || coins < upgradeCost || paused || gameStatus !== 'playing';
    $('aquaRegiaUpgradeBtn').textContent = upgradeCost == null ? '王水 Lv.10・最大強化' : `${upgradeCost} COINでLv.${aquaRegiaLevel + 1}へ強化`;
    $('aquaRegiaPrepareBtn').hidden = !aquaRegiaUnlocked;
    $('aquaRegiaPrepareBtn').disabled = !stableReady || aquaRegiaExists() || Boolean(stage10State?.preparation) || paused || gameStatus !== 'playing';
    panel.classList.toggle('is-ready', stableReady && !aquaRegiaExists());
    $('aquaRegiaStatus').textContent = !materialReady ? 'HNO₃とHClの両方を解放してください。' : !aquaRegiaUnlocked ? '両材料を解放済みです。コインで王水調製を恒久解放できます。' : aquaRegiaExists() ? '王水は同時に1体までです。' : stableReady ? '対象4体を固定して調製できます。追加Energyは消費しません。' : 'HNO₃ 1体を中心に、近距離へHCl 3体を約1秒維持してください。';
  }

  function unlockAquaRegia() {
    if (!isStage10() || aquaRegiaUnlocked) return;
    const definition = stage10AquaDefinition();
    const cost = Math.max(0, finiteNumber(definition?.unlockCost, 220));
    if (!unlocked.has('nitricAcidAlly5') || !unlocked.has('hydrochloricAcidAlly6') || coins < cost) return;
    coins -= cost;
    aquaRegiaUnlocked = true;
    showMessage('王水調製を恒久解放しました。王水はStage 10専用・独立Lv.1です。', 4.2);
    playSound('level');
    updateAquaRegiaUi();
    saveGame({ silent: true });
  }

  function upgradeAquaRegia() {
    if (!isStage10() || !aquaRegiaUnlocked || aquaRegiaLevel >= 10) return;
    const costs = stage10AquaDefinition()?.upgradeCosts || [];
    const cost = Math.max(0, finiteNumber(costs[aquaRegiaLevel - 1], Infinity));
    if (!Number.isFinite(cost) || coins < cost) return;
    coins -= cost;
    aquaRegiaLevel += 1;
    showMessage(`王水がLv.${aquaRegiaLevel}へ強化されました。材料ユニットのLvとは独立しています。`, 3.8);
    playSound('level');
    updateAquaRegiaUi();
    saveGame({ silent: true });
  }

  function beginAquaRegiaPreparation() {
    if (!isStage10() || !aquaRegiaUnlocked || aquaRegiaExists() || stage10State?.preparation) return;
    const candidates = stage10PreparationCandidates();
    const required = Math.max(.5, finiteNumber(stage10AquaDefinition()?.stableSeconds, 1));
    if (candidates.length !== 4 || stage10State.stableSeconds < required) return;
    const hpRatio = candidates.reduce((sum, entity) => sum + entity.hp / Math.max(1, entity.maxHp), 0) / 4;
    stage10State.preparation = { phase: 'animating', timer: 2.05, ingredientKeys: candidates.map(entityBattleKey), hpRatio, created: false };
    setBgmDuckFactor(.22);
    showStage10Cinematic('AQUA REGIA PREPARATION', 'HNO₃ 1/1 ＋ HCl 3/3', '二系統粒子を中心へ収束', '体積比 1：3｜抽象化された学習表現です。実際に混ぜたり試したりしないでください。');
    saveGame({ silent: true });
    updateAquaRegiaUi();
  }

  function commitAquaRegiaPreparation() {
    const preparation = stage10State?.preparation;
    if (!preparation || preparation.created) return;
    const ingredients = preparation.ingredientKeys.map(findBattleEntityByKey).filter(Boolean);
    if (preparation.phase !== 'committed' && ingredients.length !== 4) {
      stage10State.preparation = null;
      stage10State.candidateKeys = [];
      stage10State.stableSeconds = 0;
      setBgmDuckFactor(1);
      hideStage10Cinematic();
      showMessage('材料の状態が変わったため、王水調製を安全に中止しました。', 3.5);
      return;
    }
    preparation.phase = 'committed';
    const ingredientKeys = new Set(preparation.ingredientKeys);
    allies = allies.filter((ally) => !ingredientKeys.has(entityBattleKey(ally)));
    if (!aquaRegiaExists()) {
      const aqua = createAquaRegiaAlly(preparation.hpRatio);
      if (aqua) allies.push(aqua);
    }
    preparation.created = true;
    stage10State.preparation = null;
    stage10State.preparationSuccessTimer = 1.05;
    stage10State.candidateKeys = [];
    stage10State.stableSeconds = 0;
    setBgmDuckFactor(1);
    showStage10Cinematic('AQUA REGIA', '王水', '調製成功', '専用ユニットが戦場へ加わりました。');
    showMessage('調製成功｜AQUA REGIA｜王水1体を生成しました。', 4.2);
    playSound('aqua');
    saveGame({ silent: true });
    updateAquaRegiaUi();
  }

  function beginStage10AuFormation(enemy) {
    if (!isStage10() || !enemy?.auBoss || !stage10State || stage10State.phase !== 'normal') return;
    stage10State.phase = 'forming';
    stage10State.phaseTimer = 4.4;
    stage10State.formationElapsed = 0;
    enemy.stage10Hidden = true;
    enemy.stage10Protected = true;
    projectiles = projectiles.filter((projectile) => !(projectile.ownerKind === 'ally' && projectile.effectKind !== 'heal'));
    const fallbackX = BASE.allyX + (BASE.enemyX - BASE.allyX) * .43;
    stage10State.formationPushX = fallbackX;
    setBgmDuckFactor(.12);
    showStage10Cinematic('GOLD PARTICLE ASSEMBLY', '79 Au', '金｜高い耐食性をもつ貴金属', '味方のHP・強化状態・内部状態を維持して戦線を再配置しています。');
    saveGame({ silent: true });
  }

  function beginAquaAuContact() {
    if (!isStage10() || aquaAuContactComplete || stage10State.contactStarted) return false;
    stage10State.contactStarted = true;
    stage10State.contactTimer = .7;
    setBgmDuckFactor(.04);
    showStage10Cinematic('AQUA REGIA VS Au', '金の溶解開始', '酸化＋塩化物錯体形成｜Au → [AuCl₄]⁻', '簡略化した学習表現です。実際の反応はより複雑で条件に依存します。');
    saveGame({ silent: true });
    return true;
  }

  function startStage10VictorySequence() {
    if (!isStage10() || stage10State?.phase === 'victory') return;
    completeTimeAttackClock();
    stage10State.phase = 'victory';
    stage10State.phaseTimer = 1.6;
    setBgmDuckFactor(.35);
    showStage10Cinematic('Au REACTION COMPLETE', 'Au撃破', 'Stage 10「黄金王・Au反応区」クリア', '敵拠点の破壊は必要ありません。');
    saveGame({ silent: true });
  }

  function stage10CombatFrozen() {
    if (!isStage10() || !stage10State) return false;
    return Boolean(stage10State.preparation || stage10State.preparationSuccessTimer > 0 || (stage10State.contactStarted && !stage10State.contactComplete) || ['forming', 'protected', 'victory'].includes(stage10State.phase));
  }

  function updateStage10Sequence(dt) {
    if (!isStage10() || !stage10State) return false;
    if (stage10State.preparation) {
      stage10State.preparation.timer = Math.max(0, stage10State.preparation.timer - dt);
      const timer = stage10State.preparation.timer;
      if (timer > 1.35) showStage10Cinematic('AQUA REGIA PREPARATION', 'HNO₃ 1/1 ＋ HCl 3/3', '4体の光線を中心へ収束', '体積比 1：3｜抽象化された学習表現です。実際に混ぜたり試したりしないでください。');
      else if (timer > .65) showStage10Cinematic('AQUA REGIA PREPARATION', '1：3', '二系統粒子と複層リングが混合', '実用的な量・器具・投入順・温度・保存方法は示していません。');
      else showStage10Cinematic('AQUA REGIA PREPARATION', 'AQUA REGIA', '拡大 → 収束', '簡略化された安全な学習演出です。');
      if (stage10State.preparation.timer <= 0) commitAquaRegiaPreparation();
      return true;
    }
    if (stage10State.preparationSuccessTimer > 0) {
      stage10State.preparationSuccessTimer = Math.max(0, stage10State.preparationSuccessTimer - dt);
      if (stage10State.preparationSuccessTimer <= 0) hideStage10Cinematic();
      return true;
    }
    if (stage10State.contactStarted && !stage10State.contactComplete) {
      stage10State.contactTimer = Math.max(0, stage10State.contactTimer - dt);
      if (stage10State.contactTimer <= 0) {
        stage10State.contactComplete = true;
        aquaAuContactComplete = true;
        setBgmDuckFactor(1);
        hideStage10Cinematic();
        saveGame({ silent: true });
      }
      return true;
    }
    if (stage10State.phase === 'forming') {
      stage10State.formationElapsed += dt;
      stage10State.phaseTimer = Math.max(0, stage10State.phaseTimer - dt);
      const fallbackX = finiteNumber(stage10State.formationPushX, BASE.allyX + (BASE.enemyX - BASE.allyX) * .43);
      for (const ally of allies) {
        const targetX = Math.min(ally.x, fallbackX - ally.radius);
        ally.x += (targetX - ally.x) * Math.min(1, dt * 4.5);
      }
      const elapsed = stage10State.formationElapsed;
      if (elapsed < 1.05) showStage10Cinematic('GOLD PARTICLE ASSEMBLY', '79', '低速金色波動｜遠方粒子収束', '味方のHP・強化・内部状態を維持したまま滑らかに再配置しています。');
      else if (elapsed < 2.05) showStage10Cinematic('GOLD PARTICLE ASSEMBLY', 'Au', '原子番号79｜金', '金箔粒子が中心へ集まり、質量を形成します。');
      else if (elapsed < 3.05) showStage10Cinematic('GOLD PARTICLE ASSEMBLY', '金', '高い耐食性をもつ貴金属', '形成直前に空間が静止します。');
      else showStage10Cinematic('GOLD PARTICLE ASSEMBLY', '黄金王・Au', '大波動｜段階形成完了', '短く弱い振動のあと、専用戦闘曲へ切り替わります。');
      if (stage10State.phaseTimer <= 0) {
        stage10State.phase = 'protected';
        stage10State.phaseTimer = 3;
        const au = enemies.find((enemy) => enemy.auBoss && enemy.hp > 0);
        if (au) au.stage10Hidden = false;
        setBgmDuckFactor(1);
        syncBgmTrack({ restart: true });
        showStage10Cinematic('LOW REACTIVITY', '黄金王・Au', '形成完了｜約3秒の相互攻撃停止', '通常の化学攻撃を約80%軽減。物理攻撃と王水は軽減を迂回します。');
        saveGame({ silent: true });
      }
      return true;
    }
    if (stage10State.phase === 'protected') {
      stage10State.phaseTimer = Math.max(0, stage10State.phaseTimer - dt);
      if (stage10State.phaseTimer <= 0) {
        stage10State.phase = 'combat';
        for (const enemy of enemies) if (enemy.auBoss) enemy.stage10Protected = false;
        hideStage10Cinematic();
        setBgmDuckFactor(1);
        syncBgmTrack();
        showMessage('V16 loop開始｜Au戦闘再開', 3.2);
        saveGame({ silent: true });
      }
      return true;
    }
    if (stage10State.phase === 'victory') {
      stage10State.phaseTimer = Math.max(0, stage10State.phaseTimer - dt);
      if (stage10State.phaseTimer <= 0) {
        hideStage10Cinematic();
        setBgmDuckFactor(1);
        finishGame(true);
      }
      return true;
    }
    return false;
  }

  function restoreStage10PresentationAfterLoad() {
    if (!isStage10() || !stage10State || gameStatus !== 'playing') {
      setBgmDuckFactor(1);
      hideStage10Cinematic();
      return;
    }
    if (['forming', 'protected', 'combat'].includes(stage10State.phase) && !enemies.some((enemy) => enemy.auBoss && enemy.hp > 0)) {
      const definition = D.enemies.find((enemy) => enemy.auBoss);
      if (definition) enemies.push(createEnemy(definition, D.waves.length - 1));
    }
    const au = enemies.find((enemy) => enemy.auBoss && enemy.hp > 0);
    if (au) {
      au.stage10Hidden = stage10State.phase === 'forming';
      au.stage10Protected = ['forming', 'protected'].includes(stage10State.phase);
    }
    if (stage10State.preparation) {
      setBgmDuckFactor(.22);
      showStage10Cinematic('AQUA REGIA PREPARATION', 'HNO₃ 1/1 ＋ HCl 3/3', '二系統粒子を中心へ収束', '体積比 1：3｜抽象化された学習表現です。実際に混ぜたり試したりしないでください。');
    } else if (stage10State.preparationSuccessTimer > 0) {
      setBgmDuckFactor(1);
      showStage10Cinematic('AQUA REGIA', '王水', '調製成功', '専用ユニットが戦場へ加わりました。');
    } else if (stage10State.contactStarted && !stage10State.contactComplete) {
      setBgmDuckFactor(.04);
      showStage10Cinematic('AQUA REGIA VS Au', '金の溶解開始', '酸化＋塩化物錯体形成｜Au → [AuCl₄]⁻', '簡略化した学習表現です。実際の反応はより複雑で条件に依存します。');
    } else if (stage10State.phase === 'forming') {
      setBgmDuckFactor(.12);
      showStage10Cinematic('GOLD PARTICLE ASSEMBLY', '79 Au', '金｜高い耐食性をもつ貴金属', '味方のHP・強化状態・内部状態は維持されています。');
    } else if (stage10State.phase === 'protected') {
      setBgmDuckFactor(1);
      showStage10Cinematic('LOW REACTIVITY', '黄金王・Au', '形成完了｜約3秒の相互攻撃停止', '通常の化学攻撃を約80%軽減。物理攻撃と王水は軽減を迂回します。');
    } else if (stage10State.phase === 'victory') {
      setBgmDuckFactor(.35);
      showStage10Cinematic('Au REACTION COMPLETE', 'Au撃破', 'Stage 10「黄金王・Au反応区」クリア', '敵拠点の破壊は必要ありません。');
    } else {
      setBgmDuckFactor(1);
      hideStage10Cinematic();
    }
    syncBgmTrack();
  }


  function transformBossToSecondPhase(enemy, { announce = true } = {}) {
    if (!enemy?.phaseTwo || enemy.bossPhase >= 2) return false;
    const phase = enemy.phaseTwo;
    enemy.bossPhase = 2;
    enemy.formula = phase.formula || enemy.formula;
    enemy.name = phase.name || enemy.name;
    enemy.chemistryClass = phase.chemistryClass || enemy.chemistryClass;
    enemy.chemistryLabel = phase.chemistryLabel || enemy.chemistryLabel;
    enemy.affinityTarget = phase.affinityTarget || null;
    enemy.liberationReaction = phase.liberationReaction || '';
    enemy.projectileLabel = phase.projectileLabel || phase.formula || enemy.formula;
    enemy.role = phase.role || enemy.role;
    enemy.flying = Boolean(phase.flying);
    enemy.antiAir = Boolean(phase.antiAir || phase.flying || /弓兵|速射|範囲/.test(phase.role || ''));
    enemy.flightHeight = Math.max(34, finiteNumber(phase.flightHeight, enemy.flightHeight || 46));
    enemy.airVulnerability = Math.max(1, finiteNumber(phase.airVulnerability, enemy.airVulnerability || 1.7));
    enemy.baseDamageMultiplier = clamp(finiteNumber(phase.baseDamageMultiplier, enemy.baseDamageMultiplier || 1), 0.1, 1);
    enemy.guard = Boolean(phase.guard);
    enemy.damageReduction = clamp(finiteNumber(phase.damageReduction, 0), 0, 0.8);
    enemy.firstStrikeMultiplier = Math.max(1, finiteNumber(phase.firstStrikeMultiplier, 1));
    enemy.firstStrikeReady = enemy.firstStrikeMultiplier > 1;
    enemy.pushback = Math.max(0, finiteNumber(phase.pushback, 0));
    const wave = D.waves[clamp(enemy.waveIndex, 0, D.waves.length - 1)];
    enemy.maxHp = Math.max(1, Math.round(finiteNumber(phase.hp, enemy.maxHp) * finiteNumber(wave?.hpScale, 1)));
    enemy.hp = enemy.maxHp;
    enemy.attack = Math.max(1, Math.round(finiteNumber(phase.attack, enemy.attack) * finiteNumber(wave?.attackScale, 1)));
    enemy.speed = Number((finiteNumber(phase.speed, enemy.speed) * finiteNumber(wave?.speedScale, 1)).toFixed(2));
    enemy.range = Math.max(1, Math.round(finiteNumber(phase.range, enemy.range) + finiteNumber(wave?.rangeBonus, 0)));
    enemy.radius = Math.max(1, finiteNumber(phase.radius, enemy.radius));
    enemy.attackInterval = Number((finiteNumber(phase.attackInterval, enemy.attackInterval) * finiteNumber(wave?.intervalScale, 1)).toFixed(2));
    enemy.attackTimer = 1.2;
    enemy.reward = Math.max(1, Math.round(finiteNumber(phase.reward, enemy.reward) * finiteNumber(wave?.rewardScale, 1) * currentCoinRewardMultiplier()));
    enemy.xpReward = Math.max(1, Math.round(finiteNumber(phase.xp, enemy.xpReward) * finiteNumber(wave?.rewardScale, 1)));
    if (announce) {
      focusBattleEntity(enemy, 10, true);
      combatEffects.push({ x: enemy.x, y: entityVisualY(enemy) - enemy.radius - 30, text: '第二形態へ変化！', color: '#f3a8ff', kind: 'transform', life: 2.0, maxLife: 2.0, particles: lowPowerMode ? [] : Array.from({length:18},(_,i)=>({angle:Math.PI*2*i/18,speed:28+(i%5)*8})) });
      showMessage(`⚠ ${phase.transformText || `${enemy.formula}へ変化`}｜属性：${enemy.chemistryLabel}`, 5.5);
      playSound('transform');
      $('waveBannerTitle').textContent = 'BOSS PHASE 2';
      $('waveBannerSub').textContent = `${enemy.chemistryLabel} ${enemy.formula}｜第二形態`;
      $('waveBanner').hidden = false;
      waveBannerTimer = 5.2;
    }
    return true;
  }

  function spawnNextWaveEnemy() {
    const wave = currentWave();
    if (!wave || nextWaveEnemyIndex >= wave.enemies.length) return;

    const enemyId = wave.enemies[nextWaveEnemyIndex];
    const definition = D.enemies.find((enemy) => enemy.id === enemyId);
    if (!definition) {
      console.warn(`Unknown enemy id: ${enemyId}`);
      nextWaveEnemyIndex += 1;
      return;
    }

    const spawnedEnemy = createEnemy(definition, currentWaveIndex);
    enemies.push(spawnedEnemy);
    if (spawnedEnemy.boss) {
      if (spawnedEnemy.auBoss && isStage10()) {
        beginStage10AuFormation(spawnedEnemy);
        nextWaveEnemyIndex += 1;
        wavePhase = 'fighting';
        return;
      }
      focusBattleEntity(spawnedEnemy, 8, true);
      if (spawnedEnemy.wipeAlliesOnArrival) {
        beginBossAnnihilationSequence(spawnedEnemy, definition);
      } else {
        showMessage(`⚠ BOSS出現：${definition.bossIntro || `${definition.chemistryLabel} ${definition.formula} ${definition.name}`}`, 4.5);
        triggerBossArrivalEffect(spawnedEnemy, definition);
        $('waveBannerTitle').textContent = definition.phaseTwo ? 'TWO-PHASE BOSS' : 'BOSS WAVE';
        $('waveBannerSub').textContent = `${definition.chemistryLabel} ${definition.formula}｜${currentStageDefinition().bossHint}`;
        $('waveBanner').hidden = false;
        waveBannerTimer = 4.5;
      }
    }
    nextWaveEnemyIndex += 1;

    if (nextWaveEnemyIndex >= wave.enemies.length) {
      wavePhase = isFinalWave() ? 'fighting' : 'waiting';
      if (isFinalWave()) {
        showMessage('最終ウェーブの全敵が出現。敵拠点のシールドが解除されました。', 4);
      }
    } else {
      waveSpawnTimer = wave.spawnInterval;
    }
  }

  function spawnEndlessGroup() {
    const finalWave = D.waves[D.waves.length - 1];
    const pool = finalWave?.enemies?.length ? finalWave.enemies : D.enemies.map((enemy) => enemy.id);
    const count = Math.min(4 + Math.floor(endlessWaveNumber / 2), 10);
    for (let index = 0; index < count; index += 1) {
      if (enemies.length >= D.maxEnemiesOnField) break;
      const enemyId = pool[Math.floor(Math.random() * pool.length)];
      const definition = D.enemies.find((enemy) => enemy.id === enemyId);
      if (definition) enemies.push(createEnemy(definition, D.waves.length - 1));
    }
    endlessWaveNumber += 1;
    showMessage(`継続プレイ 第${endlessWaveNumber}群：敵${count}体が接近中。`, 3.2);
  }

  function updateEndlessMode(dt) {
    endlessWaveTimer -= dt;
    if (endlessWaveTimer <= 0) {
      endlessWaveTimer += 30;
      spawnEndlessGroup();
    }
    if (enemyBaseHp <= 0) enemyBaseHp = D.enemyBaseHp;
  }

  function updateWaveSystem(dt) {
    if (waveBannerTimer > 0) {
      waveBannerTimer = Math.max(0, waveBannerTimer - dt);
      if (waveBannerTimer <= 0) hideWaveBanner();
    }

    const targetIndex = gameTime >= currentFinalWaveStartSeconds()
      ? D.waves.length - 1
      : Math.min(D.waves.length - 2, Math.floor(gameTime / currentWaveIntervalSeconds()));
    while (currentWaveIndex < targetIndex) beginWave(currentWaveIndex + 1);

    const wave = currentWave();
    if (!wave) return;
    if (wavePhase === 'spawning') {
      waveSpawnTimer -= dt;
      if (waveSpawnTimer <= 0 && nextWaveEnemyIndex < wave.enemies.length) {
        if (enemies.length >= D.maxEnemiesOnField) waveSpawnTimer = 0.5;
        else spawnNextWaveEnemy();
      }
      if (nextWaveEnemyIndex >= wave.enemies.length) wavePhase = isFinalWave() ? 'fighting' : 'waiting';
    }

    if (!isStage10() && isFinalWave() && nextWaveEnemyIndex >= wave.enemies.length && enemies.length === 0) {
      wavePhase = 'finalBase';
      if (!finalBaseMessageShown) {
        showMessage('最終ウェーブ撃破。敵拠点を破壊してください。', 4);
        finalBaseMessageShown = true;
      }
    }
  }

  function canAttackTarget(attacker, defender) {
    if (!attacker || !defender || defender.hp <= 0 || attacker.stage10Hidden || defender.stage10Hidden || defender.stage10Protected) return false;
    if (!defender.flying) return true;
    return Boolean(attacker.boss || attacker.flying || attacker.antiAir);
  }

  function nearestEnemyFor(ally) {
    let nearest = null;
    let nearestDistance = Infinity;
    const candidates = [];
    for (const enemy of enemies) {
      if (!canAttackTarget(ally, enemy)) continue;
      const distance = enemy.x - ally.x;
      if (distance < -8) continue;
      candidates.push({ enemy, distance });
      if (distance < nearestDistance) { nearest = enemy; nearestDistance = distance; }
    }
    const guardCandidate = candidates
      .filter(({ enemy, distance }) => enemy.guard && distance <= nearestDistance + 90)
      .sort((a, b) => a.distance - b.distance)[0];
    return guardCandidate ? { target: guardCandidate.enemy, distance: guardCandidate.distance } : { target: nearest, distance: nearestDistance };
  }

  function nearestAllyFor(enemy) {
    let nearest = null;
    let nearestDistance = Infinity;
    const candidates = [];
    for (const ally of allies) {
      if (!canAttackTarget(enemy, ally)) continue;
      const distance = enemy.x - ally.x;
      if (distance < -8) continue;
      candidates.push({ ally, distance });
      if (distance < nearestDistance) { nearest = ally; nearestDistance = distance; }
    }
    const guardCandidate = candidates
      .filter(({ ally, distance }) => ally.guard && distance <= nearestDistance + 90)
      .sort((a, b) => a.distance - b.distance)[0];
    return guardCandidate ? { target: guardCandidate.ally, distance: guardCandidate.distance } : { target: nearest, distance: nearestDistance };
  }

  function chemistryFamily(chemistryClass) {
    if (chemistryClass === 'strong_acid' || chemistryClass === 'weak_acid' || chemistryClass === 'acidic_oxide') return 'acid';
    if (chemistryClass === 'strong_base' || chemistryClass === 'weak_base') return 'base';
    return 'neutral';
  }

  function affinityMultiplier(attacker, defender) {
    if (attacker?.kind !== 'ally') return 1;
    const attackClass = attacker?.chemistryClass || 'neutral';
    const target = defender?.affinityTarget || null;
    if (attackClass === 'strong_acid' && target === 'weak_acid_conjugate_base') return 1.4;
    if (attackClass === 'strong_base' && target === 'weak_base_conjugate_acid') return 1.4;
    return 1;
  }


  function affinityEvent(attacker, defender) {
    if (attacker?.kind !== 'ally') return null;
    const a = attacker?.chemistryClass || 'neutral';
    const d = defender?.chemistryClass || 'neutral';
    const target = defender?.affinityTarget || null;
    if (a === 'strong_acid' && target === 'weak_acid_conjugate_base') {
      return { text: '弱酸の遊離', reaction: defender?.liberationReaction || '', color: '#ffb06e', kind: 'liberation' };
    }
    if (a === 'strong_base' && target === 'weak_base_conjugate_acid') {
      return { text: '弱塩基の遊離', reaction: defender?.liberationReaction || '', color: '#79e7ff', kind: 'liberation' };
    }
    const af = chemistryFamily(a), df = chemistryFamily(d);
    const hasLiberationTarget = Boolean(attacker?.affinityTarget || defender?.affinityTarget);
    if (!hasLiberationTarget && ((af === 'acid' && df === 'base') || (af === 'base' && df === 'acid'))) {
      const oxideReaction = a === 'acidic_oxide' || d === 'acidic_oxide';
      return { text: oxideReaction ? '酸塩基反応' : '中和', reaction: '', color: '#f4fbff', kind: 'neutralize' };
    }
    return null;
  }

  function addCombatEffect(attacker, defender, damage) {
    const event = affinityEvent(attacker, defender);
    if (!event) return;
    const liberation = event.kind === 'liberation';
    combatEffects.push({
      x: defender.x,
      y: defender.y - defender.radius - 18,
      text: liberation ? `${event.text} ×1.4  ${damage}` : `${event.text} ${damage}`,
      subtext: event.reaction || '',
      color: event.color,
      kind: event.kind,
      life: liberation ? 1.35 : 1.05,
      maxLife: liberation ? 1.35 : 1.05,
      particles: lowPowerMode ? [] : Array.from({length: event.kind === 'neutralize' ? 12 : 8}, (_,i)=>({
        angle: Math.PI*2*i/(event.kind === 'neutralize' ? 12 : 8),
        speed: 18 + (i%4)*7
      }))
    });
  }

  function updateCombatEffects(dt) {
    for (const effect of combatEffects) { effect.life -= dt; effect.y -= 14 * dt; }
    combatEffects = combatEffects.filter(effect => effect.life > 0);
  }

  function drawCombatEffects() {
    for (const effect of combatEffects) {
      const effectX = logicalToCanvasX(effect.x);
      const progress = 1 - effect.life / effect.maxLife;
      const alpha = Math.max(0, effect.life / effect.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = effect.color;
      ctx.font = `900 ${effect.kind === 'transform' ? 20 : effect.kind === 'neutralize' ? 15 : 14}px "Segoe UI", "Noto Sans JP", sans-serif`;
      ctx.shadowColor = effect.color; ctx.shadowBlur = lowPowerMode ? 0 : 12;
      ctx.fillText(effect.text, effectX, effect.y - 12);
      ctx.shadowBlur = 0;
      if (effect.subtext) {
        ctx.font = '800 10.5px "Segoe UI", "Noto Sans JP", sans-serif';
        ctx.fillStyle = '#f8fbff';
        ctx.globalAlpha = alpha * 0.94;
        ctx.fillText(effect.subtext, effectX, effect.y + 5);
        ctx.fillStyle = effect.color;
      }
      for (const p of effect.particles) {
        const r = p.speed * progress;
        const px = effectX + Math.cos(p.angle) * r;
        const py = effect.y + Math.sin(p.angle) * r;
        ctx.beginPath(); ctx.arc(px, py, effect.kind === 'neutralize' ? 3.2 : 2.6, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function calculateDamage(attacker, defender, bonusMultiplier = 1) {
    if (defender?.stage10Protected) return 0;
    const damageType = attacker?.damageType || 'chemical';
    const bypassesAuReduction = damageType === 'physical' || damageType === 'aqua_regia';
    const reduction = defender?.auBoss && !bypassesAuReduction
      ? clamp(finiteNumber(defender.chemicalDamageReduction, .8), 0, .95)
      : clamp(finiteNumber(defender?.damageReduction, 0), 0, 0.8);
    const airMultiplier = defender?.flying && (attacker?.flying || attacker?.antiAir) ? Math.max(1, finiteNumber(defender.airVulnerability, 1.7)) : 1;
    return Math.max(1, Math.round(attacker.attack * affinityMultiplier(attacker, defender) * researchAttackMultiplier(attacker) * Math.max(1, bonusMultiplier) * airMultiplier * (1 - reduction)));
  }


  function projectileProfile(attacker) {
    const chemistryClass = attacker?.chemistryClass || 'neutral';
    const family = chemistryFamily(chemistryClass);
    const explicitLabel = String(attacker?.projectileLabel || '').trim();
    if (chemistryClass === 'redox') return { label: explicitLabel || attacker?.formula || 'e⁻', color: '#bda4ff', glow: '#dfd2ff' };
    if (family === 'acid') return { label: explicitLabel || 'H⁺', color: '#ff9b8a', glow: '#ffd0c8' };
    if (family === 'base') return { label: explicitLabel || 'OH⁻', color: '#73dcff', glow: '#c7f4ff' };
    return { label: explicitLabel || attacker?.formula || '•', color: '#ffe58a', glow: '#fff6c7' };
  }

  function spawnAttackProjectile(attacker, target, { baseTarget = false, splash = false } = {}) {
    if (!attacker) return;
    const profile = projectileProfile(attacker);
    const direction = attacker.kind === 'ally' ? 1 : -1;
    const tx = baseTarget ? (attacker.kind === 'ally' ? BASE.enemyX : BASE.allyX) : finiteNumber(target?.x, attacker.x + direction * 60);
    const ty = baseTarget ? 300 : finiteNumber(target ? entityVisualY(target) : null, entityVisualY(attacker));
    const distance = Math.max(30, Math.hypot(tx - attacker.x, ty - attacker.y));
    const duration = clamp(distance / 620, .12, .48);
    projectiles.push({
      x0: attacker.x + direction * (attacker.radius + 5), y0: entityVisualY(attacker) - 2,
      x1: tx, y1: ty,
      x: attacker.x, y: attacker.y,
      life: duration, maxLife: duration,
      label: profile.label, color: profile.color, glow: profile.glow,
      direction, splash, ownerKind: attacker.kind, effectKind: 'attack'
    });
    attacker.attackFlash = .18;
    if (target) {
      target.hitFlash = Math.max(target.hitFlash || 0, .18);
      if (gameTime - battleInspectorLastAutoAt >= 1.4 && gameTime > battleInspectorPinnedUntil) {
        focusBattleEntity(target, 2.4, false);
        battleInspectorLastAutoAt = gameTime;
      }
    }
    playSound('attack');
  }

  function spawnImpactBurst(x, y, color = '#ffffff', size = 1) {
    impactBursts.push({ x, y, color, life: .32, maxLife: .32, size, seed: Math.random() * 10 });
  }

  function spawnHealEffect(healer, target, amount) {
    if (!target) return;
    projectiles.push({ x0: healer.x, y0: healer.y, x1: target.x, y1: target.y, x: healer.x, y: healer.y, life: .36, maxLife: .36, label: '+', color: '#82ffc0', glow: '#c8ffe1', direction: target.x >= healer.x ? 1 : -1, splash: false, ownerKind: healer.kind, effectKind: 'heal' });
    impactBursts.push({ x: target.x, y: target.y, color: '#82ffc0', life: .65, maxLife: .65, size: 1.25, heal: amount, seed: Math.random() * 10 });
    healer.attackFlash = .22;
    target.hitFlash = .18;
    playSound('heal');
  }

  function updateBattleVisualEffects(dt) {
    for (const entity of [...allies, ...enemies]) {
      entity.attackFlash = Math.max(0, finiteNumber(entity.attackFlash, 0) - dt);
      entity.hitFlash = Math.max(0, finiteNumber(entity.hitFlash, 0) - dt);
    }
    for (const projectile of projectiles) {
      projectile.life -= dt;
      const p = clamp(1 - projectile.life / projectile.maxLife, 0, 1);
      const eased = 1 - Math.pow(1 - p, 2);
      projectile.x = projectile.x0 + (projectile.x1 - projectile.x0) * eased;
      projectile.y = projectile.y0 + (projectile.y1 - projectile.y0) * eased - Math.sin(Math.PI * p) * 14;
      if (projectile.life <= 0) {
        spawnImpactBurst(projectile.x1, projectile.y1, projectile.color, projectile.splash ? 1.5 : 1);
        playSound('hit');
      }
    }
    projectiles = projectiles.filter((projectile) => projectile.life > 0);
    for (const burst of impactBursts) burst.life -= dt;
    impactBursts = impactBursts.filter((burst) => burst.life > 0);
  }

  function drawProjectiles() {
    for (const projectile of projectiles) {
      const projectileX = logicalToCanvasX(projectile.x);
      const trailX = logicalToCanvasX(projectile.x - projectile.direction * 18);
      const alpha = clamp(projectile.life / Math.min(.12, projectile.maxLife), 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = projectile.color;
      ctx.lineWidth = projectile.splash ? 4 : 2.5;
      ctx.shadowColor = projectile.glow;
      ctx.shadowBlur = lowPowerMode ? 0 : 14;
      ctx.beginPath();
      ctx.moveTo(trailX, projectile.y + 2);
      ctx.lineTo(projectileX, projectile.y);
      ctx.stroke();
      ctx.fillStyle = projectile.color;
      ctx.beginPath(); ctx.arc(projectileX, projectile.y, projectile.splash ? 7 : 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '900 10px "Segoe UI", "Noto Sans JP", sans-serif';
      ctx.fillText(projectile.label, projectileX, projectile.y - 1);
      ctx.restore();
    }
  }

  function drawImpactBursts() {
    for (const burst of impactBursts) {
      const burstX = logicalToCanvasX(burst.x);
      const progress = 1 - burst.life / burst.maxLife;
      const alpha = Math.max(0, burst.life / burst.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = burst.color; ctx.fillStyle = burst.color;
      ctx.shadowColor = burst.color; ctx.shadowBlur = lowPowerMode ? 0 : 12;
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(burstX, burst.y, (8 + progress * 24) * burst.size, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < (lowPowerMode ? 0 : 8); i += 1) {
        const angle = Math.PI * 2 * i / 8 + burst.seed;
        const radius = (6 + progress * 28) * burst.size;
        ctx.beginPath(); ctx.arc(burstX + Math.cos(angle) * radius, burst.y + Math.sin(angle) * radius, 2.3 * burst.size, 0, Math.PI * 2); ctx.fill();
      }
      if (burst.heal) {
        ctx.fillStyle = '#d8ffe9'; ctx.font = '900 13px "Segoe UI", "Noto Sans JP", sans-serif';
        ctx.textAlign = 'center'; ctx.fillText(`+${burst.heal}`, burstX, burst.y - 24 - progress * 12);
      }
      ctx.restore();
    }
  }

  function entityVisualY(entity) {
    const flightOffset = entity?.flying
      ? Math.max(34, finiteNumber(entity.flightHeight, 46)) + FLYING_EXTRA_RENDER_OFFSET
      : 0;
    return finiteNumber(entity?.y, BASE.unitY) - flightOffset;
  }

  function mostInjuredEnemyFor(healer) {
    let target = null;
    let lowestRatio = 1;
    for (const enemy of enemies) {
      if (enemy === healer || enemy.hp <= 0 || enemy.hp >= enemy.maxHp) continue;
      if (Math.abs(enemy.x - healer.x) > healer.healRange + enemy.radius) continue;
      const ratio = enemy.hp / enemy.maxHp;
      if (ratio < lowestRatio) { target = enemy; lowestRatio = ratio; }
    }
    return target;
  }

  function mostInjuredAllyFor(healer) {
    let target = null;
    let bestScore = 0;
    for (const ally of allies) {
      if (ally === healer || ally.hp <= 0 || ally.hp >= ally.maxHp) continue;
      if (Math.abs(ally.x - healer.x) > healer.healRange + ally.radius) continue;
      const missingHp = ally.maxHp - ally.hp;
      const missingRatio = missingHp / Math.max(1, ally.maxHp);
      const guardPriority = ally.guard ? 1.22 : 1;
      const frontlinePriority = 1 + clamp((ally.x - BASE.allySpawnX) / 1800, 0, .12);
      const score = missingHp * guardPriority * frontlinePriority + missingRatio * 30;
      if (score > bestScore) { target = ally; bestScore = score; }
    }
    return target;
  }

  function beginAquaRegiaMultiHit(ally, target) {
    if (!ally?.aquaRegia || !target || target.hp <= 0) return;
    ally.multiHit = {
      targetKey: entityBattleKey(target),
      hitsRemaining: Math.max(1, Math.floor(finiteNumber(ally.hitCount, 6))),
      nextHitIn: 0,
      totalHits: Math.max(1, Math.floor(finiteNumber(ally.hitCount, 6)))
    };
  }

  function updateAquaRegiaMultiHit(ally, dt) {
    const sequence = ally?.multiHit;
    if (!sequence) return false;
    const target = findBattleEntityByKey(sequence.targetKey);
    if (!target || target.hp <= 0 || gameStatus !== 'playing') {
      ally.multiHit = null;
      ally.attackTimer = ally.attackInterval;
      return true;
    }
    sequence.nextHitIn = Math.max(0, finiteNumber(sequence.nextHitIn, 0) - dt);
    if (sequence.nextHitIn > 0) return true;
    if (target.auBoss && !stage10State?.contactStarted && beginAquaAuContact()) return true;
    const damage = calculateDamage(ally, target);
    target.hp -= damage;
    spawnAttackProjectile(ally, target);
    const hitNumber = sequence.totalHits - sequence.hitsRemaining + 1;
    if (target.auBoss) {
      const reactionStages = [
        ['酸化開始', 'Au表面の酸化点'],
        ['酸化開始', '酸化点が拡大'],
        ['Cl⁻錯形成', 'Cl⁻軌道形成'],
        ['Cl⁻錯形成', '錯体形成が進行'],
        ['Au粒子離脱', '金粒子が表面から離脱'],
        ['[AuCl₄]⁻ 反応完了', '簡略化した学習表現']
      ];
      const [text, subtext] = reactionStages[clamp(hitNumber - 1, 0, reactionStages.length - 1)];
      combatEffects.push({
        x: target.x, y: entityVisualY(target) - target.radius - 24,
        text: `${text} ${hitNumber}/6`, subtext, color: '#ffe07a', kind: `aqua-au-${hitNumber}`,
        life: .72, maxLife: .72, particles: lowPowerMode || prefersReducedMotion ? [] : Array.from({length: 8}, (_, index) => ({angle: Math.PI * 2 * index / 8, speed: 18 + index * 2}))
      });
    } else {
      combatEffects.push({
        x: target.x, y: entityVisualY(target) - target.radius - 20,
        text: `混酸連撃 ${hitNumber}/6`, subtext: '', color: '#ffd6a0', kind: 'neutralize',
        life: .55, maxLife: .55, particles: []
      });
    }
    sequence.hitsRemaining -= 1;
    if (sequence.hitsRemaining <= 0 || target.hp <= 0) {
      ally.multiHit = null;
      ally.attackTimer = ally.attackInterval;
    } else {
      sequence.nextHitIn = Math.max(.06, finiteNumber(ally.hitInterval, .14));
    }
    return true;
  }

  function updateAlly(ally, dt) {
    if (ally.hp <= 0) return;
    if (ally.aquaRegia) {
      ally.visualPhase = finiteNumber(ally.visualPhase, 0) + dt;
      const trail = Array.isArray(ally.motionTrail) ? ally.motionTrail : [];
      const last = trail[0];
      if (!last || Math.hypot(last.x - ally.x, last.y - ally.y) > 3) trail.unshift({ x: ally.x, y: ally.y, life: 1 });
      for (const point of trail) point.life = Math.max(0, finiteNumber(point.life, 0) - dt * 2.2);
      ally.motionTrail = trail.filter((point) => point.life > 0).slice(0, lowPowerMode ? 3 : 8);
    }
    ally.stunTimer = Math.max(0, finiteNumber(ally.stunTimer, 0) - dt);
    if (ally.stunTimer > 0) return;
    if (ally.aquaRegia && updateAquaRegiaMultiHit(ally, dt)) return;
    ally.attackTimer = Math.max(0, ally.attackTimer - dt);
    if (ally.healer) {
      const healTarget = mostInjuredAllyFor(ally);
      if (healTarget && ally.attackTimer <= 0) {
        healTarget.hp = Math.min(healTarget.maxHp, healTarget.hp + ally.healAmount);
        spawnHealEffect(ally, healTarget, ally.healAmount);
        ally.attackTimer = ally.attackInterval;
        return;
      }
    }
    if (stageBlocksRangedAlly(ally)) {
      ally.x = Math.min(BASE.enemyX - BASE.radius - ally.radius, ally.x + ally.speed * dt);
      return;
    }
    const { target, distance } = nearestEnemyFor(ally);
    const targetInRange = target && distance <= ally.range + ally.radius + target.radius;
    const baseDistance = BASE.enemyX - ally.x;
    const baseInRange = baseDistance <= ally.range + ally.radius + BASE.radius;

    if (targetInRange) {
      if (ally.attackTimer <= 0) {
        if (ally.aquaRegia) {
          beginAquaRegiaMultiHit(ally, target);
          updateAquaRegiaMultiHit(ally, 0);
          return;
        }
        const firstStrikeBonus = ally.firstStrikeReady ? ally.firstStrikeMultiplier : 1;
        const damage = calculateDamage(ally, target, firstStrikeBonus);
        target.hp -= damage;
        if (ally.firstStrikeReady) ally.firstStrikeReady = false;
        if (ally.pushback > 0 && target.hp > 0) {
          const distance = target.boss ? ally.pushback * 0.35 : ally.pushback;
          target.x = Math.min(BASE.enemySpawnX, target.x + distance);
        }
        spawnAttackProjectile(ally, target, { splash: ally.splashRadius > 0 });
        addCombatEffect(ally, target, damage);
        if (ally.splashRadius > 0 && ally.splashFactor > 0) {
          for (const nearby of enemies) {
            if (nearby === target || nearby.hp <= 0) continue;
            if (Math.hypot(nearby.x - target.x, nearby.y - target.y) > ally.splashRadius + nearby.radius) continue;
            const splashDamage = Math.max(1, Math.round(calculateDamage(ally, nearby) * ally.splashFactor));
            nearby.hp -= splashDamage;
            spawnImpactBurst(nearby.x, nearby.y, '#79e7ff', 1.15);
            addCombatEffect(ally, nearby, splashDamage);
          }
        }
        ally.attackTimer = ally.attackInterval;
      }
      return;
    }

    if (baseInRange) {
      if (isEnemyBaseVulnerable() && ally.attackTimer <= 0) {
        const baseDamage = Math.max(1, Math.round(ally.attack * (ally.firstStrikeReady ? ally.firstStrikeMultiplier : 1) * finiteNumber(ally.baseDamageMultiplier, 1)));
        enemyBaseHp -= baseDamage;
        if (ally.firstStrikeReady) ally.firstStrikeReady = false;
        spawnAttackProjectile(ally, null, { baseTarget: true });
        spawnImpactBurst(BASE.enemyX, 300, '#ff9bad', 1.25);
        playSound('baseHit');
        ally.attackTimer = ally.attackInterval;
      }
      return;
    }

    ally.x = Math.min(BASE.enemyX - BASE.radius - ally.radius, ally.x + ally.speed * dt);
  }

  function triggerBossMinionSummon(enemy) {
    if (!enemy?.boss || !enemy.bossSummonPool?.length || enemy.bossSummonCount <= 0) return;
    const available = Math.max(0, D.maxEnemiesOnField - enemies.length);
    const count = Math.min(available, enemy.auBoss ? 1 + Math.floor(Math.random() * 3) : Math.max(2, enemy.bossSummonCount - (Math.random() < .35 ? 1 : 0)));
    let spawned = 0;
    for (let index = 0; index < count; index += 1) {
      const enemyId = enemy.bossSummonPool[Math.floor(Math.random() * enemy.bossSummonPool.length)];
      const definition = D.enemies.find((candidate) => candidate.id === enemyId);
      if (!definition) continue;
      const minion = createEnemy(definition, enemy.waveIndex);
      minion.x = Math.min(BASE.enemySpawnX, enemy.x + 48 + index * 24);
      minion.y = nextLaneY(enemySpawnSerial + index);
      enemies.push(minion);
      spawned += 1;
    }
    if (spawned > 0) {
      if (enemy.auBoss) {
        combatEffects.push({ x: enemy.x, y: entityVisualY(enemy) - enemy.radius - 34, text: `Au護衛 ×${spawned}`, color: '#ffe08a', kind: 'transform', life: 1.8, maxLife: 1.8, particles: [] });
        showMessage(`Au護衛：既存敵${spawned}体が戦線へ加わりました。`, 3.4);
        playSound('wave');
        return;
      }
      const weakBaseSummon = enemy.affinityTarget === 'weak_base_conjugate_acid';
      const summonLabel = weakBaseSummon ? '弱塩基群集反応' : '弱酸群集反応';
      const entityLabel = weakBaseSummon ? '弱塩基由来イオン' : '弱酸由来イオン';
      const effectColor = weakBaseSummon ? '#d8c3ff' : '#d8ff9b';
      combatEffects.push({ x: enemy.x, y: entityVisualY(enemy) - enemy.radius - 34, text: `${entityLabel}増援 ×${spawned}`, color: effectColor, kind: 'transform', life: 1.8, maxLife: 1.8, particles: [] });
      showMessage(`${summonLabel}：${entityLabel}${spawned}体が増援として出現！`, 3.4);
      playSound('wave');
    }
  }

  function updateBossSummonAbility(enemy, dt) {
    if (!enemy?.boss || !enemy.bossSummonPool?.length || enemy.hp <= 0) return;
    if (enemy.bossSummonPending) {
      enemy.bossSummonPendingTimer = Math.max(0, enemy.bossSummonPendingTimer - dt);
      if (enemy.bossSummonPendingTimer <= 0) {
        enemy.bossSummonPending = false;
        triggerBossMinionSummon(enemy);
        enemy.bossSummonTimer = enemy.bossSummonInterval;
      }
      return;
    }
    enemy.bossSummonTimer = Math.max(0, enemy.bossSummonTimer - dt);
    if (enemy.bossSummonTimer <= 0 && enemies.length < D.maxEnemiesOnField - 1) {
      enemy.bossSummonPending = true;
      enemy.bossSummonPendingTimer = Math.max(.6, enemy.bossSummonWarning || 2);
      if (enemy.auBoss) {
        combatEffects.push({ x: enemy.x, y: entityVisualY(enemy) - enemy.radius - 34, text: 'Au護衛 接近予告', color: '#ffe08a', kind: 'transform', life: enemy.bossSummonPendingTimer, maxLife: enemy.bossSummonPendingTimer, particles: [] });
        showMessage(`⚠ Au護衛：${formatStat(enemy.bossSummonPendingTimer, 1)}秒後に1〜3体が接近`, 3.0);
        playSound('transform');
        return;
      }
      const weakBaseSummon = enemy.affinityTarget === 'weak_base_conjugate_acid';
      const summonLabel = weakBaseSummon ? '弱塩基群集反応' : '弱酸群集反応';
      const effectColor = weakBaseSummon ? '#eadcff' : '#f5ffad';
      combatEffects.push({ x: enemy.x, y: entityVisualY(enemy) - enemy.radius - 34, text: `${summonLabel} 予告`, color: effectColor, kind: 'transform', life: enemy.bossSummonPendingTimer, maxLife: enemy.bossSummonPendingTimer, particles: [] });
      showMessage(`⚠ ${summonLabel}：${formatStat(enemy.bossSummonPendingTimer, 1)}秒後に増援`, 3.0);
      playSound('transform');
    }
  }

  function beginAuGoldCrush(enemy, target) {
    enemy.goldCrushPendingTimer = Math.max(.3, finiteNumber(enemy.goldCrushWarning, .65));
    enemy.goldCrushTargetKey = entityBattleKey(target);
    combatEffects.push({ x: target.x, y: entityVisualY(target) - target.radius - 26, text: '金塊圧撃 予兆', color: '#ffd66b', kind: 'transform', life: enemy.goldCrushPendingTimer, maxLife: enemy.goldCrushPendingTimer, particles: [] });
    showMessage('⚠ 金塊圧撃｜高威力の物理攻撃', 2.2);
  }

  function resolveAuGoldCrush(enemy) {
    const target = findBattleEntityByKey(enemy.goldCrushTargetKey);
    enemy.goldCrushTargetKey = '';
    if (!target || target.hp <= 0) return;
    const mainDamage = Math.max(1, calculateDamage(enemy, target));
    target.hp -= mainDamage;
    target.x = Math.max(BASE.allySpawnX, target.x - finiteNumber(enemy.goldCrushPushback, 28));
    target.stunTimer = Math.max(target.stunTimer || 0, .45);
    spawnAttackProjectile(enemy, target, { splash: true });
    spawnImpactBurst(target.x, entityVisualY(target), '#ffd66b', 1.7);
    for (const nearby of allies) {
      if (nearby === target || nearby.hp <= 0) continue;
      if (Math.hypot(nearby.x - target.x, entityVisualY(nearby) - entityVisualY(target)) > enemy.goldCrushSplashRadius + nearby.radius) continue;
      const damage = Math.max(1, Math.round(mainDamage * enemy.goldCrushSplashFactor));
      nearby.hp -= damage;
      nearby.x = Math.max(BASE.allySpawnX, nearby.x - enemy.goldCrushPushback * .55);
      nearby.stunTimer = Math.max(nearby.stunTimer || 0, .25);
    }
  }

  function resolveAuGoldFoil(enemy) {
    const targets = allies.filter((ally) => ally.hp > 0 && ally.x <= enemy.x && enemy.x - ally.x <= 310 && Math.abs(ally.y - enemy.y) <= 92);
    for (const target of targets) {
      const attack = { ...enemy, attack: enemy.goldFoilDamage, damageType: 'physical' };
      const damage = Math.max(1, calculateDamage(attack, target));
      target.hp -= damage;
      target.x = Math.max(BASE.allySpawnX, target.x - enemy.goldFoilPushback);
      target.stunTimer = Math.max(target.stunTimer || 0, .28);
      spawnImpactBurst(target.x, entityVisualY(target), '#ffe58f', 1.35);
    }
    combatEffects.push({ x: enemy.x - 70, y: entityVisualY(enemy) - 10, text: `金箔展開 ${targets.length}体`, color: '#ffe58f', kind: 'transform', life: 1.2, maxLife: 1.2, particles: [] });
    showMessage(`金箔展開｜物理中ダメージ・強ノックバック${targets.length ? `｜${targets.length}体命中` : '｜回避'}`, 3.2);
  }

  function updateAuBossAbility(enemy, dt) {
    if (!enemy?.auBoss || enemy.hp <= 0) return false;
    if (enemy.stage10Hidden || enemy.stage10Protected) return true;
    if (enemy.goldFoilPendingTimer > 0) {
      enemy.goldFoilPendingTimer = Math.max(0, enemy.goldFoilPendingTimer - dt);
      if (enemy.goldFoilPendingTimer <= 0) {
        resolveAuGoldFoil(enemy);
        enemy.goldFoilTimer = 18 + Math.random() * 4;
      }
      return true;
    }
    enemy.goldFoilTimer = Math.max(0, enemy.goldFoilTimer - dt);
    if (enemy.goldFoilTimer <= 0) {
      enemy.goldFoilPendingTimer = clamp(finiteNumber(enemy.goldFoilWarning, 1.7), 1.5, 2);
      combatEffects.push({ x: enemy.x - 80, y: entityVisualY(enemy) - 20, text: '金箔展開 扇形予告', color: '#ffe58f', kind: 'transform', life: enemy.goldFoilPendingTimer, maxLife: enemy.goldFoilPendingTimer, particles: [] });
      showMessage(`⚠ 金箔展開｜扇形予告 ${enemy.goldFoilPendingTimer.toFixed(1)}秒`, 2.4);
      return true;
    }
    if (enemy.goldCrushPendingTimer > 0) {
      enemy.goldCrushPendingTimer = Math.max(0, enemy.goldCrushPendingTimer - dt);
      if (enemy.goldCrushPendingTimer <= 0) {
        resolveAuGoldCrush(enemy);
        enemy.attackTimer = enemy.attackInterval;
      }
      return true;
    }
    return false;
  }

  function updateEnemy(enemy, dt) {
    if (enemy.hp <= 0) return;
    if (enemy.hp <= 0) return;
    enemy.attackTimer = Math.max(0, enemy.attackTimer - dt);
    updateBossSummonAbility(enemy, dt);
    if (updateAuBossAbility(enemy, dt)) return;
    if (enemy.healer) {
      const healTarget = mostInjuredEnemyFor(enemy);
      if (healTarget && enemy.attackTimer <= 0) {
        healTarget.hp = Math.min(healTarget.maxHp, healTarget.hp + enemy.healAmount);
        spawnHealEffect(enemy, healTarget, enemy.healAmount);
        enemy.attackTimer = enemy.attackInterval;
        return;
      }
    }
    const { target, distance } = nearestAllyFor(enemy);
    const targetInRange = target && distance <= enemy.range + enemy.radius + target.radius;
    const baseDistance = enemy.x - BASE.allyX;
    const baseInRange = baseDistance <= enemy.range + enemy.radius + BASE.radius;

    if (targetInRange) {
      if (enemy.attackTimer <= 0) {
        if (enemy.auBoss) {
          beginAuGoldCrush(enemy, target);
          return;
        }
        const firstStrikeBonus = enemy.firstStrikeReady ? enemy.firstStrikeMultiplier : 1;
        const damage = calculateDamage(enemy, target, firstStrikeBonus);
        target.hp -= damage;
        if (enemy.firstStrikeReady) enemy.firstStrikeReady = false;
        if (enemy.pushback > 0 && target.hp > 0) target.x = Math.max(BASE.allySpawnX, target.x - enemy.pushback);
        spawnAttackProjectile(enemy, target, { splash: enemy.splashRadius > 0 });
        addCombatEffect(enemy, target, damage);
        if (enemy.splashRadius > 0 && enemy.splashFactor > 0) {
          for (const nearby of allies) {
            if (nearby === target || nearby.hp <= 0 || !canAttackTarget(enemy, nearby)) continue;
            if (Math.hypot(nearby.x - target.x, entityVisualY(nearby) - entityVisualY(target)) > enemy.splashRadius + nearby.radius) continue;
            const splashDamage = Math.max(1, Math.round(calculateDamage(enemy, nearby) * enemy.splashFactor));
            nearby.hp -= splashDamage;
            spawnImpactBurst(nearby.x, entityVisualY(nearby), '#ff9a76', 1.15);
          }
        }
        enemy.attackTimer = enemy.attackInterval;
      }
      return;
    }

    if (baseInRange) {
      if (enemy.attackTimer <= 0) {
        const baseAttack = Math.max(1, Math.round(enemy.attack * finiteNumber(enemy.baseDamageMultiplier, 1)));
        const dealt = Math.min(Math.max(0, allyBaseHp), baseAttack);
        allyBaseHp -= baseAttack;
        runStats.baseDamageTaken += dealt;
        spawnAttackProjectile(enemy, null, { baseTarget: true });
        spawnImpactBurst(BASE.allyX, 300, '#ffb06e', 1.35);
        playSound('baseHit');
        enemy.attackTimer = enemy.attackInterval;
      }
      return;
    }

    if (enemy.auBoss) {
      const desiredVelocity = -enemy.speed;
      enemy.moveVelocity = finiteNumber(enemy.moveVelocity, 0) + (desiredVelocity - finiteNumber(enemy.moveVelocity, 0)) * Math.min(1, dt * 3.6);
      enemy.x = Math.max(BASE.allyX + BASE.radius + enemy.radius, enemy.x + enemy.moveVelocity * dt);
    } else {
      enemy.x = Math.max(BASE.allyX + BASE.radius + enemy.radius, enemy.x - enemy.speed * dt);
    }
  }

  function resolveDefeatedEntities() {
    for (const enemy of enemies) {
      if (enemy.hp <= 0 && enemy.boss && enemy.bossPhase === 1 && enemy.phaseTwo) {
        beginBossSecondPhaseSequence(enemy);
      }
    }
    const defeatedEnemies = enemies.filter((enemy) => enemy.hp <= 0);
    const defeatedAllies = allies.filter((ally) => ally.hp <= 0);
    const defeatedAu = defeatedEnemies.some((enemy) => enemy.auBoss);

    for (const enemy of defeatedEnemies) {
      spawnImpactBurst(enemy.x, enemy.y, enemy.boss ? '#ffd779' : '#ff8798', enemy.boss ? 2.1 : 1.25);
      combatEffects.push({ x: enemy.x, y: enemy.y - enemy.radius - 16, text: `+${enemy.reward} COIN`, color: '#ffd779', kind: 'reward', life: 1.15, maxLife: 1.15, particles: [] });
    }
    for (const ally of defeatedAllies) spawnImpactBurst(ally.x, ally.y, '#7adfff', 1.05);

    if (defeatedEnemies.length > 0) {
      playSound('coin');
      const reward = defeatedEnemies.reduce((sum, enemy) => sum + enemy.reward, 0);
      const xpReward = defeatedEnemies.reduce((sum, enemy) => sum + enemy.xpReward, 0);
      const defeatedCount = defeatedEnemies.length;
      grantProgressCoins(reward);
      runStats.enemiesDefeated += defeatedCount;
      cumulativeStats.totalKills += defeatedCount;
      const levelResult = addExperience(xpReward);
      evaluateAchievements();

      if (levelResult.newLevel > levelResult.oldLevel) {
        playSound('level');
        showMessage(
          `敵を${defeatedCount}体撃破。${reward}コイン・${xpReward}EXP獲得。化学レベル${levelResult.newLevel}へ上昇！ エネルギー回復 ${formatStat(currentEnergyRegenRate(), 3)}/秒`,
          4.2
        );
      } else {
        showMessage(`敵を${defeatedCount}体撃破。${reward}コイン・${xpReward}EXP獲得。`);
      }
    }

    if (defeatedAllies.length > 0) {
      runStats.alliesDefeated += defeatedAllies.length;
    }

    enemies = enemies.filter((enemy) => enemy.hp > 0);
    allies = allies.filter((ally) => ally.hp > 0);
    if (defeatedAu && isStage10()) startStage10VictorySequence();
  }

  function updateGame(dt) {
    if (updateStage10Sequence(dt)) {
      updateCombatEffects(dt);
      updateBattleVisualEffects(dt);
      updateAquaRegiaUi();
      messageTimeout = Math.max(0, messageTimeout - dt);
      return;
    }
    gameTime += dt;
    energy = Math.min(currentMaxEnergy(), energy + currentEnergyRegenRate() * dt);

    for (const unit of D.units) {
      const next = Math.max(0, finiteNumber(summonTimers[unit.id], 0) - dt);
      summonTimers[unit.id] = next <= SUMMON_READY_EPSILON ? 0 : next;
    }
    summonUiRefreshTimer += dt;
    const summonRefreshInterval = lowPowerMode ? LOW_POWER_UI_REFRESH_INTERVAL : SUMMON_UI_REFRESH_INTERVAL;
    if (summonUiRefreshTimer >= summonRefreshInterval) {
      summonUiRefreshTimer %= summonRefreshInterval;
      refreshUnitButtonAvailability();
    }
    battleUiRefreshTimer += dt;

    if (endlessMode) updateEndlessMode(dt);
    else updateWaveSystem(dt);

    if (stage10CombatFrozen()) {
      updateCombatEffects(dt);
      updateBattleVisualEffects(dt);
      updateAquaRegiaUi();
      return;
    }

    updateStage10PreparationCandidates(dt);

    for (const ally of allies) {
      updateAlly(ally, dt);
      if (stage10CombatFrozen()) break;
    }
    if (!stage10CombatFrozen()) enemies.forEach((enemy) => updateEnemy(enemy, dt));
    resolveDefeatedEntities();
    updateCombatEffects(dt);
    updateBattleVisualEffects(dt);

    allyBaseHp = Math.max(0, allyBaseHp);
    enemyBaseHp = Math.max(0, enemyBaseHp);

    if (!endlessMode && !isStage10() && enemyBaseHp <= 0) {
      finishGame(true);
    } else if (allyBaseHp <= 0) {
      finishGame(false);
    }

    autoSaveTimer += dt;
    if (autoSaveTimer >= (lowPowerMode ? 15 : 10)) {
      saveGame({ silent: true });
      autoSaveTimer = 0;
    }

    messageTimeout = Math.max(0, messageTimeout - dt);
    if (messageTimeout <= 0) $('battleMessage').classList.remove('show');

    if (battleUiRefreshTimer >= currentUiRefreshInterval()) {
      battleUiRefreshTimer %= currentUiRefreshInterval();
      updateHud();
      renderUnitButtons();
      renderUpgradePanel();
      updateAquaRegiaUi();
      updatePauseButton();
    }
  }

  function finishGame(victory) {
    if (isTimeAttackActive()) {
      gameStatus = victory ? 'victory' : 'defeat';
      paused = true;
      playSound(victory ? 'victory' : 'defeat');
      hideWaveBanner();
      restoreNormalAfterTimeAttack({ victory, reason: victory ? '' : '味方拠点が破壊されました。' });
      return;
    }
    gameStatus = victory ? 'victory' : 'defeat';
    manualPaused = false;
    resumePromptPending = false;
    if ($('pauseModal')) $('pauseModal').hidden = true;
    paused = true;
    playSound(victory ? 'victory' : 'defeat');
    hideWaveBanner();
    let newlyUnlocked = [];
    let defeatSupport = 0;

    if (!victory) {
      const defeatKey = `stage${currentStageId}Defeats`;
      cumulativeStats[defeatKey] = Math.max(0, Math.floor(finiteNumber(cumulativeStats[defeatKey], 0))) + 1;
      const reachedWave = currentWaveIndex + 1;
      defeatSupport = Math.min(
        D.defeatSupportMaxCoins,
        D.defeatSupportBaseCoins + reachedWave * D.defeatSupportCoinsPerWave
      );
      defeatSupport = grantProgressCoins(defeatSupport);
      runStats.defeatSupportCoins += defeatSupport;
      newlyUnlocked = evaluateAchievements();
    }

    if (victory) {
      cumulativeStats.totalClears += 1;
      cumulativeStats.highestStageCleared = Math.max(cumulativeStats.highestStageCleared || 0, currentStageId);
      cumulativeStats[`stage${currentStageId}Clears`] = Math.max(0, cumulativeStats[`stage${currentStageId}Clears`] || 0) + 1;
      const maxStageId = Math.max(...Object.keys(STAGE_LIBRARY).map(Number));
      const nextStageId = Math.min(maxStageId, currentStageId + 1);
      cumulativeStats.highestStageReached = Math.max(cumulativeStats.highestStageReached || 1, nextStageId);
      if (currentStageId === 10) {
        timeAttackProfile = normalizeTimeAttackProfile(timeAttackProfile);
        timeAttackProfile.unlocked = true;
      }
      if (runStats.alliesDefeated === 0 && runStats.baseDamageTaken === 0) {
        cumulativeStats.flawlessClears += 1;
      }
      if (isPerfectResearchReady()) {
        cumulativeStats.perfectResearchClears += 1;
      }
      newlyUnlocked = evaluateAchievements();
    }

    $('endKicker').textContent = victory ? `STAGE ${currentStageId} CLEAR` : 'BASE DESTROYED';
    $('endTitle').textContent = victory ? 'CONGRATULATIONS!' : '敗北';
    $('endTitle').classList.toggle('celebration-title', victory);
    const nextStage = STAGE_LIBRARY[currentStageId + 1];
    $('endText').textContent = victory
      ? nextStage
        ? `Stage ${currentStageId}クリア！ Stage ${nextStage.id}「${nextStage.name}」が解放されました。化学レベル・実績・累計記録は持ち越し、次のステージのコイン・解放・研究レベルは新しく始まります。今回の撃破${runStats.enemiesDefeated}体、獲得${runStats.coinsEarned}コインです。`
        : `Stage ${currentStageId}クリア！ 現在実装されている全${Object.keys(STAGE_LIBRARY).length}研究区を制覇しました。今回の撃破${runStats.enemiesDefeated}体、獲得${runStats.coinsEarned}コインです。`
      : `Stage ${currentStageId}の第${currentWaveIndex + 1}ウェーブ、化学レベル${level}で味方拠点が破壊されました。研究支援として${defeatSupport}コインを獲得しました。今回の合計獲得は${runStats.coinsEarned}コインです。解放・強化を保ったまま再挑戦できます。${currentStageId === 6 ? ' 攻略ヒント：敵はすべて弱酸由来です。第5ユニットの強酸と属性相性を確認してみましょう。' : currentStageId === 7 ? ' 攻略ヒント：敵はすべて弱塩基由来です。第5ユニットの強塩基と属性相性を確認してみましょう。' : currentStageId === 8 ? ' 攻略ヒント：Wave 10ではBOSS出現時に場の味方がすべて倒されます。Energy上限をLv.3以上へ拡張し、125以上を蓄えてからBOSSへ入り、直後に盾・攻撃役を再展開しましょう。' : currentStageId === 9 ? ' 攻略ヒント：遠距離攻撃は禁止です。Alで敵射手へ接近し、Feの近接範囲攻撃とH₂Oの回復で前線を維持しましょう。' : ''}`;
    const hasNextStage = victory && Boolean(STAGE_LIBRARY[currentStageId + 1]);
    $('nextStageBtn').hidden = !hasNextStage;
    if (hasNextStage) $('nextStageBtn').textContent = `ステージ${currentStageId + 1}へ進む`;
    $('continuePlayBtn').hidden = !victory;
    $('endStageGuideBtn').hidden = victory;
    $('retryBtn').hidden = victory;
    $('endAchievementLink').textContent = newlyUnlocked.length > 0
      ? `🏆 新規達成：${newlyUnlocked.map((achievement) => achievement.title).join('・')}`
      : victory && runStats.alliesDefeated === 0
        ? `味方撃破0。拠点被ダメージ ${Math.round(runStats.baseDamageTaken)}。完全防衛まであと少しです。`
        : '';
    $('endModal').hidden = false;
    saveGame({ silent: true });
  }

  function continueAfterClear() {
    if (gameStatus !== 'victory') return;
    $('endModal').hidden = true;
    resetStage({ keepProgress: true });
    showMessage('同じステージを第1ウェーブから開始しました。解放・強化・コインは引き継がれます。', 4.2);
    saveGame({ silent: true });
  }

  function drawRoundedRect(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function drawBar(x, y, width, height, ratio, fillStyle) {
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    drawRoundedRect(x, y, width, height, height / 2);
    ctx.fill();
    const safeRatio = clamp(ratio, 0, 1);
    if (safeRatio > 0) {
      ctx.fillStyle = fillStyle;
      drawRoundedRect(x, y, width * safeRatio, height, height / 2);
      ctx.fill();
    }
  }

  function drawBase(x, hp, maxHp, ally) {
    const side = ally ? 1 : -1;
    const stageTwo = currentStageId === 2;
    const stageThree = currentStageId === 3;
    const stageFour = currentStageId === 4;
    const stageFive = currentStageId === 5;
    const stageSix = currentStageId === 6;
    const stageSeven = currentStageId === 7;
    const stageTen = currentStageId === 10;
    const coreColor = stageTen ? (ally ? '#7ce8ff' : '#ffe17a') : stageSeven ? (ally ? '#c7b4ff' : '#f0a7ff') : stageSix ? (ally ? '#b8ff8a' : '#e5ff77') : stageFive ? (ally ? '#ffd779' : '#ff7f6e') : stageFour ? (ally ? '#75eaff' : '#ffbf72') : stageThree ? (ally ? '#d88cff' : '#ff9f63') : stageTwo ? (ally ? '#99efa8' : '#f0cb6b') : (ally ? '#6fe6ff' : '#ff7994');
    const darkColor = stageTen ? (ally ? '#123f52' : '#4f3508') : stageSeven ? (ally ? '#2d1b58' : '#55245b') : stageSix ? (ally ? '#234914' : '#4b4d10') : stageFive ? (ally ? '#553410' : '#5d171a') : stageFour ? (ally ? '#123e4d' : '#5a3518') : stageThree ? (ally ? '#44205a' : '#5d2c16') : stageTwo ? (ally ? '#174536' : '#59471e') : (ally ? '#123f61' : '#5a2035');
    const panelColor = stageTen ? (ally ? '#1c7891' : '#97711e') : stageSeven ? (ally ? '#6545a6' : '#9b4aa4') : stageSix ? (ally ? '#4b8d2b' : '#8c8c26') : stageFive ? (ally ? '#9a6b1f' : '#9b3331') : stageFour ? (ally ? '#1f7184' : '#95602b') : stageThree ? (ally ? '#773a96' : '#984d25') : stageTwo ? (ally ? '#2c7858' : '#8b6c2d') : (ally ? '#1f6e96' : '#8a3850');

    ctx.save();
    ctx.shadowColor = coreColor;
    ctx.shadowBlur = 16;
    ctx.fillStyle = darkColor;
    drawRoundedRect(x - 34, 244, 68, 112, 12);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = panelColor;
    drawRoundedRect(x - 27, 262, 54, 72, 9);
    ctx.fill();

    const hpRatio = clamp(hp / maxHp, 0, 1);
    if (currentStageId === 1) {
      ctx.save();
      ctx.globalAlpha = .9;
      ctx.strokeStyle = coreColor; ctx.lineWidth = 1.5;
      drawRoundedRect(x - 19, 270, 38, 48, 8); ctx.stroke();
      ctx.fillStyle = ally ? 'rgba(91,214,255,.42)' : 'rgba(255,102,132,.42)';
      ctx.fillRect(x - 16, 289 + (1 - hpRatio) * 20, 32, 26 - (1 - hpRatio) * 20);
      ctx.fillStyle = '#eafaff'; ctx.font = '800 7px "Segoe UI",sans-serif'; ctx.textAlign='center';
      ctx.fillText(ally ? 'pH 7.0' : 'pH 2.0', x, 278);
      for (let i=0;i<4;i+=1){ctx.beginPath();ctx.arc(x-10+i*7,304-((gameTime*8+i*9)%18),2,0,Math.PI*2);ctx.stroke();}
      ctx.restore();
    } else if (stageTwo) {
      ctx.save(); ctx.strokeStyle=coreColor; ctx.lineWidth=1.4; ctx.globalAlpha=.88;
      for(let i=0;i<6;i+=1){const a=Math.PI*2*i/6;const cx=x+Math.cos(a)*17,cy=296+Math.sin(a)*17;ctx.beginPath();for(let k=0;k<6;k+=1){const aa=Math.PI/3*k;const px=cx+Math.cos(aa)*5,py=cy+Math.sin(aa)*5;k?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.stroke();}
      ctx.restore();
    } else if (stageThree) {
      ctx.save(); ctx.strokeStyle=coreColor; ctx.fillStyle=coreColor; ctx.globalAlpha=.9;
      ctx.fillRect(x-17,274,5,35);ctx.fillRect(x+12,274,5,35);
      for(let i=0;i<4;i+=1){const ex=x-8+i*6+Math.sin(gameTime*3+i)*3,ey=286+Math.cos(gameTime*4+i)*10;ctx.beginPath();ctx.arc(ex,ey,2.2,0,Math.PI*2);ctx.fill();}
      ctx.restore();
    } else if (stageFour) {
      ctx.save(); ctx.strokeStyle=coreColor; ctx.fillStyle=coreColor; ctx.globalAlpha=.92; ctx.lineWidth=1.5;
      ctx.strokeRect(x-18,274,36,39);ctx.fillRect(x-20,282+(1-hpRatio)*12,40,4);
      ctx.beginPath();ctx.arc(x,272,12,Math.PI,0);ctx.stroke();
      const needle=-Math.PI*.82+hpRatio*Math.PI*.64;ctx.beginPath();ctx.moveTo(x,272);ctx.lineTo(x+Math.cos(needle)*9,272+Math.sin(needle)*9);ctx.stroke();
      for(let i=0;i<5;i+=1){ctx.beginPath();ctx.arc(x-12+i*6,307-((gameTime*7+i*8)%16),1.8,0,Math.PI*2);ctx.stroke();}
      ctx.restore();
    } else if (stageSeven) {
      ctx.save(); ctx.strokeStyle=coreColor; ctx.fillStyle=coreColor; ctx.globalAlpha=.94; ctx.lineWidth=1.6;
      ctx.beginPath(); ctx.arc(x,292,24,0,Math.PI*2); ctx.stroke();
      for(let i=0;i<3;i+=1){const a=-gameTime*.65+i*Math.PI*2/3;ctx.beginPath();ctx.arc(x+Math.cos(a)*17,292+Math.sin(a)*17,3,0,Math.PI*2);ctx.fill();}
      ctx.font='900 8px "Segoe UI",sans-serif';ctx.textAlign='center';ctx.fillText('OH⁻ LIBERATION',x,324);
      ctx.restore();
    } else if (stageSix) {
      ctx.save(); ctx.strokeStyle=coreColor; ctx.fillStyle=coreColor; ctx.globalAlpha=.94; ctx.lineWidth=1.6;
      ctx.beginPath(); ctx.arc(x,292,24,0,Math.PI*2); ctx.stroke();
      for(let i=0;i<3;i+=1){const a=gameTime*.65+i*Math.PI*2/3;ctx.beginPath();ctx.arc(x+Math.cos(a)*17,292+Math.sin(a)*17,3,0,Math.PI*2);ctx.fill();}
      ctx.font='900 8px "Segoe UI",sans-serif';ctx.textAlign='center';ctx.fillText('H⁺ LIBERATION',x,324);
      ctx.restore();
    } else if (stageFive) {
      ctx.save(); ctx.strokeStyle=coreColor; ctx.fillStyle=coreColor; ctx.globalAlpha=.94; ctx.lineWidth=1.6;
      ctx.beginPath();ctx.arc(x,292,25,0,Math.PI*2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x-24,292);ctx.lineTo(x+24,292);ctx.moveTo(x,268);ctx.lineTo(x,316);ctx.stroke();
      for(let i=0;i<6;i+=1){const a=gameTime*.8+i*Math.PI/3;ctx.beginPath();ctx.arc(x+Math.cos(a)*18,292+Math.sin(a)*18,2.5,0,Math.PI*2);ctx.fill();}
      ctx.fillStyle='#fff0b0';ctx.font='900 8px "Segoe UI",sans-serif';ctx.textAlign='center';ctx.fillText('MILESTONE 5',x,324);
      ctx.restore();
    }

    ctx.strokeStyle = coreColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, 286, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, 286, 7, 0, Math.PI * 2);
    ctx.fillStyle = coreColor;
    ctx.fill();

    ctx.strokeStyle = coreColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, 244);
    ctx.lineTo(x + side * 16, 222);
    ctx.lineTo(x + side * 28, 222);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x + side * 31, 222, 4, 0, Math.PI * 2);
    ctx.fillStyle = coreColor;
    ctx.fill();

    ctx.fillStyle = '#eefaff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 10px "Segoe UI", "Noto Sans JP", sans-serif';
    ctx.fillText(ally ? currentStageDefinition().allyBaseLabel : currentStageDefinition().enemyBaseLabel, x, 316);
    ctx.font = '900 16px "Segoe UI", "Noto Sans JP", sans-serif';
    ctx.fillText(ally ? 'ALLY' : 'ENEMY', x, 342);

    drawBar(x - 39, 230, 78, 9, hp / maxHp, ally ? '#67e2ff' : '#ff7892');
    ctx.fillStyle = '#f3f8ff';
    ctx.font = '800 11px "Segoe UI", sans-serif';
    ctx.fillText(`${Math.ceil(hp)}/${maxHp}`, x, 215);

    if (!ally && !isEnemyBaseVulnerable()) {
      const pulse = .72 + Math.sin(gameTime * 3) * .18;
      ctx.strokeStyle = `rgba(111, 230, 255, ${pulse})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, 299, 45, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#9aeaff';
      ctx.font = '800 9px "Segoe UI", "Noto Sans JP", sans-serif';
      ctx.fillText('WAVE SHIELD', x, 372);
    }
    ctx.restore();
  }

  function entityBattleKey(entity) {
    if (!entity) return '';
    return `${entity.kind}:${entity.typeId}:${finiteNumber(entity.visualSerial, 0)}`;
  }

  function findBattleEntityByKey(key) {
    if (!key) return null;
    return [...allies, ...enemies].find((entity) => entity.hp > 0 && entityBattleKey(entity) === key) || null;
  }

  function focusBattleEntity(entity, seconds = 5, pinned = false) {
    if (!entity || entity.hp <= 0) return;
    battleInspectorKey = entityBattleKey(entity);
    battleInspectorPinnedUntil = gameTime + Math.max(.5, seconds);
    if (pinned) battleInspectorPinnedUntil = gameTime + 12;
  }

  function autoBattleInspectorEntity() {
    const selected = findBattleEntityByKey(battleInspectorKey);
    if (selected && gameTime <= battleInspectorPinnedUntil) return selected;
    const boss = enemies.find((entity) => entity.hp > 0 && entity.boss);
    if (boss) return boss;
    const livingEnemies = enemies.filter((entity) => entity.hp > 0);
    if (livingEnemies.length) return livingEnemies.reduce((best, entity) => entity.x < best.x ? entity : best);
    const livingAllies = allies.filter((entity) => entity.hp > 0);
    if (livingAllies.length) return livingAllies.reduce((best, entity) => entity.x > best.x ? entity : best);
    return null;
  }

  function drawCompactEntityVitals(entity, bodyTop, bodyWidth) {
    const damaged = entity.hp < entity.maxHp - .5;
    const recentlyActive = (entity.hitFlash || 0) > 0 || (entity.attackFlash || 0) > 0;
    if (!entity.boss && !damaged && !recentlyActive) return;
    const ally = entity.kind === 'ally';
    const width = Math.max(34, Math.min(82, bodyWidth * .78));
    const y = bodyTop - 8;
    ctx.save();
    ctx.globalAlpha = entity.boss ? .92 : (recentlyActive ? .82 : .62);
    drawBar(entity.x - width / 2, y, width, entity.boss ? 6 : 4, entity.hp / entity.maxHp, ally ? '#70e5a0' : '#ff9a76');
    if (entity.boss || entity.hp / entity.maxHp < .35) {
      ctx.fillStyle = '#f7fbff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.font = `800 ${entity.boss ? 10 : 8}px "Segoe UI", "Noto Sans JP", sans-serif`;
      ctx.fillText(`${Math.max(0, Math.ceil(entity.hp))}/${entity.maxHp}`, entity.x, y - 2);
    }
    ctx.restore();
  }

  function drawBattleInspector() {
    const entity = autoBattleInspectorEntity();
    const x = 10;
    const y = 54;
    const width = entity ? 238 : 188;
    const height = entity ? 62 : 34;
    ctx.save();
    ctx.globalAlpha = .72;
    ctx.fillStyle = 'rgba(2, 10, 20, .72)';
    ctx.strokeStyle = entity?.kind === 'enemy' ? 'rgba(255,150,166,.52)' : 'rgba(104,219,255,.48)';
    ctx.lineWidth = 1;
    drawRoundedRect(x, y, width, height, 10);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    if (!entity) {
      ctx.fillStyle = '#c9d9e8';
      ctx.font = '700 10px "Segoe UI", "Noto Sans JP", sans-serif';
      ctx.fillText('戦闘開始後、前線のステータスを自動表示', x + 10, y + height / 2);
      ctx.restore();
      return;
    }
    const ally = entity.kind === 'ally';
    ctx.fillStyle = ally ? '#9cecff' : '#ffb7c2';
    ctx.font = '900 15px "Segoe UI", "Noto Sans JP", sans-serif';
    ctx.fillText(entity.formula, x + 10, y + 16);
    ctx.fillStyle = '#f3f8ff';
    ctx.font = '800 10px "Segoe UI", "Noto Sans JP", sans-serif';
    const phaseText = entity.boss ? (entity.bossPhase >= 2 ? ' BOSS第2形態' : ' BOSS') : '';
    const flightText = entity.flying ? ' ✈飛行' : '';
    ctx.fillText(`${entity.name || ''}${phaseText}${flightText}`, x + 62, y + 16);
    ctx.fillStyle = '#f3d58a';
    ctx.font = '800 9px "Segoe UI", "Noto Sans JP", sans-serif';
    ctx.fillText(`${entity.chemistryLabel || '相性なし'}｜⚔${entity.attack} ◎${entity.range} ➤${formatStat(entity.speed)} ⏱${formatStat(entity.attackInterval)}s`, x + 10, y + 34);
    drawBar(x + 10, y + 46, 128, 7, entity.hp / entity.maxHp, ally ? '#70e5a0' : '#ff9a76');
    ctx.fillStyle = '#eaf5ff';
    ctx.font = '800 9px "Segoe UI", "Noto Sans JP", sans-serif';
    ctx.fillText(`HP ${Math.max(0, Math.ceil(entity.hp))}/${entity.maxHp}`, x + 145, y + 50);
    if (!ally) {
      ctx.fillStyle = '#c7d6e6';
      ctx.font = '700 8px "Segoe UI", "Noto Sans JP", sans-serif';
      ctx.fillText(`●${entity.reward}  ✦${entity.xpReward}XP`, x + 176, y + 34);
    }
    if (gameTime < battleInspectorHintUntil) {
      ctx.fillStyle = 'rgba(214,232,245,.72)';
      ctx.font = '700 8px "Segoe UI", "Noto Sans JP", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('分子をタップで12秒固定', x + width - 8, y + height - 7);
    }
    ctx.restore();
  }

  function canvasPointFromEvent(event) {
    const rect = cv.getBoundingClientRect();
    return {
      x: canvasToLogicalX((event.clientX - rect.left) * cv.width / Math.max(1, rect.width)),
      y: (event.clientY - rect.top) * cv.height / Math.max(1, rect.height)
    };
  }

  function entityAtCanvasPoint(point) {
    const entities = [...allies, ...enemies].filter((entity) => entity.hp > 0).reverse();
    return entities.find((entity) => {
      const scale = entity.boss ? (entity.bossPhase >= 2 ? 1.48 : 1.35) : 1;
      const width = Math.max(62, entity.radius * 3.3) * scale;
      const height = Math.max(43, entity.radius * 2.15) * scale;
      return Math.abs(point.x - entity.x) <= width * .58 && Math.abs(point.y - entityVisualY(entity)) <= height * .72;
    }) || null;
  }

  function drawAquaRegiaTrail(entity) {
    if (!entity.aquaRegia || !Array.isArray(entity.motionTrail)) return;
    ctx.save();
    for (const [index, point] of entity.motionTrail.entries()) {
      const alpha = clamp(finiteNumber(point.life, 0) * (.24 - index * .018), 0, .24);
      if (alpha <= 0) continue;
      const trailX = logicalToCanvasX(point.x);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = index % 2 ? '#ffb35f' : '#7adfff';
      ctx.beginPath();
      ctx.ellipse(trailX, point.y, 15 - index, 7 - index * .3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawStage10Atmosphere() {
    if (!isStage10() || !stage10State) return;
    const centerX = cv.width * .62;
    if (stage10State.phase === 'forming') {
      const elapsed = stage10State.formationElapsed;
      ctx.save();
      for (let index = 0; index < (lowPowerMode ? 2 : 4); index += 1) {
        const progress = (elapsed * .34 + index * .23) % 1;
        ctx.globalAlpha = (1 - progress) * .34;
        ctx.strokeStyle = index % 2 ? '#ffe58b' : '#b98720';
        ctx.lineWidth = 2 + index;
        ctx.beginPath();
        ctx.ellipse(centerX, 300, 45 + progress * 330, 26 + progress * 170, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      const particles = lowPowerMode || prefersReducedMotion ? 12 : 30;
      for (let index = 0; index < particles; index += 1) {
        const angle = index * 2.399 + elapsed * .25;
        const distance = Math.max(18, 300 - elapsed * 52 + (index % 7) * 12);
        ctx.globalAlpha = .25 + (index % 4) * .12;
        ctx.fillStyle = index % 3 ? '#f3c94e' : '#fff0a4';
        ctx.beginPath();
        ctx.arc(centerX + Math.cos(angle) * distance, 300 + Math.sin(angle) * distance * .42, 1.5 + index % 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawStage10AbilityWarnings() {
    if (!isStage10()) return;
    const au = enemies.find((enemy) => enemy.auBoss && enemy.hp > 0 && !enemy.stage10Hidden);
    if (!au) return;
    const auX = logicalToCanvasX(au.x);
    const auY = entityVisualY(au);
    if (au.goldCrushPendingTimer > 0) {
      const target = findBattleEntityByKey(au.goldCrushTargetKey);
      if (target) {
        const targetX = logicalToCanvasX(target.x);
        const pulse = 1 - clamp(au.goldCrushPendingTimer / Math.max(.3, au.goldCrushWarning), 0, 1);
        ctx.save();
        ctx.strokeStyle = '#ffd15a';
        ctx.fillStyle = 'rgba(255,194,43,.11)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(targetX, entityVisualY(target), 28 + pulse * 42, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(auX - 18, auY); ctx.lineTo(targetX + 24, entityVisualY(target)); ctx.stroke();
        ctx.fillStyle = '#ffeaa3'; ctx.font = '900 17px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('←', targetX - 34, entityVisualY(target) + 5);
        ctx.restore();
      }
    }
    if (au.goldFoilPendingTimer > 0) {
      const progress = 1 - clamp(au.goldFoilPendingTimer / Math.max(1.5, au.goldFoilWarning), 0, 1);
      ctx.save();
      for (let layer = 0; layer < (lowPowerMode || prefersReducedMotion ? 2 : 4); layer += 1) {
        const length = 120 + layer * 48 + progress * 70;
        ctx.globalAlpha = .12 + layer * .055;
        ctx.fillStyle = layer % 2 ? '#fff0a5' : '#d39a25';
        ctx.beginPath();
        ctx.moveTo(auX - 18, auY);
        ctx.lineTo(auX - length, auY - 48 - layer * 7);
        ctx.lineTo(auX - length * 1.06, auY + 48 + layer * 7);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawEntity(entity) {
    if (entity.stage10Hidden) return;
    const ally = entity.kind === 'ally';
    const idleBob = Math.sin(gameTime * (entity.flying ? 5.1 : 4.2) + finiteNumber(entity.visualSerial, 0) * .9) * (entity.flying ? 3.0 : 1.6);
    const originalY = entity.y;
    const originalX = entity.x;
    if (entity.flying) {
      ctx.save();
      ctx.globalAlpha = .24;
      ctx.fillStyle = '#02060b';
      ctx.beginPath();ctx.ellipse(entity.x, originalY + 17, Math.max(18, entity.radius * 1.3), 6, 0, 0, Math.PI * 2);ctx.fill();
      ctx.restore();
      entity.y = entityVisualY(entity);
    }
    const motion = clamp(finiteNumber(entity.attackFlash, 0) * 5, 0, 1);
    const direction = ally ? 1 : -1;
    const role = entity.role || '';
    if (/歩兵|強襲|盾/.test(role)) entity.x += direction * Math.sin(motion * Math.PI) * (role.includes('強襲') ? 10 : 5);
    else if (/弓兵|速射|範囲/.test(role)) entity.x -= direction * Math.sin(motion * Math.PI) * 4;
    entity.y += idleBob;
    const auHpRatio = entity.auBoss ? clamp(entity.hp / Math.max(1, entity.maxHp), 0, 1) : 1;
    const bossScale = entity.auBoss ? .78 + auHpRatio * .62 : entity.boss ? (entity.bossPhase >= 2 ? 1.48 : 1.35) : 1;
    const width = Math.max(62, entity.radius * 3.3) * bossScale;
    const height = Math.max(43, entity.radius * 2.15) * bossScale;
    const x = entity.x - width / 2;
    const y = entity.y - height / 2;

    drawAquaRegiaTrail(entity);

    drawCompactEntityVitals(entity, y, width);

    if (entity.boss) {
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffd779'; ctx.strokeStyle = 'rgba(78,28,8,.95)'; ctx.lineWidth = 4;
      ctx.font = '900 16px "Segoe UI", "Noto Sans JP", sans-serif';
      const bossLabel = entity.bossPhase >= 2 ? 'BOSS・第二形態' : 'BOSS';
      ctx.strokeText(bossLabel, entity.x, y - 18); ctx.fillText(bossLabel, entity.x, y - 18);
      ctx.restore();
    }

    if (entityBattleKey(entity) === battleInspectorKey && gameTime <= battleInspectorPinnedUntil) {
      ctx.save();
      ctx.globalAlpha = .7;
      ctx.strokeStyle = ally ? '#8beaff' : '#ffb2bf';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      drawRoundedRect(x - 4, y - 4, width + 8, height + 8, 14);
      ctx.stroke();
      ctx.restore();
    }

    if (stage10HighlightedKeys().has(entityBattleKey(entity))) {
      ctx.save();
      ctx.globalAlpha = .7 + Math.sin(gameTime * 7) * .2;
      ctx.strokeStyle = '#ffe27b';
      ctx.lineWidth = 3;
      ctx.setLineDash([7, 4]);
      ctx.beginPath(); ctx.ellipse(entity.x, entity.y, width * .62, height * .72, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    if ((entity.hitFlash || 0) > 0 || (entity.attackFlash || 0) > 0) {
      ctx.save();
      const flash = Math.max(entity.hitFlash || 0, entity.attackFlash || 0);
      ctx.globalAlpha = clamp(flash * 4, 0, .78);
      ctx.fillStyle = (entity.hitFlash || 0) >= (entity.attackFlash || 0) ? '#ffffff' : (ally ? '#78e7ff' : '#ff9bae');
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 24;
      drawRoundedRect(x - 5, y - 5, width + 10, height + 10, 14); ctx.fill();
      ctx.restore();
    }

    if (entity.auBoss) {
      const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
      gradient.addColorStop(0, '#5f430e');
      gradient.addColorStop(.42 + Math.sin(gameTime * .55) * .08, '#d6a52d');
      gradient.addColorStop(1, '#6b4b0c');
      ctx.fillStyle = gradient;
    } else if (entity.aquaRegia) {
      const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
      gradient.addColorStop(0, '#183e63');
      gradient.addColorStop(.48, '#6a3b28');
      gradient.addColorStop(1, '#d28b32');
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = ally ? '#183f5b' : (entity.boss ? (entity.bossPhase >= 2 ? '#54206e' : '#6b2338') : '#54293a');
    }
    ctx.strokeStyle = entity.auBoss ? '#ffe27b' : ally ? (entity.aquaRegia ? '#ffd08a' : '#5fd6ff') : '#ff8798';
    ctx.lineWidth = 2;
    drawRoundedRect(x, y, width, height, 11);
    ctx.fill();
    ctx.stroke();

    if (entity.auBoss) {
      ctx.save();
      ctx.globalAlpha = .24;
      ctx.fillStyle = '#fff1a8';
      ctx.beginPath();
      ctx.ellipse(entity.x + Math.sin(gameTime * .72) * width * .06, entity.y + Math.cos(gameTime * .48) * 3, width * .31, height * .25, Math.sin(gameTime * .18) * .16, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = .34;
      ctx.strokeStyle = '#ffe583';
      ctx.lineWidth = 1.5;
      for (let band = 0; band < (lowPowerMode ? 2 : 4); band += 1) {
        const yy = y + height * (.25 + band * .16) + Math.sin(gameTime * .9 + band) * 3;
        ctx.beginPath();
        ctx.moveTo(x + 8, yy);
        ctx.bezierCurveTo(x + width * .3, yy - 7, x + width * .66, yy + 7, x + width - 8, yy);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (entity.aquaRegia) {
      const hpRatio = clamp(entity.hp / Math.max(1, entity.maxHp), 0, 1);
      const phase = gameTime * (hpRatio < .35 ? 1.25 : .8) + finiteNumber(entity.visualSerial, 0);
      ctx.save();
      ctx.translate(entity.x, entity.y);
      ctx.globalAlpha = .62 * (.72 + hpRatio * .28);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#71ddff';
      ctx.beginPath(); ctx.ellipse(0, 0, width * .62, height * .72, phase, 0, Math.PI * 1.45); ctx.stroke();
      ctx.strokeStyle = '#ffb45f';
      ctx.beginPath(); ctx.ellipse(0, 0, width * .72, height * .56, -phase * .82, Math.PI * .25, Math.PI * 1.82); ctx.stroke();
      const particleCount = entity.multiHit ? 6 : lowPowerMode ? 4 : 8;
      for (let index = 0; index < particleCount; index += 1) {
        const angle = phase * (index % 2 ? -1 : 1) + Math.PI * 2 * index / particleCount;
        const radius = width * (.45 + (index % 3) * .09);
        ctx.fillStyle = index % 2 ? '#ffbe6c' : '#84e8ff';
        ctx.globalAlpha = .55 + (index % 3) * .12;
        ctx.beginPath(); ctx.arc(Math.cos(angle) * radius, Math.sin(angle) * height * .58, 2.2 + index % 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    if (entity.flying) {
      ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#d7f4ff';ctx.strokeStyle='rgba(7,22,35,.9)';ctx.lineWidth=3;ctx.font='900 9px "Segoe UI",sans-serif';ctx.strokeText('✈ FLYING',entity.x,y-12);ctx.fillText('✈ FLYING',entity.x,y-12);ctx.restore();
    }

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${entity.formula.length > 5 ? 15 : 18}px "Segoe UI", "Noto Sans JP", sans-serif`;
    ctx.fillText(entity.formula, entity.x, entity.y + 1);
    if (entity.auBoss && auHpRatio < .98) {
      const lostCount = Math.min(9, Math.max(1, Math.floor((1 - auHpRatio) * 10)));
      ctx.save();
      ctx.fillStyle = '#f3c84f';
      ctx.globalAlpha = .75;
      for (let index = 0; index < lostCount; index += 1) {
        const angle = -Math.PI * .8 + index * .47;
        const distance = width * (.55 + index * .025);
        ctx.beginPath();
        ctx.arc(entity.x + Math.cos(angle) * distance, entity.y + Math.sin(angle) * distance - index * 2, 2.5 + index % 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    entity.y = originalY;
    entity.x = originalX;
  }

  function drawBackground() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    const visualTime = lowPowerMode ? 0 : gameTime;

    const sky = ctx.createLinearGradient(0, 0, 0, cv.height);
    const stageTwo = currentStageId === 2;
    const stageThree = currentStageId === 3;
    const stageFour = currentStageId === 4;
    const stageFive = currentStageId === 5;
    const stageSix = currentStageId === 6;
    const stageSeven = currentStageId === 7;
    const stageTen = currentStageId === 10;
    sky.addColorStop(0, stageTen ? '#241704' : stageSeven ? '#170b2c' : stageSix ? '#0b2410' : stageFive ? '#220c18' : stageFour ? '#061e2b' : stageThree ? '#1b0b25' : stageTwo ? '#111b18' : '#071426');
    sky.addColorStop(.48, stageTen ? '#684a0d' : stageSeven ? '#4b2470' : stageSix ? '#255c1d' : stageFive ? '#61231f' : stageFour ? '#0c4a5a' : stageThree ? '#3a1647' : stageTwo ? '#1c4034' : '#102b45');
    sky.addColorStop(.74, stageTen ? '#95752a' : stageSeven ? '#7d4f8c' : stageSix ? '#71872b' : stageFive ? '#8a5b2b' : stageFour ? '#35747c' : stageThree ? '#59323d' : stageTwo ? '#38513b' : '#16334b');
    sky.addColorStop(.75, stageTen ? '#3c2b0d' : stageSeven ? '#342142' : stageSix ? '#233215' : stageFive ? '#3d1d18' : stageFour ? '#16343d' : stageThree ? '#34211d' : stageTwo ? '#2a3021' : '#142538');
    sky.addColorStop(1, stageTen ? '#120d04' : stageSeven ? '#10091c' : stageSix ? '#07170b' : stageFive ? '#150a12' : stageFour ? '#07161e' : stageThree ? '#150d14' : stageTwo ? '#11150e' : '#09131f');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, cv.width, cv.height);

    const glow = ctx.createRadialGradient(cv.width / 2, 130, 20, cv.width / 2, 130, 420);
    glow.addColorStop(0, stageSeven ? 'rgba(211, 165, 255, .25)' : stageSix ? 'rgba(191, 255, 104, .26)' : stageFive ? 'rgba(255, 194, 91, .27)' : stageFour ? 'rgba(108, 232, 255, .24)' : stageThree ? 'rgba(224, 117, 255, .22)' : stageTwo ? 'rgba(141, 231, 150, .19)' : 'rgba(73, 190, 255, .18)');
    glow.addColorStop(1, stageSeven ? 'rgba(211, 165, 255, 0)' : stageSix ? 'rgba(191, 255, 104, 0)' : stageFive ? 'rgba(255, 126, 92, 0)' : stageFour ? 'rgba(108, 232, 255, 0)' : stageThree ? 'rgba(224, 117, 255, 0)' : stageTwo ? 'rgba(141, 231, 150, 0)' : 'rgba(73, 190, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, cv.width, 320);

    ctx.save();
    ctx.globalAlpha = .17;
    ctx.strokeStyle = stageSeven ? '#e6c8ff' : stageSix ? '#d9ff8b' : stageFive ? '#ffd779' : stageFour ? '#9ff2ff' : stageThree ? '#e6a0ff' : stageTwo ? '#b9e779' : '#79cfff';
    ctx.lineWidth = 1;
    for (let i = 0; i < 15; i += 1) {
      const x = (i * 79 + 31) % cv.width;
      const y = 55 + ((i * 53) % 175);
      const r = 5 + (i % 3) * 2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      const nx = x + 34 + (i % 4) * 7;
      const ny = y + ((i % 2) ? 18 : -15);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(nx - r, ny);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(nx, ny, r - 1, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (stageTwo) {
      ctx.globalAlpha = .22;
      ctx.fillStyle = '#e7d77a';
      for (let i = 0; i < 18; i += 1) {
        const x = (i * 61 + 45) % cv.width;
        const y = 82 + ((i * 47) % 210);
        const s = 3 + (i % 4);
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillRect(-s, -s, s * 2, s * 2); ctx.restore();
      }
    }
    if (stageThree) {
      ctx.globalAlpha = .28;
      for (let i = 0; i < 16; i += 1) {
        const x = (i * 73 + 28) % cv.width;
        const y = 70 + ((i * 41) % 220);
        ctx.fillStyle = i % 2 ? '#ffaf72' : '#dca0ff';
        ctx.beginPath(); ctx.arc(x, y, 3 + (i % 3), 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.32)';
        ctx.beginPath(); ctx.moveTo(x - 15, y); ctx.lineTo(x + 15, y); ctx.stroke();
      }
    }
    if (stageFour) {
      ctx.globalAlpha = .25;
      for (let i = 0; i < 22; i += 1) {
        const x = (i * 59 + 21) % cv.width;
        const y = 58 + ((i * 43 + visualTime * (5 + i % 3)) % 235);
        const r = 2 + (i % 4);
        ctx.strokeStyle = i % 3 ? '#9eeeff' : '#d6fbff';
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = .18;
      ctx.strokeStyle = '#9eeeff'; ctx.lineWidth = 2;
      for (let x = 165; x < cv.width; x += 285) {
        ctx.strokeRect(x - 38, 68, 76, 96);
        ctx.beginPath(); ctx.moveTo(x - 44, 92); ctx.lineTo(x + 44, 92); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, 122, 22, Math.PI, 0); ctx.stroke();
      }
    }
    if (stageSeven) {
      ctx.globalAlpha=.25; ctx.strokeStyle='#e6c8ff'; ctx.fillStyle='#e6c8ff';
      for(let i=0;i<18;i+=1){const x=(i*71-visualTime*(4+i%3))%(cv.width+80)-40;const y=62+((i*43)%210);ctx.beginPath();ctx.arc(x,y,3+(i%3),0,Math.PI*2);ctx.stroke();ctx.font='800 8px sans-serif';ctx.fillText(i%3===0?'OH⁻':'+',x+8,y-7);}
    }
    if (stageSix) {
      ctx.globalAlpha=.25; ctx.strokeStyle='#d9ff8b'; ctx.fillStyle='#d9ff8b';
      for(let i=0;i<18;i+=1){const x=(i*71+visualTime*(4+i%3))%(cv.width+80)-40;const y=62+((i*43)%210);ctx.beginPath();ctx.arc(x,y,3+(i%3),0,Math.PI*2);ctx.stroke();ctx.font='800 8px sans-serif';ctx.fillText(i%3===0?'H⁺':'−',x+8,y-7);}
    }
    if (stageFive) {
      ctx.globalAlpha = .28;
      for (let i = 0; i < 20; i += 1) {
        const x = (i * 67 + visualTime * (10 + i % 4)) % (cv.width + 80) - 40;
        const y = 58 + ((i * 47) % 205);
        ctx.strokeStyle = i % 2 ? '#ffd779' : '#ff9b84';
        ctx.beginPath();ctx.moveTo(x-10,y+5);ctx.quadraticCurveTo(x,y-9,x+10,y+5);ctx.stroke();
      }
      ctx.globalAlpha=.20;ctx.strokeStyle='#ffe39a';ctx.lineWidth=2;
      for(let x=150;x<cv.width;x+=260){ctx.beginPath();ctx.arc(x,120,34,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(x-34,120);ctx.lineTo(x+34,120);ctx.stroke();ctx.beginPath();ctx.moveTo(x,86);ctx.lineTo(x,154);ctx.stroke();}
    }
    if (stageTen) {
      ctx.globalAlpha = .3;
      ctx.fillStyle = '#ffe27b';
      ctx.strokeStyle = '#ffe27b';
      for (let index = 0; index < (lowPowerMode ? 8 : 20); index += 1) {
        const x = (index * 83 + visualTime * (3 + index % 3)) % (cv.width + 60) - 30;
        const y = 56 + (index * 47 % 220);
        ctx.beginPath(); ctx.arc(x, y, 2 + index % 3, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = .18;
      ctx.font = '900 12px "Segoe UI",sans-serif';
      ctx.fillText('79 Au', cv.width * .72, 112);
      ctx.fillText('Au', cv.width * .32, 178);
    }
    ctx.restore();

    ctx.fillStyle = 'rgba(2, 9, 17, .50)';
    ctx.fillRect(0, 318, cv.width, 102);

    ctx.strokeStyle = 'rgba(98, 211, 255, .22)';
    ctx.lineWidth = 1;
    for (let x = -100; x < cv.width + 100; x += 60) {
      ctx.beginPath();
      ctx.moveTo(cv.width / 2, 305);
      ctx.lineTo(x, cv.height);
      ctx.stroke();
    }
    for (let y = 328; y <= cv.height; y += 22) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cv.width, y);
      ctx.stroke();
    }

    const conduit = ctx.createLinearGradient(0, 0, cv.width, 0);
    conduit.addColorStop(0, 'rgba(95,214,255,.48)');
    conduit.addColorStop(.48, 'rgba(122,175,255,.12)');
    conduit.addColorStop(.52, 'rgba(255,126,151,.12)');
    conduit.addColorStop(1, 'rgba(255,126,151,.48)');
    ctx.fillStyle = conduit;
    ctx.fillRect(0, 356, cv.width, 3);

    const wave = currentWave();
    if (wave) {
      ctx.fillStyle = 'rgba(3, 11, 22, .82)';
      ctx.strokeStyle = 'rgba(101, 210, 255, .34)';
      ctx.lineWidth = 1;
      drawRoundedRect(cv.width / 2 - 143, 12, 286, 34, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#e7f8ff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '800 13px "Segoe UI", "Noto Sans JP", sans-serif';
      ctx.fillText(`WAVE ${currentWaveIndex + 1}/${D.waves.length}｜${wave.name}`, cv.width / 2, 29);
    }
  }

  function draw() {
    drawBackground();
    drawStage10Atmosphere();
    drawBase(logicalToCanvasX(BASE.allyX), allyBaseHp, D.allyBaseHp, true);
    drawBase(logicalToCanvasX(BASE.enemyX), enemyBaseHp, D.enemyBaseHp, false);

    const sorted = [...allies, ...enemies].sort((a, b) => a.y - b.y || a.x - b.x);
    sorted.forEach((entity) => {
      const logicalX = entity.x;
      entity.x = logicalToCanvasX(logicalX);
      drawEntity(entity);
      entity.x = logicalX;
    });
    drawStage10AbilityWarnings();
    drawProjectiles();
    drawImpactBursts();
    drawCombatEffects();
    drawBattleInspector();

    if (paused && gameStatus === 'playing' && (activeQuiz || manualPaused || overlayPauseCount > 0 || tutorialActive)) {
      ctx.fillStyle = 'rgba(0,0,0,.24)';
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '800 24px "Segoe UI", "Noto Sans JP", sans-serif';
      ctx.fillText(manualPaused ? 'BATTLE PAUSED' : activeQuiz ? 'QUIZ PAUSE' : tutorialActive ? 'TUTORIAL PAUSE' : 'MENU PAUSE', cv.width / 2, 68);
    }
  }

  function unitRoleDescription(unit) {
    if (stageBlocksRangedAlly(unit)) return '遠距離攻撃禁止：このStageでは攻撃できず、召喚もできません。';
    if (unit.flying) return '飛行：通常の地上近接攻撃を受けず、対空攻撃に弱い。時間経過による自傷ダメージはありません。';
    if (unit.healer) return '高性能単体回復：傷の深い味方1体を大きく回復';
    if (unit.guard) return `盾役：敵の攻撃を引き受け、被ダメージ${Math.round((unit.damageReduction || 0) * 100)}%軽減`;
    if (unit.splashRadius) return '集団戦：着弾地点の周囲にもダメージ';
    if (unit.firstStrikeMultiplier > 1) return `強襲：最初の一撃×${unit.firstStrikeMultiplier}・敵を押し戻す`;
    if (/弓兵|速射/.test(unit.role || '')) return '後方火力：長射程から継続攻撃';
    return '歩兵：低コストで前線の数を増やす';
  }

  function updateUnitButtonAvailability(unit, refs) {
    const isUnlocked = unlocked.has(unit.id);
    const cooldown = summonCooldownRemaining(unit.id);
    const summonCost = effectiveUnitCost(unit);
    const canAfford = energy >= summonCost;
    const tutorialAllowed = tutorialActive && tutorialStep === 1 && unit.id === tutorialTargetUnitId;
    const rangedBlocked = isUnlocked && stageBlocksRangedAlly(unit);
    const ready = isUnlocked && !rangedBlocked && cooldown === 0 && canAfford && (!paused || tutorialAllowed) && gameStatus === 'playing';

    refs.button.classList.toggle('locked', !isUnlocked);
    refs.button.classList.toggle('ready', ready);
    refs.button.classList.toggle('ranged-blocked', rangedBlocked);
    refs.button.disabled = (paused && !tutorialAllowed) || gameStatus !== 'playing' || rangedBlocked;

    if (!isUnlocked) {
      const prerequisiteLocked = unit.unlockAfter && !unlocked.has(unit.unlockAfter);
      const previous = D.units.find((candidate) => candidate.id === unit.unlockAfter);
      refs.state.textContent = prerequisiteLocked ? `🔒 先に${previous?.formula || '前のユニット'}を解放` : `🔒 ${unit.unlockCost} COINで難問に挑戦`;
      refs.cover.style.height = '0%';
    } else if (rangedBlocked) {
      refs.state.textContent = '⛔ 遠距離攻撃禁止：召喚不可';
      refs.cover.style.height = '0%';
    } else if (cooldown > 0) {
      refs.state.textContent = `再召喚まで ${cooldown.toFixed(1)}秒`;
      refs.cover.style.height = `${Math.min(100, cooldown / Math.max(0.01, unit.summonCooldown) * 100)}%`;
    } else if (!canAfford) {
      refs.state.textContent = `ENERGYが${summonCost}必要`;
      refs.cover.style.height = '0%';
    } else {
      refs.state.textContent = '召喚問題に挑戦可能';
      refs.cover.style.height = '0%';
    }
  }

  function refreshUnitButtonAvailability() {
    for (const unit of D.units) {
      const refs = unitButtons.get(unit.id);
      if (refs) updateUnitButtonAvailability(unit, refs);
    }
  }

  function renderUnitButtons() {
    for (const unit of D.units) {
      const refs = unitButtons.get(unit.id);
      if (!refs) continue;

      const stats = upgradedUnitStats(unit);
      const summonCost = effectiveUnitCost(unit);
      refs.level.textContent = `強化Lv.${stats.upgradeLevel}`;
      const roleTip = `<span class="role-tip">${unitRoleDescription(stats)}</span>`;
      refs.stats.innerHTML = roleTip + (stats.flying
        ? `${stats.chemistryLabel}・飛行｜E ${summonCost} ♥${stats.hp} ⚔${Math.round(stats.attack * researchAttackMultiplier({kind:'ally',chemistryClass:stats.chemistryClass}))}<br>✈ 対空可 ◎${stats.range} 自傷なし`
        : stats.healer
        ? `${stats.chemistryLabel}・単体回復｜E ${summonCost} ♥${stats.hp} <span class="healer-power-note">回復${Math.round((stats.healAmount || 0) * researchProduct('healMultiplier'))}</span><br>◎${stats.healRange} ⏱${stats.attackInterval.toFixed(2)}s 再召喚${stats.summonCooldown.toFixed(1)}s`
        : stats.splashRadius
          ? `${stats.chemistryLabel}・範囲｜E ${summonCost} ♥${stats.hp} ⚔${Math.round(stats.attack * researchAttackMultiplier({kind:'ally',chemistryClass:stats.chemistryClass}))}<br>◎${stats.range} 範囲${stats.splashRadius} ⏱${stats.attackInterval.toFixed(1)}s`
          : `${stats.chemistryLabel || '無属性'}｜E ${summonCost} ♥${stats.hp} ⚔${Math.round(stats.attack * researchAttackMultiplier({kind:'ally',chemistryClass:stats.chemistryClass}))}<br>◎${stats.range} ➤${formatStat(stats.speed)} ⏱${stats.attackInterval.toFixed(1)}s`);
      updateUnitButtonAvailability(unit, refs);
    }
  }

  function buildUnitButtons() {
    const area = $('units');
    area.innerHTML = '';
    unitButtons.clear();

    D.units.forEach((unit) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'unit-button';
      button.innerHTML = `
        <span class="unit-formula">${unit.formula}</span>
        <span class="unit-name">${unit.name}｜${unit.role}</span>
        <span class="unit-level"></span>
        <span class="unit-stats"></span>
        <span class="unit-state"></span>
        <span class="cooldown-cover" aria-hidden="true"></span>
      `;
      button.addEventListener('click', () => requestSummon(unit));
      area.appendChild(button);
      unitButtons.set(unit.id, {
        button,
        level: button.querySelector('.unit-level'),
        stats: button.querySelector('.unit-stats'),
        state: button.querySelector('.unit-state'),
        cover: button.querySelector('.cooldown-cover')
      });
    });
  }

  function renderUpgradePanel() {
    const speedResearchCard = $('speedResearchCard');
    if (speedResearchCard) {
      const speed = activeBattleSpeed();
      const tierTwo = battleSpeedRemaining > 0 && battleSpeedMultiplier >= 2.25;
      const tierOne = battleSpeedRemaining > 0 && battleSpeedMultiplier >= 1.5 && !tierTwo;
      const cooldownSeconds = Math.ceil(speedTrialCooldownRemainingMs() / 1000);
      $('speedResearchLevel').textContent = `×${speed.toFixed(2)}`;
      $('speedResearchStats').textContent = cooldownSeconds > 0
        ? `不正解ペナルティ｜再挑戦まであと${cooldownSeconds}秒`
        : tierTwo
          ? `残り ${formatBattleSpeedTime(battleSpeedRemaining)}｜現在の最大速度です。`
          : tierOne
            ? `残り ${formatBattleSpeedTime(battleSpeedRemaining)}｜正解で2.25倍速（残り時間は延長なし）`
            : '専用の難問に正解すると、戦闘中だけ5分間1.5倍速になります。';
      $('speedResearchBtn').textContent = cooldownSeconds > 0 ? `再挑戦まで ${cooldownSeconds}秒` : tierTwo ? '2.25倍速中' : tierOne ? '難問に挑戦して2.25倍速' : '難問に挑戦して1.5倍速';
      $('speedResearchBtn').disabled = paused || gameStatus !== 'playing' || tierTwo || cooldownSeconds > 0;
      speedResearchCard.classList.toggle('active-speed', tierOne || tierTwo);
      speedResearchCard.classList.toggle('tier-two', tierTwo);
    }

    const energyCard = $('energyUpgradeCard');
    if (energyCard) {
      const cost = energyCapacityUpgradeCost();
      $('energyUpgradeLevel').textContent = `Lv.${energyCapacityLevel} / ${maxEnergyCapacityLevel()}`;
      $('energyUpgradeStats').textContent = energyCapacityLevel >= maxEnergyCapacityLevel()
        ? `最大エナジー ${currentMaxEnergy()}（MAX）`
        : `最大 ${currentMaxEnergy()} → ${currentMaxEnergy() + D.energyCapacityPerLevel}`;
      $('energyUpgradeBtn').textContent = cost == null ? '最大強化' : `${cost} COINで難問に挑戦`;
      $('energyUpgradeBtn').disabled = paused || gameStatus !== 'playing' || cost == null;
      energyCard.classList.toggle('maxed', cost == null);
    }

    for (const unit of D.units) {
      const levelElement = $(`upgradeLevel-${unit.id}`);
      if (!levelElement) continue;
      const stats = upgradedUnitStats(unit);
      const cost = unitUpgradeCost(unit);
      const nextLevel = Math.min(D.maxUpgradeLevel, stats.upgradeLevel + 1);
      const nextStats = {
        hp: Math.round(unit.hp * (1 + D.unitUpgradeHpGrowth * (nextLevel - 1))),
        attack: Math.round(unit.attack * (1 + D.unitUpgradeAttackGrowth * (nextLevel - 1))),
        range: unit.range + Math.floor((nextLevel - 1) / D.unitUpgradeRangeEvery)
      };
      levelElement.textContent = `Lv.${stats.upgradeLevel} / ${D.maxUpgradeLevel}`;
      $(`upgradeStats-${unit.id}`).textContent = cost == null
        ? `♥${stats.hp}　⚔${stats.attack}　◎${stats.range}（MAX）`
        : `♥${stats.hp}→${nextStats.hp}　⚔${stats.attack}→${nextStats.attack}　◎${stats.range}→${nextStats.range}`;
      const button = $(`upgradeBtn-${unit.id}`);
      button.textContent = !unlocked.has(unit.id)
        ? '先にユニットを解放'
        : cost == null ? '最大強化' : `${cost} COINで難問に挑戦`;
      button.disabled = paused || gameStatus !== 'playing' || !unlocked.has(unit.id) || cost == null;
      $(`upgradeCard-${unit.id}`).classList.toggle('maxed', cost == null);
      $(`upgradeCard-${unit.id}`).classList.toggle('locked-upgrade', !unlocked.has(unit.id));
    }
  }

  function buildUpgradePanel() {
    $('speedResearchBtn').onclick = requestBattleSpeedChallenge;
    $('energyUpgradeBtn').onclick = requestEnergyCapacityUpgrade;
    const area = $('unitUpgrades');
    area.innerHTML = '';
    for (const unit of D.units) {
      const card = document.createElement('article');
      card.id = `upgradeCard-${unit.id}`;
      card.className = 'upgrade-card';
      card.innerHTML = `
        <div class="upgrade-card-head">
          <div><strong class="upgrade-formula">${unit.formula}</strong><span>${unit.name}</span></div>
          <b id="upgradeLevel-${unit.id}" class="upgrade-level">Lv.1 / 10</b>
        </div>
        <p id="upgradeStats-${unit.id}" class="upgrade-stats"></p>
        <p class="upgrade-note">HP・攻撃力を上げ、一定レベルごとに射程も伸ばします。</p>
        <button id="upgradeBtn-${unit.id}" class="upgrade-button" type="button"></button>
      `;
      card.querySelector('button').addEventListener('click', () => requestUnitUpgrade(unit));
      area.appendChild(card);
    }
    renderUpgradePanel();
  }

  function buildFormulaGuide() {
    const cards = [
      ...D.units.map((item) => ({ formula: item.formula, name: item.name })),
      ...D.enemies.map((item) => ({ formula: item.formula, name: item.name })),
      ...(isStage10() ? [{ formula: '王水', name: '混酸／調製ユニット（単一の分子式なし）' }] : [])
    ];
    $('formulaGuide').innerHTML = cards
      .map((item) => `<div class="formula-card"><strong>${item.formula}</strong><span>${item.name}</span></div>`)
      .join('');
  }

  function serializeEntity(entity) {
    return {
      typeId: entity.typeId,
      x: entity.x,
      y: entity.y,
      hp: entity.hp,
      attackTimer: entity.attackTimer,
      waveIndex: entity.waveIndex,
      visualSerial: entity.visualSerial,
      moveVelocity: finiteNumber(entity.moveVelocity, 0),
      firstStrikeReady: entity.firstStrikeReady,
      bossPhase: entity.bossPhase || 1,
      bossSummonTimer: entity.bossSummonTimer,
      bossSummonPending: Boolean(entity.bossSummonPending),
      bossSummonPendingTimer: entity.bossSummonPendingTimer,
      ambushIntroCompleted: Boolean(entity.ambushIntroCompleted),
      stunTimer: entity.stunTimer,
      multiHit: entity.multiHit ? { ...entity.multiHit } : null,
      goldFoilTimer: entity.goldFoilTimer,
      goldFoilPendingTimer: entity.goldFoilPendingTimer,
      goldCrushPendingTimer: entity.goldCrushPendingTimer,
      goldCrushTargetKey: entity.goldCrushTargetKey,
      stage10Hidden: Boolean(entity.stage10Hidden),
      stage10Protected: Boolean(entity.stage10Protected)
    };
  }

  function restoreAlly(saved, timerFactor = 1) {
    const definition = D.units.find((unit) => unit.id === saved.typeId);
    const ally = saved.typeId === stage10AquaDefinition()?.id ? createAquaRegiaAlly(1) : definition ? createAlly(definition) : null;
    if (!ally) return null;
    ally.x = finiteNumber(saved.x, ally.x);
    ally.y = finiteNumber(saved.y, ally.y);
    ally.hp = clamp(finiteNumber(saved.hp, ally.maxHp), 0, ally.maxHp);
    ally.attackTimer = Math.max(0, finiteNumber(saved.attackTimer, 0) * timerFactor);
    if (typeof saved.firstStrikeReady === 'boolean') ally.firstStrikeReady = saved.firstStrikeReady;
    ally.stunTimer = Math.max(0, finiteNumber(saved.stunTimer, 0));
    if (ally.aquaRegia && saved.multiHit && typeof saved.multiHit === 'object') {
      ally.multiHit = {
        targetKey: String(saved.multiHit.targetKey || ''),
        hitsRemaining: clamp(Math.floor(finiteNumber(saved.multiHit.hitsRemaining, 0)), 0, ally.hitCount),
        nextHitIn: Math.max(0, finiteNumber(saved.multiHit.nextHitIn, 0)),
        totalHits: ally.hitCount
      };
      if (!ally.multiHit.targetKey || ally.multiHit.hitsRemaining < 1) ally.multiHit = null;
    }
    ally.visualSerial = Math.max(0, Math.floor(finiteNumber(saved.visualSerial, ally.visualSerial)));
    return ally;
  }

  function restoreEnemy(saved, timerFactor = 1) {
    const definition = D.enemies.find((enemy) => enemy.id === saved.typeId);
    if (!definition) return null;
    const savedWaveIndex = clamp(Math.floor(finiteNumber(saved.waveIndex, currentWaveIndex)), 0, D.waves.length - 1);
    const enemy = createEnemy(definition, savedWaveIndex);
    if (Math.floor(finiteNumber(saved.bossPhase, 1)) >= 2) transformBossToSecondPhase(enemy, { announce: false });
    enemy.x = finiteNumber(saved.x, enemy.x);
    enemy.y = finiteNumber(saved.y, enemy.y);
    enemy.hp = clamp(finiteNumber(saved.hp, enemy.maxHp), 0, enemy.maxHp);
    enemy.attackTimer = Math.max(0, finiteNumber(saved.attackTimer, 0) * timerFactor);
    enemy.bossSummonTimer = Math.max(0, finiteNumber(saved.bossSummonTimer, enemy.bossSummonTimer));
    enemy.bossSummonPending = Boolean(saved.bossSummonPending);
    enemy.bossSummonPendingTimer = Math.max(0, finiteNumber(saved.bossSummonPendingTimer, 0));
    enemy.goldFoilTimer = Math.max(0, finiteNumber(saved.goldFoilTimer, enemy.goldFoilTimer));
    enemy.goldFoilPendingTimer = Math.max(0, finiteNumber(saved.goldFoilPendingTimer, 0));
    enemy.goldCrushPendingTimer = Math.max(0, finiteNumber(saved.goldCrushPendingTimer, 0));
    enemy.goldCrushTargetKey = String(saved.goldCrushTargetKey || '');
    enemy.stage10Hidden = Boolean(saved.stage10Hidden);
    enemy.stage10Protected = Boolean(saved.stage10Protected);
    if (enemy.wipeAlliesOnArrival) enemy.ambushIntroCompleted = Boolean(saved.ambushIntroCompleted);
    enemy.visualSerial = Math.max(0, Math.floor(finiteNumber(saved.visualSerial, enemy.visualSerial)));
    enemy.moveVelocity = finiteNumber(saved.moveVelocity, 0);
    return enemy;
  }

  function saveGame({ silent = false } = {}) {
    if (isTimeAttackActive()) {
      if (!silent) setSaveStatus('タイムアタック中は通常セーブを変更しません');
      return false;
    }
    if (activeQuiz) {
      if (!silent) setSaveStatus('クイズ終了後に保存してください');
      return false;
    }

    rememberCurrentStageProgress();
    const payload = {
      saveVersion: D.version,
      currentStageId,
      stageProgress: JSON.parse(JSON.stringify(stageProgress)),
      tuningVersion: D.tuningVersion,
      waveSystemVersion: D.waveSystemVersion,
      savedAt: new Date().toISOString(),
      progress: {
        coins,
        unlocked: [...unlocked],
        chemistryExperience: experience,
        chemistryLevel: level,
        selectedScope,
        energyCapacityLevel,
        unitUpgradeLevels: { ...unitUpgradeLevels },
        cumulativeStats: { ...cumulativeStats },
        achievementState: JSON.parse(JSON.stringify(achievementState)),
        onboardingSeen,
        tutorialSeen,
        mockExamProgress: JSON.parse(JSON.stringify(mockExamProgress)),
        guestAssistEnabled,
        guestAssistUsed,
        timeAttack: JSON.parse(JSON.stringify(timeAttackProfile || defaultTimeAttackProfile()))
      },
      battle: {
        energy,
        allyBaseHp,
        enemyBaseHp,
        allies: allies.map(serializeEntity),
        enemies: enemies.map(serializeEntity),
        summonTimers: { ...summonTimers },
        gameTime,
        gameStatus,
        manualPaused,
        resumePrompt: manualPaused || resumePromptPending,
        pauseReason,
        speedBoost: { multiplier: activeBattleSpeed(), remaining: battleSpeedRemaining },
        speedTrialRetryAt: Math.max(speedTrialRetryAt, storedSpeedTrialRetryAt()),
        runStats: { ...runStats },
        mockReward: activeMockReward ? { ...activeMockReward } : null,
        research: {
          activeCards: [...activeResearchCards],
          claimedWaves: [...researchCardClaimedWaves],
          introSeen: researchCardIntroSeen
        },
        stage10: isStage10() ? JSON.parse(JSON.stringify(stage10State || defaultStage10State())) : null,
        wave: {
          currentWaveIndex,
          nextWaveEnemyIndex,
          wavePhase,
          waveTimer,
          waveSpawnTimer,
          waveBannerTimer,
          waveMilestoneClaims: [...waveMilestoneClaims],
          allySpawnSerial,
          enemySpawnSerial,
          finalBaseMessageShown,
          endlessMode,
          endlessWaveTimer,
          endlessWaveNumber
        }
      }
    };

    try {
      localStorage.setItem(D.saveKey, JSON.stringify(payload));
      setSaveStatus(`保存済み ${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`);
      return true;
    } catch (error) {
      console.error(error);
      setSaveStatus('保存に失敗しました');
      return false;
    }
  }

  function loadProgress(parsed) {
    const validUnitIds = new Set(D.units.map((unit) => unit.id));
    const loadedUnlocked = Array.isArray(parsed.progress.unlocked)
      ? parsed.progress.unlocked.filter((id) => validUnitIds.has(id))
      : [];
    unlocked = new Set([...initialUnlockedIds(), ...loadedUnlocked]);
    coins = Math.max(0, Math.floor(finiteNumber(parsed.progress.coins, 0)));

    const loadedStats = parsed.progress.cumulativeStats && typeof parsed.progress.cumulativeStats === 'object'
      ? parsed.progress.cumulativeStats
      : {};
    cumulativeStats = defaultCumulativeStats();
    for (const key of Object.keys(cumulativeStats)) {
      cumulativeStats[key] = Math.max(0, Math.floor(finiteNumber(loadedStats[key], 0)));
    }
    // v0.5.0以前は累計獲得コインを保存していないため、現在所持数を最低保証値として移行する。
    cumulativeStats.totalCoinsEarned = Math.max(cumulativeStats.totalCoinsEarned, coins);
    // v4.4: old saves could have Stage 5 cleared while stage5Clears remained 0.
    // Reconstruct the dedicated metric before evaluating achievements.
    if ((cumulativeStats.highestStageCleared || 0) >= 5) {
      cumulativeStats.stage5Clears = Math.max(1, cumulativeStats.stage5Clears || 0);
      // v4.5: older saves treated Stage 5 as the final stage.
      cumulativeStats.highestStageReached = Math.max(6, cumulativeStats.highestStageReached || 1);
    }
    if ((cumulativeStats.highestStageCleared || 0) >= 6) {
      cumulativeStats.stage6Clears = Math.max(1, cumulativeStats.stage6Clears || 0);
      cumulativeStats.highestStageReached = Math.max(7, cumulativeStats.highestStageReached || 1);
    }
    if ((cumulativeStats.highestStageCleared || 0) >= 7) {
      cumulativeStats.stage7Clears = Math.max(1, cumulativeStats.stage7Clears || 0);
      cumulativeStats.highestStageReached = Math.max(8, cumulativeStats.highestStageReached || 1);
    }
    if ((cumulativeStats.highestStageCleared || 0) >= 8) {
      cumulativeStats.stage8Clears = Math.max(1, cumulativeStats.stage8Clears || 0);
      cumulativeStats.highestStageReached = Math.max(9, cumulativeStats.highestStageReached || 1);
    }
    if ((cumulativeStats.highestStageCleared || 0) >= 9) {
      cumulativeStats.stage9Clears = Math.max(1, cumulativeStats.stage9Clears || 0);
      cumulativeStats.highestStageReached = Math.max(10, cumulativeStats.highestStageReached || 1);
    }
    if ((cumulativeStats.highestStageCleared || 0) >= 10) cumulativeStats.stage10Clears = Math.max(1, cumulativeStats.stage10Clears || 0);
    if ((cumulativeStats.highestStageCleared || 0) === 0 && cumulativeStats.totalClears > 0) {
      cumulativeStats.highestStageCleared = 1;
      cumulativeStats.highestStageReached = 2;
      cumulativeStats.stage1Clears = Math.max(cumulativeStats.stage1Clears || 0, cumulativeStats.totalClears);
    }
    achievementState = normalizeAchievementState(parsed.progress.achievementState);
    guestAssistEnabled = Boolean(parsed.progress.guestAssistEnabled);
    guestAssistUsed = Boolean(parsed.progress.guestAssistUsed || guestAssistEnabled);
    timeAttackProfile = normalizeTimeAttackProfile(parsed.progress.timeAttack, cumulativeStats);
    if (isStage10()) {
      const stage10Progress = parsed.stageProgress?.['10'] || parsed.stageProgress?.[10] || {};
      aquaRegiaUnlocked = Boolean(stage10Progress.aquaRegiaUnlocked);
      aquaRegiaLevel = clamp(Math.floor(finiteNumber(stage10Progress.aquaRegiaLevel, 1)), 1, 10);
      aquaAuContactComplete = Boolean(stage10Progress.aquaAuContactComplete);
    }
    updateGuestAssistUi();
    onboardingSeen = Boolean(parsed.progress.onboardingSeen);
    tutorialSeen = parsed.progress.tutorialSeen === undefined ? onboardingSeen : Boolean(parsed.progress.tutorialSeen);
    mockExamProgress = normalizeMockExamProgress(parsed.progress.mockExamProgress);

    energyCapacityLevel = clamp(
      Math.floor(finiteNumber(parsed.progress.energyCapacityLevel, 1)),
      1,
      maxEnergyCapacityLevel()
    );

    const loadedUpgradeLevels = parsed.progress.unitUpgradeLevels && typeof parsed.progress.unitUpgradeLevels === 'object'
      ? parsed.progress.unitUpgradeLevels
      : {};
    unitUpgradeLevels = defaultUnitUpgradeLevels();
    for (const unit of D.units) {
      unitUpgradeLevels[unit.id] = clamp(
        Math.floor(finiteNumber(loadedUpgradeLevels[unit.id], 1)),
        1,
        D.maxUpgradeLevel
      );
    }

    if (Number.isFinite(parsed.progress.chemistryExperience)) {
      experience = clamp(
        Math.floor(parsed.progress.chemistryExperience),
        0,
        D.levelXpThresholds[D.maxLevel - 1]
      );
    } else {
      const legacyLevel = clamp(
        Math.floor(finiteNumber(parsed.progress.chemistryLevel ?? parsed.battle?.level, 1)),
        1,
        D.maxLevel
      );
      experience = D.levelXpThresholds[legacyLevel - 1];
    }
    level = levelFromExperience(experience);
    if (D.scopeModes.some((mode) => mode.id === parsed.progress.selectedScope)) selectedScope = parsed.progress.selectedScope;
    updateScopeButton();
  }

  function migrateSaveData(input) {
    const parsed = input && typeof input === 'object' ? input : {};
    const sourceVersion = Math.floor(finiteNumber(parsed.saveVersion, 0));
    let repaired = false;
    parsed.progress = parsed.progress && typeof parsed.progress === 'object' ? parsed.progress : {};
    parsed.battle = parsed.battle && typeof parsed.battle === 'object' ? parsed.battle : {};
    parsed.progress.cumulativeStats = parsed.progress.cumulativeStats && typeof parsed.progress.cumulativeStats === 'object'
      ? parsed.progress.cumulativeStats
      : {};
    const savedStats = parsed.progress.cumulativeStats;
    if (finiteNumber(savedStats.highestStageCleared, 0) >= 5 && finiteNumber(savedStats.stage5Clears, 0) < 1) {
      savedStats.stage5Clears = 1;
      savedStats.highestStageReached = Math.max(6, finiteNumber(savedStats.highestStageReached, 1));
      repaired = true;
    }
    if (finiteNumber(savedStats.highestStageCleared, 0) >= 6) {
      savedStats.stage6Clears = Math.max(1, finiteNumber(savedStats.stage6Clears, 0));
      savedStats.highestStageReached = Math.max(7, finiteNumber(savedStats.highestStageReached, 1));
      repaired = true;
    }
    if (finiteNumber(savedStats.highestStageCleared, 0) >= 7) {
      savedStats.stage7Clears = Math.max(1, finiteNumber(savedStats.stage7Clears, 0));
      savedStats.highestStageReached = Math.max(8, finiteNumber(savedStats.highestStageReached, 1));
      repaired = true;
    }
    if (finiteNumber(savedStats.highestStageCleared, 0) >= 8) {
      savedStats.stage8Clears = Math.max(1, finiteNumber(savedStats.stage8Clears, 0));
      savedStats.highestStageReached = Math.max(9, finiteNumber(savedStats.highestStageReached, 1));
      repaired = true;
    }
    if (finiteNumber(savedStats.highestStageCleared, 0) >= 9) {
      savedStats.stage9Clears = Math.max(1, finiteNumber(savedStats.stage9Clears, 0));
      savedStats.highestStageReached = Math.max(10, finiteNumber(savedStats.highestStageReached, 1));
      repaired = true;
    }
    if (finiteNumber(savedStats.highestStageCleared, 0) >= 10) {
      savedStats.stage10Clears = Math.max(1, finiteNumber(savedStats.stage10Clears, 0));
      repaired = true;
    }
    parsed.progress.mockExamProgress = normalizeMockExamProgress(parsed.progress.mockExamProgress);
    parsed.progress.timeAttack = normalizeTimeAttackProfile(parsed.progress.timeAttack, savedStats);
    if (parsed.progress.timeAttack.officialRunInProgress) {
      parsed.progress.timeAttack.officialRunInProgress = false;
      parsed.progress.timeAttack.currentRunId = '';
      parsed.progress.timeAttack.runInvalid = true;
      parsed.progress.timeAttack.lastInvalidReason = 'ページ再読み込みまたはアプリ終了により走行を無効化しました。';
      repaired = true;
    }
    parsed.battle.research = parsed.battle.research && typeof parsed.battle.research === 'object'
      ? parsed.battle.research
      : { activeCards: [], claimedWaves: [], introSeen: false };
    parsed.battle.speedTrialRetryAt = Math.max(0, finiteNumber(parsed.battle.speedTrialRetryAt, 0));
    parsed.battle.mockReward = normalizeMockReward(parsed.battle.mockReward);
    parsed.saveVersion = D.version;
    return { parsed, sourceVersion, repaired, migrated: sourceVersion !== D.version || repaired };
  }

  function loadGame({ silent = false } = {}) {
    if (isTimeAttackActive()) {
      invalidateTimeAttackRun('セーブ差し替えを検出しました。');
      if (!silent) setSaveStatus('タイムアタック中は通常セーブを読み込みません');
      return false;
    }
    let parsed;
    try {
      const raw = localStorage.getItem(D.saveKey);
      if (!raw) {
        if (!silent) setSaveStatus('セーブデータがありません');
        return false;
      }
      parsed = JSON.parse(raw);
    } catch (error) {
      console.error(error);
      setSaveStatus('セーブデータを読み込めません');
      return false;
    }

    const compatibleSaveVersions = new Set([4, 7, 13, 14, 15, 16, 17, 18, 19, 20, 21, 23, 26, 27, 28, 29, 30, 31, 32, D.version]);
    if (!parsed || !compatibleSaveVersions.has(parsed.saveVersion) || !parsed.progress || !parsed.battle) {
      setSaveStatus('このバージョンでは読めないデータです');
      return false;
    }
    const migration = migrateSaveData(parsed);
    parsed = migration.parsed;

    applyStageDefinition(parsed.currentStageId);
    stageProgress = parsed.stageProgress && typeof parsed.stageProgress === 'object' ? parsed.stageProgress : {};
    buildUnitButtons();
    buildUpgradePanel();
    buildFormulaGuide();
    loadProgress(parsed);
    rememberCurrentStageProgress();

    // v0.4.6以前の無限・ランダム出現セーブは、進行だけ引き継ぎ第1ウェーブから開始する。
    if (parsed.waveSystemVersion !== D.waveSystemVersion || !parsed.battle.wave) {
      resetStage({ keepProgress: true });
      setSaveStatus('旧セーブ移行済み：第1ウェーブから開始');
      showMessage('コインと解放状態を引き継ぎ、時間制ウェーブの第1ウェーブから開始しました。', 4.5);
      saveGame({ silent: true });
      return true;
    }

    const savedTuningVersion = Number.isFinite(parsed.tuningVersion) ? parsed.tuningVersion : 0;
    let attackTimerFactor = 1;
    let summonTimerFactor = 1;

    if (savedTuningVersion === 2) {
      attackTimerFactor = 2 / 3;
    } else if (savedTuningVersion < 2) {
      attackTimerFactor = 2;
      summonTimerFactor = 3;
    }

    const waveSave = parsed.battle.wave;
    stage10State = isStage10() ? normalizeStage10State(parsed.battle.stage10) : defaultStage10State();
    currentWaveIndex = clamp(Math.floor(finiteNumber(waveSave.currentWaveIndex, 0)), 0, D.waves.length - 1);
    const wave = currentWave();
    nextWaveEnemyIndex = clamp(Math.floor(finiteNumber(waveSave.nextWaveEnemyIndex, 0)), 0, wave.enemies.length);
    wavePhase = ['announcement', 'spawning', 'waiting', 'fighting', 'intermission', 'research', 'finalBase'].includes(waveSave.wavePhase)
      ? waveSave.wavePhase
      : 'announcement';
    waveTimer = Math.max(0, finiteNumber(waveSave.waveTimer, D.waveAnnouncementDuration));
    waveSpawnTimer = Math.max(0, finiteNumber(waveSave.waveSpawnTimer, 0));
    waveBannerTimer = Math.max(0, finiteNumber(waveSave.waveBannerTimer, 0));
    const savedMilestones = Array.isArray(waveSave.waveMilestoneClaims)
      ? waveSave.waveMilestoneClaims
      : Object.keys(D.waveMilestoneCoinRewards || {}).map(Number).filter((waveNumber) => waveNumber <= currentWaveIndex + 1);
    waveMilestoneClaims = new Set(savedMilestones.map((value) => Math.floor(finiteNumber(value, 0))).filter((value) => value > 0));
    allySpawnSerial = Math.max(0, Math.floor(finiteNumber(waveSave.allySpawnSerial, 0)));
    enemySpawnSerial = Math.max(0, Math.floor(finiteNumber(waveSave.enemySpawnSerial, 0)));
    finalBaseMessageShown = Boolean(waveSave.finalBaseMessageShown);
    endlessMode = Boolean(waveSave.endlessMode);
    endlessWaveTimer = Math.max(0, finiteNumber(waveSave.endlessWaveTimer, 30));
    endlessWaveNumber = Math.max(0, Math.floor(finiteNumber(waveSave.endlessWaveNumber, 0)));

    const savedResearch = parsed.battle.research && typeof parsed.battle.research === 'object' ? parsed.battle.research : {};
    const validResearchIds = new Set((D.researchCards || []).map((card) => card.id));
    activeResearchCards = Array.isArray(savedResearch.activeCards) ? savedResearch.activeCards.filter((id) => validResearchIds.has(id)) : [];
    researchCardClaimedWaves = new Set(Array.isArray(savedResearch.claimedWaves) ? savedResearch.claimedWaves.map((value) => Math.floor(finiteNumber(value, 0))).filter((value) => [3,6,9].includes(value)) : []);
    researchCardIntroSeen = Boolean(savedResearch.introSeen);
    pendingResearchWave = 0;
    activeMockReward = normalizeMockReward(parsed.battle.mockReward);
    renderResearchLoadout();

    const savedSpeedBoost = parsed.battle.speedBoost && typeof parsed.battle.speedBoost === 'object' ? parsed.battle.speedBoost : {};
    battleSpeedRemaining = Math.max(0, finiteNumber(savedSpeedBoost.remaining, 0));
    const savedSpeedMultiplier = finiteNumber(savedSpeedBoost.multiplier, 1);
    battleSpeedMultiplier = battleSpeedRemaining > 0 && savedSpeedMultiplier >= 2.25 ? 2.25 : battleSpeedRemaining > 0 && savedSpeedMultiplier >= 1.5 ? 1.5 : 1;
    speedTrialRetryAt = Math.max(0, finiteNumber(parsed.battle.speedTrialRetryAt, 0), storedSpeedTrialRetryAt());
    speedTrialCooldownRemainingMs();

    energy = clamp(finiteNumber(parsed.battle.energy, D.startingEnergy), 0, currentMaxEnergy());
    allyBaseHp = clamp(finiteNumber(parsed.battle.allyBaseHp, D.allyBaseHp), 0, D.allyBaseHp);
    enemyBaseHp = clamp(finiteNumber(parsed.battle.enemyBaseHp, D.enemyBaseHp), 0, D.enemyBaseHp);
    allies = Array.isArray(parsed.battle.allies)
      ? parsed.battle.allies.map((saved) => restoreAlly(saved, attackTimerFactor)).filter(Boolean)
      : [];
    enemies = Array.isArray(parsed.battle.enemies)
      ? parsed.battle.enemies.map((saved) => restoreEnemy(saved, attackTimerFactor)).filter(Boolean).slice(0, D.maxEnemiesOnField)
      : [];
    summonTimers = Object.fromEntries(D.units.map((unit) => {
      const restored = Math.max(0, finiteNumber(parsed.battle.summonTimers?.[unit.id], 0) * summonTimerFactor);
      return [unit.id, restored <= SUMMON_READY_EPSILON ? 0 : restored];
    }));
    summonUiRefreshTimer = 0;
    gameTime = Math.max(0, finiteNumber(parsed.battle.gameTime, 0));
    const loadedRunStats = parsed.battle.runStats && typeof parsed.battle.runStats === 'object'
      ? parsed.battle.runStats
      : {};
    runStats = defaultRunStats();
    for (const key of Object.keys(runStats)) {
      runStats[key] = Math.max(0, finiteNumber(loadedRunStats[key], 0));
    }
    gameStatus = ['playing', 'victory', 'defeat'].includes(parsed.battle.gameStatus)
      ? parsed.battle.gameStatus
      : 'playing';
    clearBossPhaseTransition({ resume: false });
    activeQuiz = null;
    autoSaveTimer = 0;
    $('modal').hidden = true;
    $('achievementModal').hidden = true;
    $('guideModal').hidden = true;
    $('endModal').hidden = true;
    overlayPauseCount = 0;
    manualPaused = gameStatus === 'playing' && Boolean(parsed.battle.manualPaused || parsed.battle.resumePrompt);
    resumePromptPending = manualPaused;
    pauseReason = manualPaused ? 'restored' : 'manual';
    paused = gameStatus !== 'playing' || manualPaused;

    if (waveBannerTimer > 0 && gameStatus === 'playing') {
      $('waveBannerTitle').textContent = `第${currentWaveIndex + 1}ウェーブ`;
      $('waveBannerSub').textContent = `${currentWave().name}｜全${D.waves.length}ウェーブ`;
      $('waveBanner').hidden = false;
    } else {
      hideWaveBanner();
    }

    if (gameStatus !== 'playing') {
      const victory = gameStatus === 'victory';
      $('endKicker').textContent = victory ? `STAGE ${currentStageId} CLEAR` : 'BASE DESTROYED';
      $('endTitle').textContent = victory ? '勝利！' : '敗北';
      $('endText').textContent = `保存時点の結果です。Stage ${currentStageId}・第${currentWaveIndex + 1}ウェーブ、化学レベル${level}、所持コインは${coins}です。`;
      $('endAchievementLink').textContent = `アチーブメント ${completedAchievementCount()} / ${D.achievementDefinitions.length}`;
      const hasNextStage = victory && Boolean(STAGE_LIBRARY[currentStageId + 1]);
      $('nextStageBtn').hidden = !hasNextStage;
      if (hasNextStage) $('nextStageBtn').textContent = `ステージ${currentStageId + 1}へ進む`;
      $('continuePlayBtn').hidden = !victory;
      $('endStageGuideBtn').hidden = victory;
      $('retryBtn').hidden = victory;
      $('endModal').hidden = false;
    }

    lastTimestamp = performance.now();
    projectiles = [];
    impactBursts = [];
    restoreStage10PresentationAfterLoad();
    if (wavePhase === 'research' && gameStatus === 'playing' && currentStageId >= 3) {
      const completed = [3,6,9].find((waveNumber) => waveNumber === currentWaveIndex) || currentWaveIndex;
      openResearchCardSelection(completed);
    } else if (manualPaused && gameStatus === 'playing') showPauseModal('restored');
    else if ($('pauseModal')) $('pauseModal').hidden = true;
    const pendingAmbushBoss = enemies.find((enemy) => enemy.wipeAlliesOnArrival && !enemy.ambushIntroCompleted && enemy.hp > 0);
    if (pendingAmbushBoss && gameStatus === 'playing') {
      manualPaused = false;
      resumePromptPending = false;
      window.setTimeout(() => beginBossAnnihilationSequence(pendingAmbushBoss, D.enemies.find((item) => item.id === pendingAmbushBoss.typeId)), 120);
    }
    updateHud();
    renderUnitButtons();
    renderUpgradePanel();
    updateAquaRegiaUi();
    evaluateAchievements({ notify: false });
    const savedDate = new Date(parsed.savedAt);
    if (migration.migrated) {
      saveGame({ silent: true });
      setSaveStatus(migration.repaired && migration.sourceVersion === D.version
        ? 'Stage 5実績データを修復済み'
        : `v${migration.sourceVersion}セーブをv${D.version}へ移行済み`);
    } else {
      setSaveStatus(`ロード済み ${Number.isNaN(savedDate.getTime()) ? '' : savedDate.toLocaleString('ja-JP')}`);
    }
    if (!silent) {
      showMessage('セーブデータを読み込みました。');
      if (!tutorialSeen) { tutorialPending = true; setTimeout(maybeStartPendingTutorial, 350); }
    }
    return true;
  }


  function setTransferStatus(message, isError = false) {
    const element = $('transferStatus');
    element.textContent = message || '';
    element.style.color = isError ? '#ffb0b9' : '#bfeeff';
  }

  function bytesToBase64Url(bytes) {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function base64UrlToBytes(value) {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function fallbackTransferHash(text) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    return `f${(hash >>> 0).toString(16).padStart(8, '0')}`;
  }

  async function transferHash(text, requestedAlgorithm = '') {
    if ((requestedAlgorithm === '' || requestedAlgorithm === 's') && window.crypto?.subtle) {
      const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      return `s${hex.slice(0, 24)}`;
    }
    return fallbackTransferHash(text);
  }

  function transferStorageSnapshot() {
    return {
      save: localStorage.getItem(D.saveKey),
      review: localStorage.getItem(REVIEW_KEY),
      learning: localStorage.getItem(LEARNING_KEY),
      nickname: localStorage.getItem(TRANSFER_NICK_KEY),
      onlineSeen: localStorage.getItem(TRANSFER_ONLINE_SEEN_KEY),
      sound: localStorage.getItem(SOUND_KEY),
      bgm: localStorage.getItem(BGM_KEY),
      bgmVolume: localStorage.getItem(BGM_VOLUME_KEY),
      lowPower: localStorage.getItem(LOW_POWER_KEY)
    };
  }

  async function createTransferCode() {
    if (!saveGame({ silent: true })) {
      setTransferStatus('クイズを閉じてからコードを作成してください。', true);
      return;
    }
    const snapshot = transferStorageSnapshot();
    const bundle = { format: 'CHEMION_SAVE_CODE', schema: 1, exportedAt: new Date().toISOString(), storage: snapshot };
    const json = JSON.stringify(bundle);
    const payload = bytesToBase64Url(new TextEncoder().encode(json));
    const digest = await transferHash(json);
    const code = `CQ33.${digest}.${payload}`;
    $('transferCode').value = code;
    setTransferStatus(`セーブコードを作成しました（${code.length.toLocaleString('ja-JP')}文字）。新しい端末で同じ画面へ貼り付けてください。`);
  }

  async function copyTransferCode() {
    const code = $('transferCode').value.trim();
    if (!code) { setTransferStatus('先にコードを作成するか、入力欄へ貼り付けてください。', true); return; }
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(code);
      setTransferStatus('コードをクリップボードへコピーしました。');
    } catch (error) {
      $('transferCode').focus();
      $('transferCode').select();
      setTransferStatus('自動コピーできませんでした。入力欄を選択したので、端末のコピー操作を使ってください。', true);
    }
  }

  function writeTransferValue(key, value) {
    if (typeof value === 'string') localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  }

  async function importTransferCode() {
    if (isTimeAttackActive()) {
      invalidateTimeAttackRun('セーブ差し替え操作を検出しました。');
      setTransferStatus('タイムアタック中はセーブを復元できません。', true);
      return;
    }
    const code = $('transferCode').value.replace(/\s+/g, '');
    const match = /^CQ33\.([sf][0-9a-f]+)\.([A-Za-z0-9_-]+)$/.exec(code);
    if (!match) { setTransferStatus('コード形式が正しくありません。先頭がCQ33.のコードをすべて貼り付けてください。', true); return; }
    try {
      const json = new TextDecoder().decode(base64UrlToBytes(match[2]));
      const expected = await transferHash(json, match[1][0]);
      if (expected !== match[1]) throw new Error('checksum mismatch');
      const bundle = JSON.parse(json);
      if (bundle?.format !== 'CHEMION_SAVE_CODE' || bundle?.schema !== 1 || typeof bundle.storage?.save !== 'string') throw new Error('invalid bundle');
      const importedSave = JSON.parse(bundle.storage.save);
      if (!importedSave?.progress || !importedSave?.battle || !importedSave?.stageProgress) throw new Error('invalid save');
      const accepted = confirm('現在のセーブデータを上書きして、このコードから復元しますか？');
      if (!accepted) return;
      try { localStorage.setItem(TRANSFER_BACKUP_KEY, JSON.stringify({ backedUpAt: new Date().toISOString(), storage: transferStorageSnapshot() })); } catch (_) {}
      importedSave.battle.manualPaused = true;
      importedSave.battle.resumePrompt = true;
      importedSave.battle.pauseReason = 'restored';
      localStorage.setItem(D.saveKey, JSON.stringify(importedSave));
      writeTransferValue(REVIEW_KEY, bundle.storage.review);
      writeTransferValue(LEARNING_KEY, bundle.storage.learning);
      writeTransferValue(TRANSFER_NICK_KEY, bundle.storage.nickname);
      writeTransferValue(TRANSFER_ONLINE_SEEN_KEY, bundle.storage.onlineSeen);
      writeTransferValue(SOUND_KEY, bundle.storage.sound);
      writeTransferValue(BGM_KEY, bundle.storage.bgm);
      writeTransferValue(BGM_VOLUME_KEY, bundle.storage.bgmVolume);
      writeTransferValue(LOW_POWER_KEY, bundle.storage.lowPower);
      soundEnabled = localStorage.getItem(SOUND_KEY) !== 'off';
      bgmEnabled = localStorage.getItem(BGM_KEY) !== 'off';
      const importedBgmVolumeRaw = localStorage.getItem(BGM_VOLUME_KEY);
      const importedBgmVolume = importedBgmVolumeRaw === null ? NaN : Number(importedBgmVolumeRaw);
      bgmVolume = Number.isFinite(importedBgmVolume) ? clamp(importedBgmVolume, 0, 1) : 0.35;
      lowPowerMode = localStorage.getItem(LOW_POWER_KEY) === 'on';
      updateSoundButtons();
      updateMusicControls();
      updatePowerControls();
      syncBgmPlayback();
      $('transferModal').hidden = true;
      $('settingsModal').hidden = true;
      const loaded = loadGame({ silent: false });
      if (!loaded) throw new Error('load failed');
      window.dispatchEvent(new CustomEvent('cq-save-imported'));
      setSaveStatus('セーブコードから復元しました');
      showMessage('別端末のセーブデータを復元しました。中断地点から再開できます。', 4.5);
    } catch (error) {
      console.error(error);
      setTransferStatus('コードが壊れているか、このバージョンでは読み込めません。コード全体をコピーし直してください。', true);
    }
  }

  function openTransferModal() {
    $('settingsModal').hidden = true;
    $('transferModal').hidden = false;
    $('transferCode').value = '';
    setTransferStatus('元の端末では「現在のコードを作成」、新しい端末ではコードを貼り付けて「復元」を押します。');
    pauseForOverlay();
  }

  function closeTransferToSettings() {
    $('transferModal').hidden = true;
    $('settingsModal').hidden = false;
    pauseForOverlay();
  }

  function closeTransferModal() {
    $('transferModal').hidden = true;
    resumeFromOverlay();
  }

  function deleteSave() {
    if (isTimeAttackActive()) {
      invalidateTimeAttackRun('セーブ削除操作を検出しました。');
      return;
    }
    const accepted = window.confirm('セーブデータを削除し、コイン・化学レベル・解放・研究強化をすべて初期化しますか？');
    if (!accepted) return;

    localStorage.removeItem(D.saveKey);
    localStorage.removeItem(REVIEW_KEY);
    localStorage.removeItem(LEARNING_KEY);
    localStorage.removeItem(SPEED_TRIAL_RETRY_KEY);
    guestAssistEnabled = false;
    guestAssistUsed = false;
    aquaRegiaUnlocked = false;
    aquaRegiaLevel = 1;
    aquaAuContactComplete = false;
    stage10State = defaultStage10State();
    timeAttackProfile = defaultTimeAttackProfile();
    updateGuestAssistUi();
    speedTrialRetryAt = 0;
    mockExamProgress = defaultMockExamProgress();
    activeMockReward = null;
    stageProgress = {};
    applyStageDefinition(1);
    buildUnitButtons();
    buildUpgradePanel();
    buildFormulaGuide();
    resetStage({ keepProgress: false });
    setSaveStatus('セーブデータを削除しました');
    tutorialSeen = false;
    tutorialPending = true;
    setTimeout(maybeStartPendingTutorial, 250);
  }

  const updateNotices = [
    __CURRENT_UPDATE_NOTICE__,
    {version:'v5.4',title:'Stage 9・遠距離攻撃禁止',body:'Stage 9「近接反応・射程封鎖区」を追加しました。遠距離攻撃ユニットは召喚不可となり、Mg・Al・Fe・H₂OでBOSS BaSO₄を攻略します。',isNew:false},
    {version:'v5.3',title:'Stage攻略情報',body:'Stage選択画面と敗北画面へ攻略情報を追加し、敗北回数に応じて段階的に具体化するヒントと敗北分析を実装しました。',isNew:false},
    {version:'v5.2',title:'安全な単一ZIP公開',body:'公開物を完全性検査付きchemion-release.zipへ統一し、破損や版不一致がある場合は公開を停止する方式へ移行しました。',isNew:false},
    {version:'v5.1',title:'学習データを一から取り直す',body:'設定と学習記録画面に、ゲーム進行を維持したまま正誤履歴・習熟度・復習予定・間違い復習だけを初期化する機能を追加しました。確認語の入力で誤操作も防ぎます。',isNew:false},
    {version:'v5.0',title:'Stage 8・蓄積急襲BOSS',body:'Stage 8「蓄積急襲区」を追加しました。Wave 10では味方が全消去され、通常BOSS級ではないHPとLv.MAX強襲型を上回る速度を持つO₃へ、蓄えたEnergyから再展開して挑みます。',isNew:false},
    {version:'v4.6',title:'Stage 7・弱塩基の遊離',body:'Stage 6の塩基版として、弱塩基由来陽イオン100％のStage 7を追加しました。第5ユニットKOHの強塩基が1.4倍になり、BOSSは予告後に増援を召集します。',isNew:false},
    {version:'v4.5',title:'半反応式・飛行型調整・Stage 6',body:'半反応式の基本40問・難問30問を追加し、飛行型の時間経過自傷を廃止しました。弱酸由来陰イオン100％のStage 6と、増援を召集するBOSSを追加しました。',isNew:false},
    {version:'v4.45',title:'全員で要望を管理',body:'v4.4の修正を統合し、管理者登録方式を廃止しました。ログイン済みの全ユーザーが、すべての要望を実装済み／検討中へ変更し、確認後に削除できます。',isNew:false},
    {version:'v4.4',title:'要望管理・飛行表示・進行バグ修正',body:'要望の実装済み切替と削除、飛行型の表示位置上昇、Stage 5実績の旧セーブ修復、再生産クールタイム表示と実際の召喚可否の同期を追加しました。',isNew:false},
    {version:'v4.3',title:'化学相性と反応表記を修正',body:'弱酸・弱塩基そのものではなく、弱酸由来陰イオン・弱塩基由来陽イオンに対してのみ遊離相性が発生するよう修正しました。反応式・物質名・H₂O₂・Stage 3 BOSSも化学監査しました。',isNew:false},
    {version:'v4.2',title:'第二形態BOSS演出',body:'第1形態撃破時に戦闘全体を停止し、専用変身演出、第二形態への変化、通常BOSS出現演出を順番に再生してから戦闘を再開するようにしました。',isNew:false},
    {version:'v4.1',title:'BOSS出現演出',body:'全StageのBOSS出現時に、黒い圧力波、暗転、画面振動、専用表示、Web Audioによる低音を組み合わせた独自演出を追加しました。',isNew:false},
    {version:'v4.0',title:'総合完成・問題品質アップデート',body:'基本480問・難問250問・実戦8大問40小問へ増量し、問題メタデータ・選択肢別解説・数値誤答監査を追加。過去機能監査、旧セーブ移行、開発ソース分割、自動回帰検査も行いました。',isNew:false},
    {version:'v3.95',title:'Wave 1再開・倍速試験制限',body:'ポーズ画面から同じStageのWave 1へやり直す機能と、倍速試験の不正解後30秒間は再挑戦できない制限を追加しました。再読み込みによる回避も防止します。',isNew:false},
    {version:'v3.9',title:'共通テスト型実戦問題',body:'共通テスト型の実戦問題を追加し、合格点、初回・再挑戦報酬、次のバトル1回だけ有効なEnergy・回復・コイン報酬を選べるようにしました。',isNew:false},
    {version:'v3.8',title:'長期記憶・出題タイミング最適化',body:'画面や操作を増やさず、問題ごとの正誤と経過時間に応じて出題優先度を調整します。誤答は約12時間後、正答は3日・7日・14日・30日・45〜60日後を目安に再出題し、同一30問・近似20問・類題8問の短時間連続防止も維持します。',isNew:false},
    {version:'v3.7',title:'開発・検査・配布作業の効率化',body:'問題データ、版情報、ゲーム本体テンプレートを分離し、1コマンドで生成・検査・配布ZIP作成まで行える開発基盤へ整理しました。プレイヤー向けのゲーム内容は変更していません。',isNew:false},
    {version:'v3.6.1',title:'旧版継続を禁止する必須アップデート',body:'新しい版を検出した場合は戦闘と画面操作を停止し、進行を保存して自動的に最新版へ切り替えるようにしました。「あとで」は廃止し、更新準備中もゲームを続けられません。オンライン中は5分ごと、画面へ戻った際は1分以上経過していれば最新版を確認します。',isNew:true},
    {version:'v3.6',title:'公開安定化・PWA・更新通知',body:'Webアプリ用マニフェストとService Workerを追加し、一度オンラインで読み込んだ後はオフラインでもゲーム本体を起動できるようにしました。対応ブラウザーではホーム画面へ追加できます。GitHub Actions用の自動検査・公開ワークフローも同梱しました。'},
    {version:'v3.5',title:'同じ・似た問題の連続防止と難問40問追加',body:'同一問題は直近30問、文章が近い類題は直近20問、同じ計算パターンは直近8問を避けて抽選します。候補が不足した場合だけ段階的に制限を緩めます。難問を142問から182問へ増やし、追加問題は公式公開ページを参考資料として確認した上で本文・数値・選択肢を独自作成しました。難問画面には「出典・参考資料」を明記します。',isNew:true},
    {version:'v3.4',title:'問題表示・クリア後再挑戦・専用倍速試験',body:'化学式直後の句点が元素記号に見える問題を防ぐため、問題文では化学式・反応式の直後を改行区切りにしました。ステージクリア後の継続プレイは場のユニットを残さず、第1ウェーブから再開します。倍速はユニット解放・強化などの難問では自動発動せず、研究強化の専用「倍速試験」に正解した場合だけ発動します。',isNew:false},
    {version:'v3.3',title:'ヒーラー強化・操作チュートリアル・セーブコード',body:'後半解放の味方ヒーラーを高性能な単体回復型へ再設計し、強化レベルで回復量も伸びるようにしました。BOSSは飛行型へ攻撃可能になりました。初回はスキップ可能な実操作チュートリアルを表示し、設定から再受講できます。セーブコードで別端末へ進行・学習記録・復習記録を移行できます。',isNew:false},
    {version:'v3.2',title:'Stage 5・飛行型・難関ステージ',body:'5の倍数を難関ステージとして明示し、Stage 5「統合反応・飛行研究区」を追加。飛行・歩兵・弓兵・盾兵・強襲・範囲・回復と全属性の敵が登場します。飛行型は近接攻撃を受けず、対空攻撃に弱く、時間とともにHPが減少します。Stage 5専用難問22問も追加しました。',isNew:true},
    {version:'v3.1',title:'倍速研究・全メニュー停止・編成バランス改善',body:'バトル中の難問正解で1.5倍速を5分間獲得し、効果中の再正解で2.25倍速へ強化。設定・ランキング・学習画面など全モーダルで戦闘と倍速残り時間を停止します。歩兵連打だけでなく、弓兵・盾兵・強襲・範囲・回復の混成編成が成立するよう全Stageを再調整しました。',isNew:true},
    {version:'v3.0',title:'Stage 4・研究カード・相性と戦場デザインを大型更新',body:'Stage 4「気体・溶液研究区」を追加。Stage 3以降はWave 3・6・9終了後に研究カードを選択できます。相性補正は味方の有利時だけになり、同じ化学式が別ステージに登場してもステージ固有の別ユニットとして成長します。問題は基本320問・難問120問へ増加し、モル質量の対象を明記しました。',isNew:true},
    {version:'v2.7',title:'問題範囲・4択・長文難問を全面調整',body:'既定範囲を化学基礎＋電気分解＋結晶に固定し、ボイルの法則・エンタルピーなどは理論化学全範囲（予習）選択時だけ出題します。全問題を4択化し、選択肢順を毎回シャッフル。召喚用の予習問題50問と、長文の大学二次型難問20問を追加しました。',isNew:true},
    {version:'v2.6',title:'バトル画面のステータス表示を整理',body:'全分子の大きなステータス背景を廃止しました。通常は化学式を優先し、HPバーはダメージ時だけ表示します。前線の詳細は左上に自動表示され、分子をタップすると12秒固定できます。',isNew:true},
    {version:'v2.5',title:'バトルの中断再開・効果音・攻撃演出',body:'ウェーブ中の手動ポーズ、画面を閉じる前の自動停止保存、再開画面を追加しました。効果音はいつでも消音可能です。H⁺・OH⁻・e⁻の飛翔、着弾、回復、攻撃発光により戦闘の動きも分かりやすくしました。',isNew:false},
    {version:'v2.4',title:'成長速度と再挑戦の負担を改善',body:'初期エナジー65、基本回復1.00/秒へ上昇。敵コイン・ウェーブ到達ボーナス・敗北時の研究支援コインを追加し、難問失敗時は挑戦料の半分を返金します。Stage 1後半ユニットの解放費用と強化費用の伸びも緩和しました。',isNew:true},
    {version:'v2.35',title:'縦画面表示と強襲型の速度を調整',body:'縦画面で上部に固定表示されていた横画面推奨バナーを削除しました。強襲型のHNO₃とHBrは移動速度が従来の2倍になりました。',isNew:false},
    {version:'v2.3',title:'Stage 3と二段階BOSSを追加',body:'Stage 2クリア後に酸化還元反応区が解放されます。BOSSは第1形態を倒すと化学式・属性・能力を変えて復活します。',isNew:false},
    {version:'v2.21',title:'指数表記を日本の教科書形式へ統一',body:'コンピューター向けの指数表記を、1.5×10²³のような高校化学で一般的な表記へ修正しました。問題文・選択肢・解説・ヒント・復習画面に適用されます。',isNew:false},
    {version:'v2.2',title:'二次試験型問題を指定範囲へ適正化',body:'ヘンリーの法則、蒸気圧、化学平衡など指定範囲外の難問を削除し、化学基礎・電気分解・化学範囲の結晶だけに統一しました。Stage 1・Stage 2それぞれ30問です。',isNew:false},
    {version:'大学二次型',title:'全60問を自作・再構成',body:'大学公式の近年の公開問題・出題意図を参照し、本文の転載ではなく、指定範囲内の思考・計算問題として3択用に再構成しました。',isNew:true},
    {version:'v2.1',title:'学習強化アップデート',body:'学習記録、習熟度、練習モード、復習強化、難問のコイン制ヒント、誤答原因表示を追加しました。',isNew:false},
    {version:'安全確認',title:'ユーザー名をLINEで送ってください',body:'登録したユーザー名、または変更後のユーザー名を作成者へLINEで送ってください。本名・学校名・SNS IDは使わないでください。',isNew:false}
  ];
  const updateHistory = [
    __CURRENT_UPDATE_HISTORY__,
    ['v5.4','Stage 9「近接反応・射程封鎖区」を追加。遠距離攻撃を禁止し、近接・盾・回復でBaSO₄を突破する制限攻略を実装。'],
    ['v5.3','Stage 1〜8の攻略情報、敗北原因分析、敗北回数に応じた段階式ヒントを追加。'],
    ['v5.2','完全性検査付きの単一chemion-release.zip公開方式へ移行。'],
    ['v5.1','学習データ初期化を追加。正誤回数、習熟度、復習予定、間違い復習、直近出題履歴だけを削除して未学習状態から記録を取り直せる。コイン、Stage進行、解放、強化、実績、実戦問題の初回報酬記録は維持。'],
    ['v5.4','Stage 9「近接反応・射程封鎖区」を追加。遠距離攻撃ユニットは召喚不可、回復は使用可能。BOSS BaSO₄を近接編成で突破する制限攻略を実装。'],
    ['v5.3','Stage 1〜8の攻略情報、敗北分析、段階式ヒントを追加。'],
    ['v5.0','Stage 8「蓄積急襲区」を追加。Wave 10のO₃は第二形態なし・一般敵に近いHP・Lv.MAX強襲型より高い速度を持ち、出現時に全味方を消去。Energy上限をLv.12・最大265へ拡張し、125以上を蓄えて再展開する攻略を追加。'],
    ['v4.6','弱塩基由来陽イオン100％のStage 7「弱塩基遊離区」を追加。第5ユニットKOHの強塩基で弱塩基の遊離が発生し1.4倍。BOSSは予告後に増援を召集。'],
    ['v4.5','半反応式の基本40問・難問30問を追加。飛行型の時間経過自傷を廃止し、弱酸由来陰イオン100％のStage 6「弱酸遊離区」を追加。BOSSは予告後に弱酸由来イオンを召集。'],
    ['v4.45','v4.4の全修正を統合し、requestAdmins方式を廃止。匿名認証を含むログイン済みの全ユーザーが、すべての要望を実装済み／検討中へ変更し、削除できる方式へ変更。'],
    ['v4.4','要望一覧へ実装済み切替と削除を追加。飛行型の表示位置を約1体分上へ移動し、Stage 5実績が解除されない旧セーブを自動修復。再生産クールタイムの表示と実際の召喚可否を同期。'],
    ['v4.3','弱酸・弱塩基そのものへ遊離相性を出していた誤りを修正。強酸は弱酸由来陰イオン、強塩基は弱塩基由来陽イオンにのみ1.4倍とし、反応式・物質名・H₂O₂・Stage 3 BOSSの化学表記も監査。'],
    ['v4.2','二段階BOSSの第1形態撃破時に戦闘全体を停止し、専用変身演出、第二形態への変化、通常BOSS出現演出を順番に再生してから戦闘を再開するシーケンスを追加。'],
    ['v4.1','全StageのBOSS出現時に、黒い圧力波、暗転、画面振動、専用表示、Web Audioによる低音を組み合わせた独自演出を追加。'],
    ['v4.0','基本480問・難問250問・実戦8大問40小問へ増量。問題メタデータ・選択肢別解説・数値誤答監査を追加し、過去機能の実装監査、旧セーブ移行、開発ソース分割、自動回帰検査を実施。'],
    ['v3.95','ポーズ画面から同じStageのWave 1へやり直す機能と、倍速試験で不正解になった後30秒間再挑戦できない制限を追加。再読み込みによる回避も防止。'],
    ['v3.9','共通テスト型の実戦問題を5大問25小問追加。3/5以上で合格し、初回・再挑戦報酬と、次のバトル1回だけ有効なEnergy・回復・コイン報酬を選べるようにしました。'],
    ['v3.8','新しい画面を増やさず、問題ごとの正誤と経過時間に基づく長期記憶向け出題を実装。誤答は約12時間後、正答は3日・7日・14日・30日・45〜60日後を目安に優先し、同一30問・近似20問・類題8問の出題分散を維持。'],
    ['v3.7','通常問題・難問・ゲーム設定・版情報・テンプレートを分離し、生成、構文検査、問題検査、出題分散試験、文書・ZIP作成を1コマンドへ統合。GitHub Actionsでも生成元と公開物の同期を検査。'],
    ['v3.6.1','更新を「あとで」にできる仕様を廃止。新版を検出するとゲーム操作をロックし、進行を保存して自動更新。更新準備中も旧版でのプレイを続けられない必須アップデート方式へ変更。'],
    ['v3.6','Web App Manifest、192px・512pxアイコン、Service Workerを追加してPWA化。一度オンラインで起動した後のオフライン起動、ホーム画面追加、接続状態表示に対応。GitHub ActionsでJavaScript構文・問題データ・重複ID・PWA資産を検査し、合格時のみGitHub Pagesへ公開するワークフローを同梱。'],
    ['v3.5','同一問題を直近30問、文章が近い類題を直近20問、同じ計算パターンを直近8問から除外する段階式の出題分散を実装。難問を40問追加して142問から182問へ増量し、難問画面に出典・参考資料を明記。追加問題は公式公開ページを参考資料として確認し、本文・数値・選択肢を独自作成。'],
    ['v3.4','問題文で化学式・反応式直後の句点を改行区切りへ変換し、H₂。がH₂Oに見える問題を防止。ステージクリア後の継続プレイを場のユニットが残るエンドレス方式から、進行を引き継いだ第1ウェーブ再挑戦へ変更。倍速は他の難問正解では発動せず、研究強化の専用倍速試験に正解した場合だけ1.5倍速・2.25倍速になる方式へ変更。'],
    ['v3.3','NaOH・Ca(OH)₂・H₂Oを後半解放の高性能単体ヒーラーへ強化し、ユニット強化で回復量も上昇するよう変更。BOSSが飛行型を攻撃可能になりました。召喚ボタン→問題回答→正解時召喚を実際に操作するスキップ可能なチュートリアルと、端末間移行用の検査付きセーブコードを追加。'],
    ['v3.2','Stage 5「統合反応・飛行研究区」、飛行型ユニット・飛行敵・敵ヒーラー・敵盾兵・敵範囲攻撃を追加。5の倍数を難関ステージとして表示し、Stage 5は全役割・全属性・二段階飛行BOSSが現れる総合戦にしました。次回v3.3では後半解放の単体回復ヒーラーを強化予定。'],
    ['v3.1','難問正解による5分間の1.5倍速、効果中の再正解による2.25倍速を追加。残り時間は戦闘進行中だけ減少し、再挑戦で延長されません。全モーダルの自動停止、Stage 1〜4の役割別ユニット調整、盾の攻撃誘導・被ダメ軽減、強襲の初撃・押し戻しを実装。'],
    ['v3.0','Stage 4追加、Stage 3以降の研究カード、味方だけが受ける有利相性、役割別攻撃モーション、4研究区の拠点デザイン、基本320問＋難問120問、モル質量表記の明確化を実装。'],
    ['v2.7','既定出題範囲を化学基礎＋電気分解＋結晶へ整理。理論化学全範囲（予習）を追加し、気体・溶液・熱化学・反応速度・平衡は選択時のみ出題。全問題を4択化して正答位置を均等化し、表示時にもシャッフル。召喚用予習問題50問、Stage 1・2に長文難問各10問を追加。'],
    ['v2.6','全ユニットに常時重なっていた大きなステータスカードを撤去。HPバーは被弾・損傷時とBOSSのみ表示し、前線ステータスを半透明の自動インスペクターへ集約。タップ選択にも対応。'],
    ['v2.5','ウェーブ中のポーズ、非表示・終了時の自動停止保存、起動時の中断地点再開を追加。Web Audioによる軽量効果音と消音設定、H⁺・OH⁻・e⁻の投射、着弾・回復・発光アニメーションを追加。'],
    ['v2.4','初期エナジーと回復速度を増加。ステージ別の敵コイン倍率、Wave 3・5・7・9到達ボーナス、敗北時の研究支援コイン、難問失敗時50％返金を追加。Stage 1のHNO₃・NaOH解放費用とユニット強化費用曲線を緩和。'],
    ['v2.35','縦画面で上部に固定される横画面推奨バナーを削除。強襲型HNO₃・HBrの移動速度を2倍へ調整。'],
    ['v2.3','Stage 3「酸化還元反応区」、専用ユニット・敵・背景・拠点、属性が変わる二段階BOSS、Stage 3対応ランキングと実績を追加。'],
    ['v2.21','コンピューター向け指数表記を1.5×10²³の形式へ統一。問題・選択肢・解説・ヒント・復習画面でも自動変換。'],
    ['v2.2','難問を化学基礎・電気分解・化学範囲の結晶だけに統一。Stage 1・Stage 2各30問、計60問へ増加。ヘンリーの法則など範囲外問題を削除。'],
    ['v2.1','学習記録、習熟度ゲージ、練習モード、復習強化、難問ヒント、誤答原因、大学二次型問題の出典・解説改善、化学式と句読点の表示修正。'],
    ['v2.0','Stage 2、ステージ選択、ステージ別進行、共通メタ進行、Stage優先ランキング、範囲攻撃型KOH、背景・拠点テーマを追加。'],
    ['v1.95','mol計算50問、計250問、敗北画面の実績修正、復習、計算図、出題改善。'],
    ['v1.9','UI圧縮、相性演出、ウェーブ10の弱酸BOSSを追加。'],
    ['v1.8','問題200問、酸化還元強化、クリア後継続プレイを追加。'],
    ['v1.7','設定、お知らせ、アップデート履歴、公開要望、化学Lv.50、Lv.50実績を追加。'],
    ['v1.6','出題範囲選択、30秒ウェーブ、5分最終ウェーブ、HNO₃・NaOHを追加。'],
    ['v1.5','結晶格子・電気分解などの学習図を追加。'],
    ['v1.4','歩兵・弓兵・盾兵の役割差を強化。']
  ];

  window.cqPauseOverlay = pauseForOverlay;
  window.cqResumeOverlay = resumeFromOverlay;
  function updateGuestAssistUi() {
    const blocked = isTimeAttackActive();
    if ($('guestAssistIndicator')) $('guestAssistIndicator').hidden = !guestAssistEnabled || blocked;
    if ($('guestAssistDisableBtn')) $('guestAssistDisableBtn').hidden = !guestAssistEnabled;
    if ($('guestAssistCodeBtn')) $('guestAssistCodeBtn').hidden = guestAssistEnabled;
    if ($('guestAssistCode')) {
      $('guestAssistCode').disabled = guestAssistEnabled || blocked;
      if (guestAssistEnabled) $('guestAssistCode').value = '';
    }
    if ($('guestAssistCodeBtn')) $('guestAssistCodeBtn').disabled = blocked;
    if ($('guestAssistDisableBtn')) $('guestAssistDisableBtn').disabled = blocked;
    if ($('guestAssistCodeStatus') && blocked) $('guestAssistCodeStatus').textContent = 'タイムアタック中は利用できません';
    if ($('guestAssistCodeStatus') && guestAssistEnabled) $('guestAssistCodeStatus').textContent = 'ゲストアシスト中';
  }

  function requestGuestAssist() {
    if (isTimeAttackActive()) {
      invalidateTimeAttackRun('ゲストアシスト操作を検出しました。');
      return;
    }
    const code = String($('guestAssistCode')?.value || '').trim().toLowerCase();
    if (code !== 'easy') {
      $('guestAssistCodeStatus').textContent = 'コードを確認してください';
      return;
    }
    $('guestAssistCodeStatus').textContent = '';
    $('guestAssistConfirmModal').hidden = false;
    pauseForOverlay();
  }

  function closeGuestAssistConfirmation() {
    if ($('guestAssistConfirmModal').hidden) return;
    $('guestAssistConfirmModal').hidden = true;
    resumeFromOverlay();
    $('guestAssistCode')?.focus();
  }

  function enableGuestAssist() {
    if (isTimeAttackActive()) {
      invalidateTimeAttackRun('ゲストアシスト操作を検出しました。');
      closeGuestAssistConfirmation();
      return;
    }
    guestAssistEnabled = true;
    guestAssistUsed = true;
    $('guestAssistConfirmModal').hidden = true;
    resumeFromOverlay();
    updateGuestAssistUi();
    saveGame({ silent: true });
    window.dispatchEvent(new CustomEvent('cq-guest-assist-changed', { detail: { enabled: true, used: true } }));
  }

  function disableGuestAssist() {
    if (isTimeAttackActive()) {
      invalidateTimeAttackRun('ゲストアシスト操作を検出しました。');
      return;
    }
    guestAssistEnabled = false;
    updateGuestAssistUi();
    $('guestAssistCodeStatus').textContent = '';
    saveGame({ silent: true });
    window.dispatchEvent(new CustomEvent('cq-guest-assist-changed', { detail: { enabled: false, used: guestAssistUsed } }));
  }

  function openSettings() { pauseForOverlay(); updateGuestAssistUi(); $('settingsModal').hidden = false; }
  function closeSettings() { if ($('settingsModal').hidden) return; $('settingsModal').hidden = true; resumeFromOverlay(); }

  function createPracticeButton(label, description, config) {
    const card = document.createElement('article');
    card.className = 'practice-card';
    card.innerHTML = `<strong>${label}</strong><p>${description}</p>`;
    const button = document.createElement('button');
    button.className = 'small-button';
    button.type = 'button';
    button.textContent = '開始';
    button.addEventListener('click', () => startPractice(config));
    card.append(button);
    return card;
  }

  function practicePool(config) {
    if (config.reviewOnly) return readReviewItems().map(reviewQuestionFromItem).filter(Boolean);
    let pool = config.hardOnly ? availableQuestions(D.hardQuiz).filter((q) => !q.stageTier || q.stageTier === currentStageId) : availableQuestions(D.quiz);
    if (config.category) pool = pool.filter((q) => questionCategory(q) === config.category);
    if (config.scope) pool = pool.filter((q) => (q.scope || 'foundation') === config.scope);
    return pool;
  }

  function shuffled(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[target]] = [copy[target], copy[index]];
    }
    return copy;
  }

  function startPractice(config) {
    const pool = practicePool(config);
    if (!pool.length) {
      $('infoContent').insertAdjacentHTML('afterbegin', '<p class="profile-error">この条件で出題できる問題がありません。出題範囲または復習記録を確認してください。</p>');
      return;
    }
    const count = Math.min(config.count || 5, pool.length);
    practiceSession = { questions: shuffled(pool).slice(0, count), index: 0, correct: 0, label: config.label || '練習', hardOnly: Boolean(config.hardOnly), reviewOnly: Boolean(config.reviewOnly) };
    $('infoModal').hidden = true;
    launchPracticeQuestion();
  }

  function startReviewQuestion(item) {
    const question = reviewQuestionFromItem(item);
    if (!question) return;
    practiceSession = { questions: [question], index: 0, correct: 0, label: '間違い復習', hardOnly: Boolean(question.source), reviewOnly: true, forceReviewMode: true };
    $('infoModal').hidden = true;
    launchPracticeQuestion();
  }

  function launchPracticeQuestion() {
    if (!practiceSession) return;
    const question = practiceSession.questions[practiceSession.index];
    const isHard = practiceSession.hardOnly || Boolean(question.source && question.stageTier);
    openQuiz(question, {
      kicker: `${practiceSession.label}｜${practiceSession.index + 1}/${practiceSession.questions.length}`,
      title: isHard ? '大学二次型・練習問題' : '練習問題',
      isHard,
      mode: practiceSession.forceReviewMode ? 'review' : 'practice',
      allowOutsideGame: true,
      onComplete: (correct, result = {}) => {
        if (result.assisted) practiceSession.assisted = true;
        else if (correct) practiceSession.correct += 1;
        practiceSession.index += 1;
        if (practiceSession.index < practiceSession.questions.length) launchPracticeQuestion();
        else finishPractice();
      }
    });
  }

  function finishPractice() {
    const result = practiceSession;
    practiceSession = null;
    $('infoModal').hidden = false;
    $('infoKicker').textContent = 'PRACTICE RESULT';
    $('infoTitle').textContent = `${result.label} 結果`;
    if (result.assisted) {
      $('infoContent').innerHTML = '<p class="modal-lead">ゲストアシスト中のため、練習結果は成績・学習記録に反映されません。</p>';
      return;
    }
    const rate = percent(result.correct, result.questions.length);
    $('infoContent').innerHTML = `<div class="learning-summary-grid"><article class="learning-card"><span>正解</span><strong>${result.correct} / ${result.questions.length}</strong></article><article class="learning-card"><span>正答率</span><strong>${rate}%</strong></article></div><p class="modal-lead">結果は学習記録に反映されました。練習モードでは戦闘報酬は発生しません。</p>`;
  }

  function renderLearningView(container) {
    const data = readLearningData();
    const overall = percent(data.totalCorrect, data.totalAttempts);
    container.innerHTML = `<div class="learning-summary-grid"><article class="learning-card"><span>全体正答率</span><strong>${overall}%</strong><small>${data.totalCorrect}/${data.totalAttempts}問</small></article><article class="learning-card"><span>最高連続正解</span><strong>${data.bestStreak}問</strong></article><article class="learning-card"><span>召喚問題</span><strong>${percent(data.summonCorrect,data.summonAttempts)}%</strong><small>${data.summonAttempts}問</small></article><article class="learning-card"><span>難問</span><strong>${percent(data.hardCorrect,data.hardAttempts)}%</strong><small>${data.hardAttempts}問</small></article><article class="learning-card"><span>実戦問題</span><strong>${percent(data.mockCorrect,data.mockAttempts)}%</strong><small>${data.mockAttempts}問</small></article></div>`;
    const grid = document.createElement('div');
    grid.className = 'mastery-grid';
    for (const [key, label] of Object.entries(CATEGORY_LABELS)) {
      const stats = data.byCategory[key] || { attempts: 0, correct: 0, recent: [] };
      const mastery = masteryInfo(stats);
      const card = document.createElement('article');
      card.className = 'mastery-card';
      card.innerHTML = `<div class="mastery-card-head"><b>${label}</b><span>${mastery.label}</span></div><strong>${percent(stats.correct,stats.attempts)}%</strong><small>${stats.correct || 0}/${stats.attempts || 0}問正解</small><div class="mastery-bar"><span style="width:${mastery.score}%"></span></div>`;
      grid.append(card);
    }
    container.append(grid);
    const resetPanel = document.createElement('section');
    resetPanel.className = 'learning-reset-inline';
    resetPanel.innerHTML = '<h3>学習データを取り直す</h3><p>正誤履歴、習熟度、復習間隔、間違い復習を削除し、すべて未学習から再開します。コインやStage進行などは残ります。</p>';
    const resetActions = document.createElement('div');
    resetActions.className = 'learning-reset-inline-actions';
    const resetButton = document.createElement('button');
    resetButton.type = 'button';
    resetButton.className = 'small-button danger';
    resetButton.textContent = '学習データを初期化';
    resetButton.addEventListener('click', () => openLearningResetModal('learning'));
    resetActions.append(resetButton);
    resetPanel.append(resetActions);
    container.append(resetPanel);
  }

  function renderReviewView(container) {
    const items = readReviewItems();
    if (!items.length) {
      container.innerHTML = '<p class="modal-lead">復習問題はありません。不正解の問題が最大30件保存され、3回正解すると習得済みになります。</p>';
      return;
    }
    const list = document.createElement('div');
    list.className = 'review-list';
    items.forEach((item) => {
      const card = document.createElement('article');
      card.className = 'review-card';
      const correctCount = Math.min(3, finiteNumber(item.reviewCorrectCount, 0));
      const status = correctCount === 0 ? '復習中' : correctCount < 3 ? 'ほぼ習得' : '習得済み';
      const h = document.createElement('h3');
      h.textContent = formatChemicalText(item.q);
      const meta = document.createElement('p');
      meta.className = 'review-meta';
      meta.innerHTML = `<span class="review-status">${status}</span>　間違い${finiteNumber(item.wrongCount,1)}回｜復習正解${correctCount}/3回`;
      const p = document.createElement('p');
      p.textContent = `あなたの回答：${formatChemicalText(item.selected)}\n正解：${formatChemicalText(item.correct)}\n\n${formatChemicalText(item.explanation)}`;
      const actions = document.createElement('div');
      actions.className = 'review-card-actions';
      const retry = document.createElement('button');
      retry.className = 'small-button';
      retry.textContent = 'もう一度解く';
      retry.disabled = !reviewQuestionFromItem(item);
      retry.addEventListener('click', () => startReviewQuestion(item));
      const remove = document.createElement('button');
      remove.className = 'small-button';
      remove.textContent = '一覧から外す';
      remove.addEventListener('click', () => { removeReviewItem(item.q); showInfoView('review'); });
      actions.append(retry, remove);
      card.append(h, meta, p, actions);
      list.append(card);
    });
    container.append(list);
  }

  function mockExamScopeAllowed(exam) {
    const scope = exam.scope || 'foundation';
    if (selectedScope === 'foundation') return scope === 'foundation';
    if (selectedScope === 'foundation_electrolysis') return ['foundation', 'electrolysis'].includes(scope);
    if (selectedScope === 'all') return ['foundation', 'electrolysis', 'crystal'].includes(scope);
    return true;
  }

  function mockExamUnlocked(exam) {
    return Math.max(0, finiteNumber(cumulativeStats?.highestStageCleared, 0)) >= Math.max(0, finiteNumber(exam.minStageCleared, 1));
  }

  function formatMockTime(milliseconds) {
    const seconds = Math.max(0, Math.round(finiteNumber(milliseconds, 0) / 1000));
    return `${Math.floor(seconds / 60)}分${String(seconds % 60).padStart(2, '0')}秒`;
  }

  function mockCoinReward(score, firstPass) {
    const first = [0, 0, 0, 40, 80, 140];
    const repeat = [0, 0, 0, 8, 12, 20];
    return (firstPass ? first : repeat)[clamp(score, 0, 5)] || 0;
  }

  function renderMockExamView(container) {
    const exams = D.mockExams || [];
    const pending = mockRewardDefinition(mockExamProgress?.pendingReward);
    container.innerHTML = `<p class="modal-lead">1つの資料を読み、5小問を連続して解きます。Stage 1クリア後に利用でき、3問以上で合格です。初回コイン報酬に加え、合格すると次のバトル1回だけ有効な報酬を選べます。</p>${pending ? `<p class="mock-result-note">次のバトル用に「${pending.name}」を選択済みです。</p>` : ''}`;
    const grid = document.createElement('div');
    grid.className = 'mock-exam-grid';
    for (const exam of exams) {
      const state = mockExamProgress?.exams?.[exam.id] || {};
      const scopeAllowed = mockExamScopeAllowed(exam);
      const unlocked = mockExamUnlocked(exam);
      const card = document.createElement('article');
      card.className = `mock-exam-card${scopeAllowed && unlocked ? '' : ' locked'}`;
      const scopeLabel = exam.scope === 'foundation' ? '化学基礎' : exam.scope === 'electrolysis' ? '電気分解' : exam.scope === 'crystal' ? '結晶' : '理論化学';
      card.innerHTML = `<h3>${exam.title}</h3><p>${exam.subtitle}</p><div class="mock-status"><span>${scopeLabel}</span><span>5小問</span><span>${state.passed ? `合格｜最高${state.bestScore}/5` : state.attempts ? `最高${state.bestScore || 0}/5` : '未挑戦'}</span></div><small>${scopeAllowed ? (unlocked ? '制限時間なし' : `Stage ${exam.minStageCleared}クリア後に解放`) : '現在の出題範囲では対象外'}</small>`;
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'continue-button'; button.textContent = state.attempts ? 'もう一度解く' : '大問を始める';
      button.disabled = !scopeAllowed || !unlocked;
      button.addEventListener('click', () => startMockExam(exam));
      card.append(button); grid.append(card);
    }
    container.append(grid);
  }

  function startMockExam(exam) {
    if (!exam || !mockExamScopeAllowed(exam) || !mockExamUnlocked(exam)) return;
    mockExamSession = { exam, index: 0, correct: 0, startedAt: Date.now(), results: [] };
    $('infoModal').hidden = true;
    launchMockExamQuestion();
  }

  function launchMockExamQuestion() {
    if (!mockExamSession) return;
    const { exam, index } = mockExamSession;
    const base = exam.questions[index];
    const question = { ...base, context: exam.context, source: exam.source, difficulty: '共通テスト型', scope: exam.scope };
    openQuiz(question, {
      kicker: `実戦問題｜${index + 1}/${exam.questions.length}`,
      title: exam.title,
      mode: 'mock',
      allowOutsideGame: true,
      onComplete: (correct, result = {}) => {
        if (result.assisted) mockExamSession.assisted = true;
        else {
          mockExamSession.results.push(Boolean(correct));
          if (correct) mockExamSession.correct += 1;
        }
        mockExamSession.index += 1;
        if (mockExamSession.index < exam.questions.length) launchMockExamQuestion();
        else finishMockExam();
      }
    });
  }

  function chooseMockReward(rewardId, examId) {
    const reward = MOCK_REWARDS.find((item) => item.id === rewardId);
    if (!reward) return;
    mockExamProgress.pendingReward = { id: reward.id, earnedFrom: examId, selectedAt: Date.now() };
    saveGame({ silent: true });
    document.querySelectorAll('.mock-reward-choice').forEach((button) => button.classList.toggle('selected', button.dataset.rewardId === reward.id));
    const note = $('mockRewardStatus');
    if (note) note.textContent = `「${reward.name}」を選択しました。次に第1ウェーブから始めるバトルで自動的に使われます。`;
  }

  function finishMockExam() {
    const session = mockExamSession;
    mockExamSession = null;
    if (session.assisted) {
      $('infoModal').hidden = false;
      $('infoKicker').textContent = 'MOCK EXAM';
      $('infoTitle').textContent = session.exam.title;
      $('infoContent').innerHTML = '<p class="modal-lead">ゲストアシスト中のため、実戦問題の成績・報酬・学習記録には反映されません。</p>';
      saveGame({ silent: true });
      return;
    }
    const { exam, correct, startedAt } = session;
    const elapsed = Date.now() - startedAt;
    const passed = correct >= Math.max(1, exam.passScore || 3);
    const perfect = correct === exam.questions.length;
    const previous = mockExamProgress.exams[exam.id] || { attempts: 0, bestScore: 0, passed: false, perfect: false, bestTimeMs: 0 };
    const firstPass = passed && !previous.passed;
    const firstPerfect = perfect && !previous.perfect;
    mockExamProgress.exams[exam.id] = {
      attempts: Math.max(0, previous.attempts || 0) + 1,
      bestScore: Math.max(previous.bestScore || 0, correct),
      passed: Boolean(previous.passed || passed),
      perfect: Boolean(previous.perfect || perfect),
      bestTimeMs: !previous.bestTimeMs || elapsed < previous.bestTimeMs ? elapsed : previous.bestTimeMs,
      lastPlayedAt: Date.now()
    };
    if (firstPass) cumulativeStats.mockExamsCompleted += 1;
    if (firstPerfect) cumulativeStats.mockExamPerfects += 1;
    const coinsAwarded = grantProgressCoins(mockCoinReward(correct, firstPass));
    evaluateAchievements();
    saveGame({ silent: true });

    $('infoModal').hidden = false;
    $('infoKicker').textContent = passed ? 'MOCK EXAM CLEAR' : 'MOCK EXAM RESULT';
    $('infoTitle').textContent = `${exam.title}｜${passed ? '合格' : '再挑戦'}`;
    const container = $('infoContent');
    container.innerHTML = `<div class="mock-result-grid"><article class="mock-result-card"><span>得点</span><strong>${correct} / ${exam.questions.length}</strong></article><article class="mock-result-card"><span>正答率</span><strong>${percent(correct, exam.questions.length)}%</strong></article><article class="mock-result-card"><span>所要時間</span><strong>${formatMockTime(elapsed)}</strong></article></div><p class="mock-result-note${passed ? '' : ' warn'}">${passed ? `合格です。${coinsAwarded}コインを獲得しました。次のバトル用ボーナスを1つ選んでください。` : `合格は${exam.passScore || 3}問以上です。今回はコイン・次回バトル報酬はありません。`}</p>`;
    if (!passed) return;
    const title = document.createElement('h3'); title.textContent = '次のバトル1回だけ有効な報酬'; container.append(title);
    const grid = document.createElement('div'); grid.className = 'mock-reward-grid';
    for (const reward of MOCK_REWARDS) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'mock-reward-choice'; button.dataset.rewardId = reward.id;
      button.innerHTML = `<strong>${reward.name}</strong><span>${reward.description}</span>`;
      button.addEventListener('click', () => chooseMockReward(reward.id, exam.id)); grid.append(button);
    }
    container.append(grid);
    const status = document.createElement('p'); status.id = 'mockRewardStatus'; status.className = 'mock-result-note'; status.textContent = mockExamProgress.pendingReward ? '別の報酬を選ぶと、現在選択中の次回報酬を置き換えます。' : '報酬を選ぶまでは次回バトルへ持ち越されません。'; container.append(status);
  }

  function renderPracticeView(container) {
    container.innerHTML = '<p class="modal-lead">戦闘を止めて問題だけを解きます。コイン・EXPなどの戦闘報酬はありません。難問のヒントには現在のステージのコインを使います。</p>';
    const grid = document.createElement('div');
    grid.className = 'practice-grid';
    [
      ['5問ランダム','現在の出題範囲から5問。',{count:5,label:'5問ランダム'}],
      ['10問ランダム','現在の出題範囲から10問。',{count:10,label:'10問ランダム'}],
      ['mol・量的関係','計算と反応量を中心に5問。',{count:5,category:'mol',label:'mol・量的関係'}],
      ['酸・塩基','中和、pH、炭酸塩など。',{count:5,category:'acidBase',label:'酸・塩基'}],
      ['酸化還元','酸化数、電子収支など。',{count:5,category:'redox',label:'酸化還元'}],
      ['電池・電気分解','電極反応と電気量。',{count:5,category:'electrolysis',label:'電池・電気分解'}],
      ['結晶','選択範囲に結晶が含まれる場合。',{count:5,category:'crystal',label:'結晶'}],
      ['理論化学・予習','「理論化学全範囲（予習）」選択時の追加問題。',{count:5,scope:'theory',label:'理論化学・予習'}],
      ['間違えた問題','復習一覧から最大5問。',{count:5,reviewOnly:true,label:'間違い復習'}],
      ['大学二次型・難問','長文問題を含む現在のステージの難問から5問。',{count:5,hardOnly:true,label:'大学二次型・難問'}]
    ].forEach(([label, description, config]) => grid.append(createPracticeButton(label, description, config)));
    container.append(grid);
  }

  function renderAppView(container) {
    const manager = window.ChemionPWA;
    const state = manager?.getState?.() || {
      currentVersion: '3.6', installed: false, installPromptReady: false,
      serviceWorkerSupported: 'serviceWorker' in navigator,
      controlled: Boolean(navigator.serviceWorker?.controller), online: navigator.onLine,
      platformHint: ''
    };
    container.innerHTML = '<p class="modal-lead">Chemion Questをホーム画面から起動し、通信が不安定なときもゲーム本体を利用できます。ランキング・要望などのオンライン機能には通信が必要です。</p>';
    const badge = document.createElement('div');
    badge.className = state.installed ? 'pwa-installed-badge' : '';
    badge.textContent = state.installed ? '✓ アプリとして起動中' : 'ブラウザーで起動中';
    container.append(badge);
    const grid = document.createElement('div');
    grid.className = 'pwa-info-grid';
    [
      ['現在の版', `v${state.currentVersion}`],
      ['接続', state.online ? 'オンライン' : 'オフライン'],
      ['オフライン準備', state.controlled ? '完了' : (state.serviceWorkerSupported ? '初回準備中' : '非対応ブラウザー')],
      ['ホーム画面', state.installed ? '追加済み・単独起動' : (state.installPromptReady ? '追加可能' : 'ブラウザーのメニューから追加')]
    ].forEach(([label,value]) => { const card=document.createElement('div');card.className='pwa-info-card';const small=document.createElement('small');small.textContent=label;const strong=document.createElement('strong');strong.textContent=value;card.append(small,strong);grid.append(card); });
    container.append(grid);
    const help = document.createElement('div');
    help.className = 'pwa-help';
    help.innerHTML = state.platformHint || '<b>ホーム画面に追加する方法</b><br>Chrome・Edgeではアドレスバーやメニューの「インストール」「アプリをインストール」を使います。Safariでは共有メニューから「ホーム画面に追加」を選びます。';
    container.append(help);
    const actions = document.createElement('div');
    actions.className = 'pwa-view-actions';
    const install = document.createElement('button');
    install.className = 'continue-button'; install.type='button';
    install.textContent = state.installed ? 'ホーム画面追加済み' : 'ホーム画面へ追加';
    install.disabled = state.installed;
    install.addEventListener('click', async () => {
      const message = await manager?.requestInstall?.();
      status.textContent = message || 'ブラウザーの共有・メニューから「ホーム画面に追加」を選んでください。';
      setTimeout(() => renderAppView(container), 700);
    });
    const check = document.createElement('button');
    check.className = 'small-button'; check.type='button'; check.textContent='最新版を確認';
    check.addEventListener('click', async () => {
      status.textContent = '最新版を確認しています…';
      const result = await manager?.checkForUpdates?.({ manual: true });
      status.textContent = result || '確認が完了しました。';
    });
    const clear = document.createElement('button');
    clear.className='small-button'; clear.type='button'; clear.textContent='オフラインデータを更新';
    clear.addEventListener('click', async () => {
      status.textContent='ゲーム本体の保存を更新しています…';
      const result=await manager?.refreshOfflineCache?.();
      status.textContent=result || '更新しました。';
    });
    actions.append(install,check,clear); container.append(actions);
    const status = document.createElement('p'); status.className='pwa-view-status'; status.setAttribute('aria-live','polite'); status.textContent = manager?.getLastMessage?.() || '';
    container.append(status);
  }

  function showInfoView(kind) {
    $('settingsModal').hidden = true;
    $('infoModal').hidden = false;
    const container = $('infoContent');
    container.innerHTML = '';
    if (isTimeAttackActive() && ['review', 'learning', 'practice', 'mock'].includes(kind)) {
      $('infoKicker').textContent = 'TIME ATTACK';
      $('infoTitle').textContent = '走行中は利用できません';
      container.innerHTML = '<p class="modal-lead">通常の学習記録・練習成績を完全に分離するため、タイムアタック終了後に利用してください。計測は継続しています。</p>';
      return;
    }
    if (kind === 'notice') {
      $('infoKicker').textContent = 'NEWS'; $('infoTitle').textContent = 'お知らせ';
      const list = document.createElement('div'); list.className = 'notice-list';
      updateNotices.forEach((notice) => { const card = document.createElement('article'); card.className = 'notice-card'; card.innerHTML = `<h3>${notice.isNew?'<span class="new-badge">NEW</span> ':''}${notice.version}｜${notice.title}</h3><p>${notice.body}</p>`; list.append(card); });
      container.append(list);
    } else if (kind === 'review') {
      $('infoKicker').textContent = 'REVIEW'; $('infoTitle').textContent = '間違い復習'; renderReviewView(container);
    } else if (kind === 'learning') {
      $('infoKicker').textContent = 'LEARNING RECORD'; $('infoTitle').textContent = '学習記録・習熟度'; renderLearningView(container);
    } else if (kind === 'practice') {
      $('infoKicker').textContent = 'PRACTICE'; $('infoTitle').textContent = '練習モード'; renderPracticeView(container);
    } else if (kind === 'mock') {
      $('infoKicker').textContent = 'COMMON TEST STYLE'; $('infoTitle').textContent = '共通テスト型・実戦問題'; renderMockExamView(container);
    } else if (kind === 'app') {
      $('infoKicker').textContent = 'APP & UPDATE'; $('infoTitle').textContent = 'アプリ・オフライン・更新'; renderAppView(container);
    } else {
      $('infoKicker').textContent = 'UPDATE HISTORY'; $('infoTitle').textContent = 'アップデート履歴';
      const list = document.createElement('div'); list.className = 'history-list';
      updateHistory.forEach(([version, body]) => { const card = document.createElement('article'); card.className = 'history-card'; card.innerHTML = `<h3>${version}</h3><p>${body}</p>`; list.append(card); });
      container.append(list);
    }
  }

  function closeInfoToSettings() { $('infoModal').hidden = true; $('settingsModal').hidden = false; }

  function wireEvents() {
    $('continueBtn').addEventListener('click', closeQuiz);
    $('hintBtn').addEventListener('click', revealHardHint);
    $('pauseBtn').addEventListener('click', toggleBattlePause);
    $('resumeBattleBtn').addEventListener('click', resumeBattle);
    $('pauseSaveBtn').addEventListener('click', () => { saveGame(); refreshPauseSummary(); });
    $('pauseRestartBtn').addEventListener('click', restartCurrentStageFromPause);
    $('soundBtn').addEventListener('click', toggleSound);
    $('pauseSoundBtn').addEventListener('click', toggleSound);
    $('settingsSoundBtn').addEventListener('click', toggleSound);
    $('settingsMusicBtn').addEventListener('click', toggleBgm);
    $('pauseMusicBtn').addEventListener('click', toggleBgm);
    $('settingsPowerBtn').addEventListener('click', toggleLowPowerMode);
    $('pausePowerBtn').addEventListener('click', toggleLowPowerMode);
    $('musicVolume').addEventListener('input', (event) => setBgmVolume(event.currentTarget.value));
    $('stageBtn').addEventListener('click', openStageModal);
    $('stageCloseBtn').addEventListener('click', closeStageModal);
    $('timeAttackStartBtn').addEventListener('click', beginTimeAttack);
    $('timeAttackRankingBtn').addEventListener('click', openTimeAttackRanking);
    $('timeAttackExitBtn').addEventListener('click', exitTimeAttack);
    $('timeAttackResultRankingBtn').addEventListener('click', openTimeAttackRanking);
    $('timeAttackResultCloseBtn').addEventListener('click', closeTimeAttackResult);
    $('stageGuideCloseBtn').addEventListener('click', closeStageGuide);
    $('stageGuideCloseBottomBtn').addEventListener('click', closeStageGuide);
    $('stageGuideSelectBtn').addEventListener('click', selectStageFromGuide);
    $('stageGuideRetryBtn').addEventListener('click', retryStageFromGuide);
    $('endStageGuideBtn').addEventListener('click', () => openStageGuide(currentStageId, { source: 'defeat' }));
    $('settingsBtn').addEventListener('click', openSettings);
    $('settingsCloseBtn').addEventListener('click', closeSettings);
    $('settingsGuideBtn').addEventListener('click', () => { closeSettings(); openGuide({ firstLaunch:false }); });
    $('settingsTutorialBtn').addEventListener('click', () => {
      $('settingsModal').hidden = true;
      resumeFromOverlay();
      setTimeout(() => { if (!startTutorial({ force: true })) $('settingsModal').hidden = false; }, 30);
    });
    $('settingsTransferBtn').addEventListener('click', openTransferModal);
    $('settingsSaveBtn').addEventListener('click', () => { saveGame(); closeSettings(); });
    $('settingsLoadBtn').addEventListener('click', () => { loadGame(); closeSettings(); });
    $('aquaRegiaUnlockBtn').addEventListener('click', unlockAquaRegia);
    $('aquaRegiaUpgradeBtn').addEventListener('click', upgradeAquaRegia);
    $('aquaRegiaPrepareBtn').addEventListener('click', beginAquaRegiaPreparation);
    $('guestAssistCodeBtn').addEventListener('click', requestGuestAssist);
    $('guestAssistCode').addEventListener('keydown', (event) => { if (event.key === 'Enter') requestGuestAssist(); });
    $('guestAssistEnableBtn').addEventListener('click', enableGuestAssist);
    $('guestAssistCancelBtn').addEventListener('click', closeGuestAssistConfirmation);
    $('guestAssistDisableBtn').addEventListener('click', disableGuestAssist);
    $('settingsLearningResetBtn').addEventListener('click', () => openLearningResetModal('settings'));
    $('settingsDeleteBtn').addEventListener('click', () => { closeSettings(); deleteSave(); });
    $('settingsNicknameBtn').addEventListener('click', () => { closeSettings(); window.dispatchEvent(new CustomEvent('cq-open-profile')); });
    document.querySelectorAll('[data-settings-view]').forEach(btn=>btn.addEventListener('click',()=>{const v=btn.dataset.settingsView;if(['notice','history','review','learning','practice','mock','app'].includes(v))showInfoView(v);else if(v==='requests'){ $('settingsModal').hidden=true; window.dispatchEvent(new CustomEvent('cq-open-requests')); }else{ $('settingsModal').hidden=true; window.dispatchEvent(new CustomEvent('cq-submit-request')); }}));
    $('infoCloseBtn').addEventListener('click',()=>{$('infoModal').hidden=true;resumeFromOverlay();});
    $('infoBackBtn').addEventListener('click',closeInfoToSettings);
    $('transferCreateBtn').addEventListener('click', createTransferCode);
    $('transferCopyBtn').addEventListener('click', copyTransferCode);
    $('transferImportBtn').addEventListener('click', importTransferCode);
    $('transferClearBtn').addEventListener('click', () => { $('transferCode').value = ''; setTransferStatus('入力欄を空にしました。'); });
    $('transferBackBtn').addEventListener('click', closeTransferToSettings);
    $('transferCloseBtn').addEventListener('click', closeTransferModal);
    $('learningResetCloseBtn').addEventListener('click', closeLearningResetModal);
    $('learningResetCancelBtn').addEventListener('click', closeLearningResetModal);
    $('learningResetConfirmInput').addEventListener('input', updateLearningResetConfirmation);
    $('learningResetConfirmInput').addEventListener('keydown', (event) => { if (event.key === 'Enter' && !$('learningResetExecuteBtn').disabled) resetLearningData(); });
    $('learningResetExecuteBtn').addEventListener('click', resetLearningData);
    $('tutorialSkipBtn').addEventListener('click', () => finishTutorial(true));
    $('tutorialActionBtn').addEventListener('click', () => tutorialAction?.());
    document.addEventListener('pointerdown', guardTutorialPointer, true);
    window.addEventListener('resize', positionTutorialOverlay);
    window.addEventListener('scroll', positionTutorialOverlay, true);
    window.addEventListener('cq-profile-closed', () => setTimeout(maybeStartPendingTutorial, 120));
    window.addEventListener('cq-ta-profile-updated', (event) => {
      timeAttackProfile = normalizeTimeAttackProfile(event.detail, cumulativeStats);
      updateTimeAttackUi();
      if ($('timeAttackResultBest') && !$('timeAttackResultModal').hidden) {
        $('timeAttackResultBest').textContent = timeAttackProfile.localBestMs
          ? `あなたのベスト：${formatTimeAttackMs(timeAttackProfile.localBestMs)}`
          : '有効な自己ベストはありません。';
      }
    });
    window.addEventListener('cq-ta-submit-result', (event) => {
      if (!$('timeAttackResultModal') || $('timeAttackResultModal').hidden) return;
      const detail = event.detail || {};
      if (!detail.ok) {
        $('timeAttackResultStatus').textContent += '｜オンライン送信は保留されました。';
        return;
      }
      const label = detail.outcome === 'created' || detail.outcome === 'improved'
        ? 'オンライン自己ベストを更新しました。'
        : detail.outcome === 'slower'
          ? 'オンライン記録は既存の速いベストを維持しました。'
          : '同じ走行は重複登録せず確認済みです。';
      $('timeAttackResultStatus').textContent += `｜${label}`;
    });
    $('achievementBtn').addEventListener('click', openAchievements);
    $('achievementCloseBtn').addEventListener('click', closeAchievements);
    $('achievementCloseBottomBtn').addEventListener('click', closeAchievements);
    $('endAchievementsBtn').addEventListener('click', openAchievements);
    $('continuePlayBtn').addEventListener('click', continueAfterClear);
    $('nextStageBtn').addEventListener('click', () => switchStage(currentStageId + 1));
    $('scopeBtn').addEventListener('click', openScopeModal);
    $('scopeCancelBtn').addEventListener('click', () => { $('scopeModal').hidden = true; resumeFromOverlay(); });
    $('guideStartBtn').addEventListener('click', closeGuide);
    $('retryBtn').addEventListener('click', () => {
      $('endModal').hidden = true;
      resetStage({ keepProgress: true });
      saveGame({ silent: true });
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (tutorialActive) finishTutorial(true);
      else if (!$('transferModal').hidden) closeTransferModal();
      else if (!$('guestAssistConfirmModal').hidden) closeGuestAssistConfirmation();
      else if (!$('timeAttackResultModal').hidden) closeTimeAttackResult();
      else if (!$('achievementModal').hidden) closeAchievements();
      else if (!$('stageGuideModal').hidden) closeStageGuide();
      else if (!$('stageModal').hidden) closeStageModal();
      else if (!$('guideModal').hidden && $('guideModal').dataset.firstLaunch !== 'true') closeGuide();
      else if (!$('pauseModal').hidden) resumeBattle();
    });
    document.addEventListener('pointerdown', () => { ensureAudioContext(); activateBgmFromUserGesture(); }, { once: true, passive: true });
    cv.addEventListener('pointerdown', (event) => {
      const entity = entityAtCanvasPoint(canvasPointFromEvent(event));
      if (entity) {
        focusBattleEntity(entity, 12, true);
        battleInspectorHintUntil = Math.min(battleInspectorHintUntil, gameTime + 1.2);
      }
    });
    cv.addEventListener('pointermove', (event) => {
      if (event.pointerType && event.pointerType !== 'mouse') return;
      const entity = entityAtCanvasPoint(canvasPointFromEvent(event));
      cv.style.cursor = entity ? 'pointer' : 'default';
    });
    document.addEventListener('visibilitychange', () => {
      updatePowerControls();
      if (document.hidden) { pauseBgm(); suspendForHiddenPage(); }
      else {
        if (isTimeAttackActive() && timeAttackHiddenAt > 0 && performance.now() - timeAttackHiddenAt > TIME_ATTACK_BACKGROUND_LIMIT_MS) {
          invalidateTimeAttackRun('長時間バックグラウンドへ移動しました。');
        }
        timeAttackHiddenAt = 0;
        lastTimestamp = performance.now();
        lastRenderedTimestamp = 0;
        syncBgmPlayback();
        if (manualPaused && gameStatus === 'playing') showPauseModal(pauseReason === 'background' ? 'background' : pauseReason);
      }
    });
    window.addEventListener('pagehide', () => {
      if (isTimeAttackActive()) invalidateTimeAttackRun('ページ終了または再読み込みを検出しました。');
      pauseBgm();
      suspendForHiddenPage();
    });
    window.addEventListener('error', () => invalidateTimeAttackRun('実行エラーを検出しました。'));
    window.addEventListener('unhandledrejection', () => invalidateTimeAttackRun('未処理エラーを検出しました。'));
  }

  function animationLoop(timestamp) {
    const targetFps = currentRenderFps();
    const frameInterval = targetFps > 0 ? 1000 / targetFps : Infinity;
    if (targetFps === 0 || (lastRenderedTimestamp > 0 && timestamp - lastRenderedTimestamp < frameInterval)) {
      requestAnimationFrame(animationLoop);
      return;
    }
    const elapsedSinceRender = lastRenderedTimestamp > 0 ? timestamp - lastRenderedTimestamp : frameInterval;
    if (performanceMetrics.lastFrameAt > 0) {
      const gap = Math.max(0, timestamp - performanceMetrics.lastFrameAt);
      performanceMetrics.intervalTotalMs += gap;
      performanceMetrics.maxGapMs = Math.max(performanceMetrics.maxGapMs, gap);
      if (gap > 50) performanceMetrics.longFrames += 1;
    }
    performanceMetrics.lastFrameAt = timestamp;
    performanceMetrics.frames += 1;
    performanceMetrics.peakEffects = Math.max(performanceMetrics.peakEffects, combatEffects.length + impactBursts.length);
    performanceMetrics.peakProjectiles = Math.max(performanceMetrics.peakProjectiles, projectiles.length);
    performanceMetrics.heapPeak = Math.max(performanceMetrics.heapPeak, finiteNumber(performance.memory?.usedJSHeapSize, 0));
    const rawDt = Math.max(0, (timestamp - lastTimestamp) / 1000);
    const realDt = Math.min(0.25, rawDt);
    const dt = Math.min(0.1, realDt);
    lastTimestamp = timestamp;
    lastRenderedTimestamp = lastRenderedTimestamp > 0
      ? timestamp - (elapsedSinceRender % frameInterval)
      : timestamp;

    if (!paused && gameStatus === 'playing') {
      const speed = activeBattleSpeed();
      updateGame(dt * speed);
      updateBattleSpeedTimer(realDt);
    }
    if (achievementToastTimer > 0) {
      achievementToastTimer = Math.max(0, achievementToastTimer - dt);
      if (achievementToastTimer <= 0) $('achievementToast').hidden = true;
    }
    if (isTimeAttackActive() && performanceMetrics.frames % 3 === 0) updateTimeAttackUi();
    draw();
    requestAnimationFrame(animationLoop);
  }

  function installV6TestApi() {
    let enabled = false;
    try { enabled = new URLSearchParams(location.search).get('cqTest') === '1'; } catch (_) {}
    if (!enabled) return;
    window.cqV6TestApi = Object.freeze({
      enterStage10({ testCoins = 5000, unlockUnits = true } = {}) {
        rememberCurrentStageProgress();
        applyStageDefinition(10);
        coins = Math.max(0, testCoins);
        unlocked = new Set(unlockUnits ? D.units.map((unit) => unit.id) : initialUnlockedIds());
        energyCapacityLevel = 6;
        unitUpgradeLevels = Object.fromEntries(D.units.map((unit) => [unit.id, 6]));
        aquaRegiaUnlocked = false;
        aquaRegiaLevel = 1;
        aquaAuContactComplete = false;
        resetStage({ keepProgress: true });
        coins = Math.max(0, testCoins);
        unlocked = new Set(unlockUnits ? D.units.map((unit) => unit.id) : initialUnlockedIds());
        paused = false;
        updateAquaRegiaUi();
      },
      setAquaProgress({ unlocked: isUnlocked = true, level: nextLevel = 1, contactComplete = false } = {}) {
        aquaRegiaUnlocked = Boolean(isUnlocked);
        aquaRegiaLevel = clamp(Math.floor(finiteNumber(nextLevel, 1)), 1, 10);
        aquaAuContactComplete = Boolean(contactComplete);
        stage10State.contactStarted = aquaAuContactComplete;
        stage10State.contactComplete = aquaAuContactComplete;
        updateAquaRegiaUi();
      },
      clearField() { allies = []; enemies = []; projectiles = []; impactBursts = []; combatEffects = []; },
      spawnAlly(typeId, { x = BASE.allySpawnX, y = BASE.unitY, hpRatio = 1 } = {}) {
        const definition = D.units.find((unit) => unit.id === typeId);
        const ally = typeId === stage10AquaDefinition()?.id ? createAquaRegiaAlly(hpRatio) : definition ? createAlly(definition) : null;
        if (!ally) return null;
        ally.x = finiteNumber(x, ally.x); ally.y = finiteNumber(y, ally.y); ally.hp = Math.max(1, Math.round(ally.maxHp * clamp(hpRatio, .01, 1)));
        allies.push(ally); return entityBattleKey(ally);
      },
      prepareMaterialFormation() {
        allies = [];
        const positions = [[300,298],[338,256],[342,298],[338,340]];
        const ids = ['nitricAcidAlly5','hydrochloricAcidAlly6','hydrochloricAcidAlly6','hydrochloricAcidAlly6'];
        ids.forEach((id, index) => this.spawnAlly(id, { x: positions[index][0], y: positions[index][1], hpRatio: .5 + index * .1 }));
      },
      beginPreparation: beginAquaRegiaPreparation,
      spawnAu({ formation = false, x = BASE.enemySpawnX } = {}) {
        const definition = D.enemies.find((enemy) => enemy.auBoss);
        if (!definition) return null;
        const au = createEnemy(definition, D.waves.length - 1);
        au.x = finiteNumber(x, au.x);
        enemies.push(au);
        if (formation) beginStage10AuFormation(au);
        else {
          stage10State.phase = 'combat'; au.stage10Hidden = false; au.stage10Protected = false; syncBgmTrack();
        }
        return entityBattleKey(au);
      },
      addProjectile(ownerKind, effectKind = 'attack') { projectiles.push({ ownerKind, effectKind, life: 2, maxLife: 2, x0: 100, y0: 100, x1: 200, y1: 100, x: 100, y: 100, direction: ownerKind === 'ally' ? 1 : -1, label: 'T', color: '#fff', glow: '#fff', splash: false }); },
      damageProbe(damageType, attack = 100) {
        const au = enemies.find((enemy) => enemy.auBoss) || (() => { this.spawnAu(); return enemies.find((enemy) => enemy.auBoss); })();
        return calculateDamage({ kind: 'ally', attack, damageType, chemistryClass: 'neutral' }, au);
      },
      setAuHp(value) {
        const au = enemies.find((enemy) => enemy.auBoss);
        if (!au) return false;
        au.hp = clamp(finiteNumber(value, au.hp), 0, au.maxHp);
        return true;
      },
      setTimeAttackUnlocked(value = true) {
        timeAttackProfile = normalizeTimeAttackProfile(timeAttackProfile, cumulativeStats);
        timeAttackProfile.unlocked = Boolean(value);
        saveGame({ silent: true });
        updateTimeAttackUi();
      },
      beginTimeAttack,
      forceTimeAttackElapsed(milliseconds, { valid = false } = {}) {
        if (!isTimeAttackActive()) return false;
        const elapsed = Math.max(0, finiteNumber(milliseconds, 0));
        timeAttackRun.startedAt = performance.now() - elapsed;
        timeAttackRun.valid = Boolean(valid);
        timeAttackRun.invalidReason = valid ? '' : '開発者・自動テスト状態です。';
        updateTimeAttackUi();
        return true;
      },
      finishTimeAttack(victory = true) { return restoreNormalAfterTimeAttack({ victory: Boolean(victory), reason: victory ? '' : '自動テスト中断' }); },
      invalidateTimeAttack: invalidateTimeAttackRun,
      requestFirstSummon() {
        const unit = D.units.find((candidate) => unlocked.has(candidate.id));
        if (!unit) return false;
        requestSummon(unit);
        return Boolean(activeQuiz);
      },
      answerActiveQuizCorrect() {
        if (!activeQuiz || activeQuiz.answered) return false;
        answerQuiz(activeQuiz.question.answer);
        return true;
      },
      continueActiveQuiz() {
        if (!activeQuiz?.answered) return false;
        closeQuiz();
        return true;
      },
      resetPerformanceMetrics() { performanceMetrics = defaultPerformanceMetrics(); },
      performanceSnapshot() {
        const elapsedMs = Math.max(1, performance.now() - performanceMetrics.startedAt);
        const measuredIntervals = Math.max(1, performanceMetrics.frames - 1);
        return {
          ...performanceMetrics,
          elapsedMs,
          averageFps: performanceMetrics.frames * 1000 / elapsedMs,
          intervalFps: 1000 / Math.max(.001, performanceMetrics.intervalTotalMs / measuredIntervals),
          heapGrowthBytes: finiteNumber(performanceMetrics.heapPeak, 0) - finiteNumber(performanceMetrics.heapStart, 0)
        };
      },
      benchmarkDraw(iterations = 12) {
        const count = clamp(Math.floor(finiteNumber(iterations, 12)), 1, 120);
        const startedAt = performance.now();
        for (let index = 0; index < count; index += 1) draw();
        const elapsedMs = performance.now() - startedAt;
        return { count, elapsedMs, averageDrawMs: elapsedMs / count };
      },
      benchmarkFrames(iterations = 60, dt = 1 / 60) {
        const count = clamp(Math.floor(finiteNumber(iterations, 60)), 1, 240);
        const frameDt = clamp(finiteNumber(dt, 1 / 60), 1 / 240, .1);
        let maxFrameMs = 0;
        const startedAt = performance.now();
        for (let index = 0; index < count; index += 1) {
          const frameStartedAt = performance.now();
          if (!paused && gameStatus === 'playing') updateGame(frameDt * activeBattleSpeed());
          draw();
          maxFrameMs = Math.max(maxFrameMs, performance.now() - frameStartedAt);
        }
        const elapsedMs = performance.now() - startedAt;
        const averageFrameMs = elapsedMs / count;
        return { count, elapsedMs, averageFrameMs, maxFrameMs, processingCapacityFps: 1000 / Math.max(.001, averageFrameMs) };
      },
      saveNow() { return saveGame({ silent: true }); },
      loadNow() { return loadGame({ silent: true }); },
      setPaused(value) { paused = Boolean(value); updatePauseButton(); },
      step(seconds, dt = .05) {
        const steps = Math.ceil(Math.max(0, seconds) / Math.max(.01, dt));
        for (let index = 0; index < steps && gameStatus === 'playing'; index += 1) updateGame(Math.min(.1, dt));
      },
      snapshot() {
        return {
          stage: currentStageId, gameStatus, paused, manualPaused, renderFps: currentRenderFps(), wave: currentWaveIndex + 1, wavePhase, gameTime,
          logicalScale: stageLogicalScale(), logicalEnemyX: BASE.enemyX, canvasEnemyX: logicalToCanvasX(BASE.enemyX),
          coins, energy, level, experience, energyCapacityLevel,
          unitUpgradeLevels: { ...unitUpgradeLevels },
          aquaRegiaUnlocked, aquaRegiaLevel, aquaAuContactComplete,
          highestStageCleared: cumulativeStats.highestStageCleared,
          highestStageReached: cumulativeStats.highestStageReached,
          guestAssistEnabled, guestAssistUsed,
          timeAttackActive: isTimeAttackActive(), timeAttackMs: currentTimeAttackMs(),
          timeAttackRun: timeAttackRun ? { ...timeAttackRun } : null,
          timeAttackProfile: JSON.parse(JSON.stringify(timeAttackProfile || defaultTimeAttackProfile())),
          cumulativeStats: JSON.parse(JSON.stringify(cumulativeStats)),
          stage10: JSON.parse(JSON.stringify(stage10State)),
          allies: allies.map((entity) => ({ ...serializeEntity(entity), kind: entity.kind, formula: entity.formula, hp: entity.hp, maxHp: entity.maxHp, aquaRegia: Boolean(entity.aquaRegia) })),
          enemies: enemies.map((entity) => ({ ...serializeEntity(entity), kind: entity.kind, formula: entity.formula, hp: entity.hp, maxHp: entity.maxHp, auBoss: Boolean(entity.auBoss) })),
          projectiles: projectiles.map((item) => ({ ownerKind: item.ownerKind, effectKind: item.effectKind })),
          visualCounts: { combatEffects: combatEffects.length, impactBursts: impactBursts.length, projectiles: projectiles.length, audioNodesActive: performanceMetrics.audioNodesActive },
          activeQuiz: activeQuiz ? { mode: activeQuiz.mode, answered: activeQuiz.answered } : null,
          desiredBgmTrackKey: desiredBgmTrackKey(), activeBgmTrackKey,
          enemyBaseHp, allyBaseHp
        };
      }
    });
  }

  function initialize() {
    applyStageDefinition(1);
    stageProgress = {};
    coins = 0;
    unlocked = new Set(initialUnlockedIds());
    level = 1;
    experience = 0;
    energyCapacityLevel = 1;
    unitUpgradeLevels = defaultUnitUpgradeLevels();
    cumulativeStats = defaultCumulativeStats();
    achievementState = defaultAchievementState();
    mockExamProgress = defaultMockExamProgress();
    activeMockReward = null;
    speedTrialRetryAt = storedSpeedTrialRetryAt();
    speedTrialCooldownRemainingMs();
    runStats = defaultRunStats();
    onboardingSeen = false;
    tutorialSeen = false;
    tutorialPending = false;
    tutorialActive = false;
    guestAssistEnabled = false;
    guestAssistUsed = false;
    timeAttackProfile = defaultTimeAttackProfile();
    aquaRegiaUnlocked = false;
    aquaRegiaLevel = 1;
    aquaAuContactComplete = false;
    stage10State = defaultStage10State();
    performanceMetrics = defaultPerformanceMetrics();

    buildUnitButtons();
    buildFormulaGuide();
    buildUpgradePanel();
    wireEvents();
    installV6TestApi();
    installOverlayPauseObserver();
    renderInlineGuideVisuals();
    updateScopeButton();
    updateSoundButtons();
    updateMusicControls();
    updatePowerControls();
    updateGuestAssistUi();
    updatePauseButton();

    const launchGate = $('mobileLaunchGate');
    const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (launchGate) {
      if (!isMobileDevice) launchGate.hidden = true;
      $('launchContinueBtn')?.addEventListener('click', () => { activateBgmFromUserGesture(); launchGate.hidden = true; syncPauseStateFromUi(); setTimeout(maybeStartPendingTutorial, 120); });
      $('launchHelpBtn')?.addEventListener('click', () => {
        activateBgmFromUserGesture();
        launchGate.hidden = true;
        syncPauseStateFromUi();
        openGuide({ firstLaunch: true });
        setTimeout(maybeStartPendingTutorial, 180);
      });
    }

    resetStage({ keepProgress: true });

    if (!loadGame({ silent: true })) {
      setSaveStatus('新しいセーブデータ');
      rememberCurrentStageProgress();
      saveGame({ silent: true });
    }

    renderAchievements();
    renderAchievementButton();
    if (!tutorialSeen) { tutorialPending = true; setTimeout(maybeStartPendingTutorial, 500); }

    requestAnimationFrame(animationLoop);
  }

  initialize();
})();
