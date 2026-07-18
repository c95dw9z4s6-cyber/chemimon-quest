import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { loadReleaseConfig, projectRoot } from './lib.mjs';

const args = process.argv.slice(2);
const versionArg = args.find((arg) => !arg.startsWith('--'));
const getOption = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const configPath = path.join(projectRoot, 'config/release.json');
const config = loadReleaseConfig();
if (versionArg && versionArg !== config.version) config.version = versionArg.replace(/^v/, '');
const date = getOption('--date');
const name = getOption('--name');
if (date) config.releaseDate = date;
if (name) config.releaseName = name;
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

const runNode = (script, extra = []) => execFileSync(process.execPath, [path.join(projectRoot, script), ...extra], { cwd: projectRoot, stdio: 'inherit' });
const pythonExecutable = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const runPython = (script, extra = []) => execFileSync(pythonExecutable, [path.join(projectRoot, script), ...extra], { cwd: projectRoot, stdio: 'inherit' });

runNode('scripts/build.mjs');
runNode('scripts/validate.mjs');
runPython('scripts/build_release_package.py');
runPython('scripts/test_release_package.py');

const current = loadReleaseConfig();
const slug = current.version.replaceAll('.', '_');
const releaseRoot = path.join(projectRoot, 'release');
fs.rmSync(releaseRoot, { recursive: true, force: true });
fs.mkdirSync(releaseRoot, { recursive: true });

// Full source bundle: used as the development baseline for future implementation work.
const bundleFolderName = `chemion_v${slug}`;
const bundleFolder = path.join(releaseRoot, bundleFolderName);
fs.mkdirSync(bundleFolder, { recursive: true });
const include = [
  '.github', '.firebaserc', '.nojekyll', 'assets', 'config', 'data', 'docs', 'icons', 'scripts', 'src',
  'firebase.json', 'firestore.indexes.json', 'firestore.rules', 'index.html', 'manifest.webmanifest', 'sw.js', 'version.json',
  'README.md', 'NEW_CHAT_HANDOFF.md', 'package.json', 'chemion-release.zip'
];
for (const relative of include) {
  const source = path.join(projectRoot, relative);
  if (!fs.existsSync(source)) throw new Error(`release source missing: ${relative}`);
  const target = path.join(bundleFolder, relative);
  fs.cpSync(source, target, { recursive: true });
}
for (const entry of fs.readdirSync(path.join(bundleFolder, 'scripts'), { withFileTypes: true })) {
  if (entry.name === '__pycache__') fs.rmSync(path.join(bundleFolder, 'scripts', entry.name), { recursive: true, force: true });
  if (entry.isFile() && entry.name.endsWith('.pyc')) fs.rmSync(path.join(bundleFolder, 'scripts', entry.name), { force: true });
}
const fullZipPath = path.join(releaseRoot, `chemion_quest_v${slug}_bundle.zip`);
runPython('scripts/make_zip.py', [bundleFolder, fullZipPath, bundleFolderName]);

// One-time migration to the verified single-package deploy method: only these repository paths are required.
const migrationFolderName = `chemion_v${slug}_github_migration`;
const migrationFolder = path.join(releaseRoot, migrationFolderName);
fs.mkdirSync(path.join(migrationFolder, '.github/workflows'), { recursive: true });
fs.mkdirSync(path.join(migrationFolder, 'scripts'), { recursive: true });
fs.copyFileSync(path.join(projectRoot, '.github/workflows/pages.yml'), path.join(migrationFolder, '.github/workflows/pages.yml'));
fs.copyFileSync(path.join(projectRoot, 'scripts/verify_release_package.py'), path.join(migrationFolder, 'scripts/verify_release_package.py'));
fs.copyFileSync(path.join(projectRoot, 'chemion-release.zip'), path.join(migrationFolder, 'chemion-release.zip'));
const migrationInstructions = `# Chemion Quest v${current.version} GitHub公開方式の初回移行\n\n` +
`v5.2では、次の3ファイルだけを同じコミットでリポジトリへ上書き・追加します。\n\n` +
`- \`.github/workflows/pages.yml\`\n` +
`- \`scripts/verify_release_package.py\`\n` +
`- \`chemion-release.zip\`\n\n` +
`古いindex.htmlやsrcなどは残っていても、v5.2のActionsは公開に使いません。\n` +
`chemion-release.zipは展開せず、そのままリポジトリ直下へ置いてください。\n` +
`Actionsの「Verify package and deploy Chemion Quest」が緑になった後、公開URLでv${current.version}を確認します。\n\n` +
`この移行後、v5.3以降の通常更新では原則chemion-release.zipの1ファイルだけを置き換えます。\n` +
`ZIPの欠落・破損・版不一致・古い余分なファイルがある場合、Actionsは赤で停止し、公開中の正常版を維持します。\n`;
fs.writeFileSync(path.join(migrationFolder, 'UPLOAD_INSTRUCTIONS.md'), migrationInstructions);
const migrationZipPath = path.join(releaseRoot, `chemion_quest_v${slug}_github_migration.zip`);
runPython('scripts/make_zip.py', [migrationFolder, migrationZipPath, migrationFolderName]);

fs.copyFileSync(path.join(projectRoot, 'chemion-release.zip'), path.join(releaseRoot, 'chemion-release.zip'));
fs.copyFileSync(path.join(projectRoot, 'index.html'), path.join(releaseRoot, `chemion_quest_v${slug}_index.html`));
fs.copyFileSync(path.join(projectRoot, 'README.md'), path.join(releaseRoot, `Chemion_Quest_v${slug}_README.md`));
for (const [source, output] of [
  ['docs/V5_2_SAFE_DEPLOY_REPORT.md', `Chemion_Quest_v${slug}_SAFE_DEPLOY_REPORT.md`],
  ['docs/V5_3_STAGE_GUIDE_REPORT.md', `Chemion_Quest_v${slug}_STAGE_GUIDE_REPORT.md`],
  ['docs/V5_4_STAGE9_REPORT.md', `Chemion_Quest_v${slug}_STAGE9_REPORT.md`],
  ['docs/V5_5_BGM_REPORT.md', `Chemion_Quest_v${slug}_BGM_REPORT.md`],
  ['docs/V5_6_POWER_REPORT.md', `Chemion_Quest_v${slug}_POWER_REPORT.md`],
  ['docs/V5_7_SETTINGS_REPORT.md', `Chemion_Quest_v${slug}_SETTINGS_REPORT.md`],
  ['docs/V5_9_BGM_INTEGRATION_REPORT.md', `Chemion_Quest_v${slug}_BGM_V2_REPORT.md`],
  ['docs/ROADMAP_V5_3_TO_V6_0.md', `Chemion_Quest_v${slug}_ROADMAP.md`],
  ['docs/IMPLEMENTATION_AUDIT.md', `Chemion_Quest_v${slug}_IMPLEMENTATION_AUDIT.md`],
  ['docs/CHEMISTRY_AUDIT.md', `Chemion_Quest_v${slug}_CHEMISTRY_AUDIT.md`],
]) {
  fs.copyFileSync(path.join(projectRoot, source), path.join(releaseRoot, output));
}
console.log(`Release ready: ${fullZipPath}`);
console.log(`GitHub migration package: ${migrationZipPath}`);
console.log(`Future single-file package: ${path.join(releaseRoot, 'chemion-release.zip')}`);
