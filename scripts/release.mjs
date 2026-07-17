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

execFileSync(process.execPath, [path.join(projectRoot, 'scripts/build.mjs')], { cwd: projectRoot, stdio: 'inherit' });
execFileSync(process.execPath, [path.join(projectRoot, 'scripts/validate.mjs')], { cwd: projectRoot, stdio: 'inherit' });

const current = loadReleaseConfig();
const slug = current.version.replaceAll('.', '_');
const releaseRoot = path.join(projectRoot, 'release');
const bundleFolderName = `chemion_v${slug}`;
const bundleFolder = path.join(releaseRoot, bundleFolderName);
fs.rmSync(bundleFolder, { recursive: true, force: true });
fs.mkdirSync(bundleFolder, { recursive: true });

const include = [
  '.github', '.nojekyll', 'config', 'data', 'docs', 'icons', 'scripts', 'src',
  'firestore.rules', 'index.html', 'manifest.webmanifest', 'sw.js', 'version.json',
  'README.md', 'NEW_CHAT_HANDOFF.md', 'package.json'
];
for (const relative of include) {
  const source = path.join(projectRoot, relative);
  if (!fs.existsSync(source)) throw new Error(`release source missing: ${relative}`);
  const target = path.join(bundleFolder, relative);
  fs.cpSync(source, target, { recursive: true });
}
// Generated releases must not contain old generated release folders.
fs.rmSync(path.join(bundleFolder, 'release'), { recursive: true, force: true });
const zipPath = path.join(releaseRoot, `chemion_quest_v${slug}_bundle.zip`);
fs.rmSync(zipPath, { force: true });
execFileSync('python3', [path.join(projectRoot, 'scripts/make_zip.py'), bundleFolder, zipPath, bundleFolderName], { stdio: 'inherit' });
fs.copyFileSync(path.join(projectRoot, 'index.html'), path.join(releaseRoot, `chemion_quest_v${slug}_index.html`));
fs.copyFileSync(path.join(projectRoot, 'README.md'), path.join(releaseRoot, `Chemion_Quest_v${slug}_README.md`));
console.log(`Release ready: ${zipPath}`);
