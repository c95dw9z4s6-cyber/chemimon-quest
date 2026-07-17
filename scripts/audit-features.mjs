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
