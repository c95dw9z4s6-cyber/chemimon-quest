import fs from 'node:fs';
import path from 'node:path';
import { projectRoot, readJson, loadReleaseConfig } from './lib.mjs';

const html = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
const runtime = fs.readFileSync(path.join(projectRoot, 'src/scripts/game-runtime.js'), 'utf8');
const pwa = fs.readFileSync(path.join(projectRoot, 'src/scripts/pwa-runtime.js'), 'utf8');
const template = fs.readFileSync(path.join(projectRoot, 'src/index.template.html'), 'utf8');
const core = readJson('data/game-core.json');
const features = readJson('config/features.json');
const release = loadReleaseConfig();

const checks = {
  'chemical-punctuation': /function formatQuestionText\(value\)/.test(runtime),
  'question-history': runtime.includes('EXACT_QUESTION_HISTORY_LIMIT = 30') && runtime.includes('NEAR_QUESTION_HISTORY_LIMIT = 20') && runtime.includes('FAMILY_QUESTION_HISTORY_LIMIT = 8'),
  'mandatory-update': !html.includes('id="pwaUpdateLaterBtn"') && /pwa-update-required/.test(html) && /applyWaitingUpdate/.test(pwa),
  'spacing-scheduler': runtime.includes('SPACING_CORRECT_INTERVAL_DAYS = [3, 7, 14, 30, 45, 60]') && runtime.includes('SPACING_INCORRECT_DELAY_HOURS = 12') && /selectSpacedQuestion/.test(runtime),
  'mock-exams': /renderMockExamView/.test(runtime) && /finishMockExam/.test(runtime) && /mockReward/.test(runtime),
  'numeric-distractor-audit': fs.readFileSync(path.join(projectRoot, 'scripts/validate.mjs'), 'utf8').includes('decimal-shift distractor'),
  'pause-restart': template.includes('id="pauseRestartBtn"') && /restartCurrentStageFromPause/.test(runtime),
  'speed-trial-cooldown': runtime.includes('SPEED_TRIAL_COOLDOWN_MS = 30 * 1000') && runtime.includes('chemionQuestSpeedTrialRetryV1'),
  'stage5-achievements': (() => {
    const unlocked = core.achievementDefinitions.find((x) => x.id === 'stage5_unlocked');
    const cleared = core.achievementDefinitions.find((x) => x.id === 'stage5_clear');
    return unlocked?.metric === 'highestStageReached' && unlocked?.goal === 5
      && cleared?.metric === 'stage5Clears' && cleared?.goal === 1;
  })(),
  'neutralization-guide': template.includes('中和によるダメージ倍率の変化はありません'),
  'save-v30-migration': runtime.includes('function migrateSaveData(input)') && /29, 30, D\.version/.test(runtime),
  'modular-source': ['src/styles/core.css','src/styles/release.css','src/scripts/game-runtime.js','src/scripts/online-runtime.js','src/scripts/pwa-runtime.js'].every((file) => fs.existsSync(path.join(projectRoot,file))),
  'boss-arrival-effect': template.includes('id="bossArrivalFx"') && runtime.includes('function triggerBossArrivalEffect') && runtime.includes('function playBossArrivalSound') && fs.readFileSync(path.join(projectRoot,'src/styles/core.css'),'utf8').includes('@keyframes bossBlackWave'),
  'boss-second-phase-cinematic': template.includes('id="bossPhaseFx"') && runtime.includes('function beginBossSecondPhaseSequence') && runtime.includes('bossPhaseTransitionActive') && runtime.includes('triggerBossArrivalEffect(enemy, { formula: enemy.formula, name: enemy.name })') && fs.readFileSync(path.join(projectRoot,'src/styles/core.css'),'utf8').includes('@keyframes bossPhaseCollapse'),
  'chemistry-correct-affinity': core.chemistryAffinityVersion === 3 && runtime.includes("target === 'weak_acid_conjugate_base'") && runtime.includes("target === 'weak_base_conjugate_acid'") && template.includes('弱酸・弱塩基そのものには遊離補正なし'),
  'request-status-management': fs.readFileSync(path.join(projectRoot,'src/scripts/online-runtime.js'),'utf8').includes('updateRequestStatus') && fs.readFileSync(path.join(projectRoot,'firestore.rules'),'utf8').includes('validRequestStatusUpdate'),
  'request-universal-management': !fs.readFileSync(path.join(projectRoot,'src/scripts/online-runtime.js'),'utf8').includes('requestAdmins') && fs.readFileSync(path.join(projectRoot,'firestore.rules'),'utf8').includes('allow delete: if request.auth != null;'),
  'flying-render-offset': runtime.includes('const FLYING_EXTRA_RENDER_OFFSET = 42'),
  'stage5-achievement-repair': runtime.includes("case 'stage5Clears': return cumulativeStats.stage5Clears") && runtime.includes('cumulativeStats.stage5Clears = Math.max(1'),
  'summon-cooldown-sync': runtime.includes('function summonCooldownRemaining(unitId)') && runtime.includes('SUMMON_UI_REFRESH_INTERVAL = 0.1'),
  'half-reaction-expansion': readJson('data/basic-questions.json').filter((q)=>String(q.id).startsWith('v45-basic-half-')).length === 40 && readJson('data/hard-questions.json').filter((q)=>String(q.id).startsWith('v45-hard-half-')).length === 30,
  'flying-no-self-damage': !runtime.includes('ally.hp -= ally.maxHp * ally.selfDamagePerSecond') && !runtime.includes('enemy.hp -= enemy.maxHp * enemy.selfDamagePerSecond') && !JSON.stringify(core).includes('selfDamagePerSecond'),
  'stage6-weak-acid-liberation': core.stage6?.id === 6 && core.stage6?.units?.[4]?.chemistryClass === 'strong_acid' && core.stage6?.enemies?.every((enemy)=>enemy.affinityTarget === 'weak_acid_conjugate_base') && runtime.includes('function updateBossSummonAbility'),
  'stage7-weak-base-liberation': core.stage7?.id === 7 && core.stage7?.units?.[4]?.chemistryClass === 'strong_base' && core.stage7?.enemies?.every((enemy)=>enemy.affinityTarget === 'weak_base_conjugate_acid') && runtime.includes('Math.max(7, cumulativeStats.highestStageReached || 1)'),
  'stage8-energy-ambush': core.stage8?.id === 8 && core.stage8?.enemies?.find((enemy)=>enemy.boss)?.wipeAlliesOnArrival === true && runtime.includes('function beginBossAnnihilationSequence') && runtime.includes('allies = []'),
  'energy-capacity-lv12': core.maxEnergyCapacityLevel === 12 && core.maxEnergy + core.energyCapacityPerLevel * 11 === 265 && runtime.includes('function maxEnergyCapacityLevel()'),
  'learning-data-reset': template.includes('id="learningResetModal"') && template.includes('id="settingsLearningResetBtn"') && runtime.includes('function resetLearningData()') && runtime.includes('localStorage.removeItem(LEARNING_KEY)') && runtime.includes('localStorage.removeItem(REVIEW_KEY)') && runtime.includes("input.value.trim() !== '初期化する'"),
  'stage-strategy-guide': (() => {
    const guides = core.stageGuides || {};
    const complete = Array.from({ length: 9 }, (_, index) => String(index + 1)).every((id) => {
      const guide = guides[id];
      return guide
        && typeof guide.specialRule === 'string'
        && Array.isArray(guide.dangerousEnemies) && guide.dangerousEnemies.length >= 2
        && Array.isArray(guide.recommendedRoles) && guide.recommendedRoles.length >= 3
        && Array.isArray(guide.progressiveHints) && guide.progressiveHints.length >= 3;
    });
    return complete
      && template.includes('id="stageGuideModal"')
      && template.includes('id="endStageGuideBtn"')
      && runtime.includes('function renderStageGuide')
      && runtime.includes('function stageDefeatAnalysis')
      && runtime.includes('stage${currentStageId}Defeats');
  })(),
  'stage9-ranged-lock': (() => {
    const stage = core.stage9;
    const boss = stage?.enemies?.find((enemy) => enemy.boss);
    const blocked = stage?.units?.find((unit) => unit.rangedAttack);
    return stage?.id === 9
      && stage?.waves?.length === 11
      && stage?.rules?.disableRangedAllyAttacks === true
      && blocked?.formula === 'Ag⁺'
      && boss?.formula === 'BaSO₄'
      && !boss?.phaseTwo
      && runtime.includes('function stageBlocksRangedAlly')
      && runtime.includes("refs.state.textContent = '⛔ 遠距離攻撃禁止：召喚不可'");
  })(),
  'normal-bgm': (() => {
    const audioPath = path.join(projectRoot, 'assets/audio/chemion-normal-bgm.mp3');
    const difficultPath = path.join(projectRoot, 'assets/audio/chemion-difficult-bgm.mp3');
    const sw = fs.readFileSync(path.join(projectRoot, 'src/sw.template.js'), 'utf8');
    return fs.existsSync(audioPath)
      && fs.statSync(audioPath).size > 1000000
      && fs.existsSync(difficultPath)
      && fs.statSync(difficultPath).size > 1000000
      && template.includes('id="bgmAudio"')
      && template.includes('id="settingsMusicBtn"')
      && template.includes('id="musicVolume"')
      && template.includes('id="pauseMusicBtn"')
      && runtime.includes('function syncBgmPlayback()')
      && runtime.includes('function desiredBgmTrackKey()')
      && runtime.includes('function syncBgmTrack({ restart = false } = {})')
      && runtime.includes("currentStageId % 5 === 0 ? 'difficult' : 'normal'")
      && runtime.includes('function toggleBgm()')
      && runtime.includes('chemionQuestBgmVolumeV1')
      && runtime.includes('writeTransferValue(BGM_KEY, bundle.storage.bgm)')
      && runtime.includes('if (document.hidden) { pauseBgm(); suspendForHiddenPage(); }')
      && sw.includes('./assets/audio/chemion-normal-bgm.mp3')
      && sw.includes('./assets/audio/chemion-difficult-bgm.mp3');
  })(),
  'low-power-mode': template.includes('id="settingsPowerBtn"')
    && template.includes('id="pausePowerBtn"')
    && runtime.includes('const NORMAL_RENDER_FPS = 45')
    && runtime.includes('const LOW_POWER_RENDER_FPS = 30')
    && runtime.includes('const LOW_POWER_KEY = "chemionQuestLowPowerV1"')
    && runtime.includes('function toggleLowPowerMode()')
    && runtime.includes("writeTransferValue(LOW_POWER_KEY, bundle.storage.lowPower)")
    && runtime.includes("autoSaveTimer >= (lowPowerMode ? 15 : 10)")
    && fs.readFileSync(path.join(projectRoot,'src/styles/core.css'),'utf8').includes('body.low-power-mode'),
  'question-expansion-1000': (() => {
    const basicQuestions = readJson('data/basic-questions.json');
    const hardQuestions = readJson('data/hard-questions.json');
    const exams = readJson('data/mock-exams.json');
    const added = [...basicQuestions, ...hardQuestions].filter((q) => String(q.id || '').includes('v58-'));
    const negatives = added.filter((q) => q.negativeQuestion);
    const orbitals = added.filter((q) => q.category === 'matter');
    return basicQuestions.length === 620
      && hardQuestions.length === 340
      && exams.flatMap((exam) => exam.questions || []).length === 40
      && added.length === 160
      && negatives.length >= 8
      && negatives.every((q) => q.singleCorrectVerified === true)
      && orbitals.length === 24
      && added.every((q) => typeof q.referenceBasis === 'string' && q.referenceBasis.length > 20);
  })(),
  'organized-settings': ['learning','display','save-account','support','data-management'].every((section) => template.includes(`data-settings-section="${section}"`))
    && template.includes('class="settings-section settings-danger-section"')
    && template.includes('id="settingsLearningResetBtn"')
    && template.includes('id="settingsDeleteBtn"')
    && fs.readFileSync(path.join(projectRoot,'src/styles/core.css'),'utf8').includes('v5.7: purpose-based settings information architecture'),
  'verified-single-package-deploy': (() => {
    const workflow = fs.readFileSync(path.join(projectRoot,'.github/workflows/pages.yml'),'utf8');
    const verifier = fs.readFileSync(path.join(projectRoot,'scripts/verify_release_package.py'),'utf8');
    const builder = fs.readFileSync(path.join(projectRoot,'scripts/build_release_package.py'),'utf8');
    return workflow.includes('chemion-release.zip --extract-to _site')
      && workflow.includes('needs: verify')
      && verifier.includes('SHA-256 mismatch')
      && verifier.includes('archive contents do not exactly match the manifest')
      && verifier.includes('version.json and release manifest versions differ')
      && builder.includes('release-manifest.json');
  })(),
  'guest-assist': template.includes('id="guestAssistCode"')
    && template.includes('id="guestAssistConfirmModal"')
    && template.includes('ゲストアシストモードを有効にします。')
    && runtime.includes("code !== 'easy'")
    && runtime.includes('callback(true, { assisted: true })')
    && runtime.includes('if (guestAssistEnabled) return [];')
    && runtime.includes('guestAssistUsed = Boolean(parsed.progress.guestAssistUsed || guestAssistEnabled)')
    && fs.readFileSync(path.join(projectRoot,'src/scripts/online-runtime.js'),'utf8').includes('function guestAssistWasUsed()'),
  'complete-update-history': ['v3.9','v3.95','v4.0','v4.1','v4.2','v4.3','v4.4','v4.45'].every((version)=>runtime.includes(`['${version}'`) && runtime.includes(`{version:'${version}'`))
};

const rows = features.map((feature) => ({ ...feature, pass: Boolean(checks[feature.id]) }));
const failures = rows.filter((row) => row.required && !row.pass);
const lines = [
  `# Chemion Quest v${release.version} 実装監査`,
  '',
  `監査日時: ${new Date().toISOString()}`,
  '',
  '| 機能 | 導入版 | 結果 |',
  '|---|---:|---|',
  ...rows.map((row) => `| ${row.title} | ${row.introducedIn} | ${row.pass ? '✅ 実装確認' : '❌ 未確認'} |`),
  '',
  '## 監査で見つかった修正',
  '',
  '- Stage 5解放実績は`highestStageReached >= 5`、クリア実績はv4.4から`stage5Clears >= 1`の専用記録で判定し、旧セーブも補完します。',
  '- 「中和」は戦闘演出だけで倍率変化がないのに遊び方へ明記されていなかったため、説明を追加しました。',
  '- v3.95のセーブバージョン30を、明示的な移行関数でv4.0の31へ変換するようにしました。',
  '- 遊び方に「理論化学は出題しない」と残っていましたが、実際には理論化学全範囲モードが存在するため、モード別の正しい説明へ修正しました。',
  '- v4.1では、全Stageのボス出現時に独自の黒い圧力波・暗転・画面振動・Web Audio低音演出を追加しました。',
  '- v4.2では、二段階BOSSの第1形態撃破後に戦闘を完全停止し、専用変身演出と通常BOSS出現演出を順番に再生してから再開するシーケンスを追加しました。',
  '- v4.3では、弱酸・弱塩基そのものを遊離対象にしていた相性を廃止し、弱酸由来陰イオン・弱塩基由来陽イオンへ対象を修正しました。',
  '- v4.4では、要望管理、飛行表示、Stage 5実績、再生産クールタイムの4点を修正しました。',
  '- v4.45では、requestAdmins方式を廃止し、ログイン済みの全ユーザーが全要望を管理できる方式へ変更しました。',
  '- v4.5では、半反応式70問、飛行型自傷廃止、Stage 6、欠落アップデート履歴を追加しました。',
  '- v4.6では、Stage 6の塩基版として弱塩基由来陽イオン100％のStage 7を追加しました。',
  '- v5.0では、全味方消去後にEnergyから再展開するStage 8と、Energy上限Lv.12を追加しました。',
  '- v5.1では、ゲーム進行を維持したまま学習記録・復習間隔・間違い復習だけを初期化できる確認付き機能を追加しました。',
  '- v5.2では、公開物を単一ZIPへ集約し、完全なファイル一覧・SHA-256・サイズ・版整合性の検査後に空の領域からPagesへ一括公開する方式へ変更しました。',
  '- v5.3では、Stage選択・敗北画面から開ける攻略情報、直前の敗北分析、Stage別敗北回数に応じた段階式ヒントを追加しました。',
  '- v5.4では、遠距離攻撃ユニットを召喚不可にし、回復だけを許可するStage 9とBOSS BaSO₄を追加しました。',
  '- v5.5では通常BGMと独立ON/OFF・音量保存を追加し、v5.9では通常Stage曲を全面刷新して5の倍数Stage用難関曲との自動切替へ拡張しました。',
  '- v5.6では、通常描画45fps上限・DOM更新間引き・保存間隔最適化と、30fps・演出軽量化の低電力モードを追加しました。',
  '',
  '## 注意',
  '',
  '- Firebaseの実通信、GitHub Pages上のService Worker更新、iPhone Safariの実タップは公開後の実機確認が必要です。'
];
fs.mkdirSync(path.join(projectRoot,'docs'),{recursive:true});
fs.writeFileSync(path.join(projectRoot,'docs/IMPLEMENTATION_AUDIT.md'), `${lines.join('\n')}\n`);
if (failures.length) {
  console.error('Feature audit failed:');
  for (const failure of failures) console.error(`- ${failure.id}: ${failure.title}`);
  process.exit(1);
}
console.log(`Feature audit passed (${rows.length}/${rows.length}).`);
