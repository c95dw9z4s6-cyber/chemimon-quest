import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, relativePath), 'utf8'));
}

export function loadReleaseConfig() {
  return readJson('config/release.json');
}

export function loadGameData() {
  const core = readJson('data/game-core.json');
  const quiz = readJson('data/basic-questions.json');
  const hardQuiz = readJson('data/hard-questions.json');
  const mockExams = readJson('data/mock-exams.json');
  const config = loadReleaseConfig();
  if (core.version !== config.saveVersion) {
    throw new Error(`data/game-core.json version ${core.version} does not match config saveVersion ${config.saveVersion}`);
  }
  return { ...core, quiz, hardQuiz, mockExams };
}

function escapeScriptJson(value) {
  return JSON.stringify(value, null, 2)
    .replace(/<\/script/gi, '<\\/script')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function replaceAllRequired(source, token, value) {
  if (!source.includes(token)) throw new Error(`Template token not found: ${token}`);
  return source.split(token).join(String(value));
}

function releaseNotesMarkdown(config) {
  return config.releaseNotes.map((note) => `- ${note}`).join('\n');
}

function renderDocTemplate(relativePath, config) {
  let text = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
  const replacements = {
    '__APP_VERSION__': config.version,
    '__RELEASE_NAME__': config.releaseName,
    '__SAVE_VERSION__': config.saveVersion,
    '__BASIC_COUNT__': config.expectedCounts.basic,
    '__HARD_COUNT__': config.expectedCounts.hard,
    '__MOCK_COUNT__': config.expectedCounts.mockExams,
    '__MOCK_QUESTION_COUNT__': config.expectedCounts.mockQuestions,
    '__RELEASE_NOTES__': releaseNotesMarkdown(config)
  };
  for (const [token, value] of Object.entries(replacements)) text = replaceAllRequired(text, token, value);
  return text;
}

export function renderOutputs() {
  const config = loadReleaseConfig();
  const gameData = loadGameData();
  let index = fs.readFileSync(path.join(projectRoot, 'src/index.template.html'), 'utf8');
  const sourceFragments = {
    '__CORE_STYLES__': fs.readFileSync(path.join(projectRoot, 'src/styles/core.css'), 'utf8').trimEnd(),
    '__RELEASE_STYLES__': fs.readFileSync(path.join(projectRoot, 'src/styles/release.css'), 'utf8').trimEnd(),
    '__GAME_RUNTIME__': fs.readFileSync(path.join(projectRoot, 'src/scripts/game-runtime.js'), 'utf8').trimEnd(),
    '__ONLINE_RUNTIME__': fs.readFileSync(path.join(projectRoot, 'src/scripts/online-runtime.js'), 'utf8').trimEnd(),
    '__PWA_RUNTIME__': fs.readFileSync(path.join(projectRoot, 'src/scripts/pwa-runtime.js'), 'utf8').trimEnd()
  };
  for (const [token, value] of Object.entries(sourceFragments)) index = replaceAllRequired(index, token, value);
  const notice = {
    version: `v${config.version}`,
    title: config.noticeTitle,
    body: config.noticeBody,
    isNew: true
  };
  const history = [`v${config.version}`, config.historySummary];
  index = replaceAllRequired(index, '__GAME_DATA_JSON__', escapeScriptJson(gameData));
  index = replaceAllRequired(index, '__CURRENT_UPDATE_NOTICE__', JSON.stringify(notice));
  index = replaceAllRequired(index, '__CURRENT_UPDATE_HISTORY__', JSON.stringify(history));
  index = replaceAllRequired(index, '__APP_VERSION__', config.version);
  index = replaceAllRequired(index, '__RELEASE_NAME__', config.releaseName);

  let sw = fs.readFileSync(path.join(projectRoot, 'src/sw.template.js'), 'utf8');
  sw = replaceAllRequired(sw, '__APP_VERSION__', config.version);

  const versionJson = `${JSON.stringify({
    version: config.version,
    releaseDate: config.releaseDate,
    saveVersion: config.saveVersion
  }, null, 2)}\n`;

  return {
    'index.html': index,
    'sw.js': sw,
    'version.json': versionJson,
    'README.md': renderDocTemplate('src/README.template.md', config),
    'NEW_CHAT_HANDOFF.md': renderDocTemplate('src/NEW_CHAT_HANDOFF.template.md', config)
  };
}

export function writeOutputs({ check = false } = {}) {
  const outputs = renderOutputs();
  const mismatches = [];
  for (const [relativePath, content] of Object.entries(outputs)) {
    const target = path.join(projectRoot, relativePath);
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
    if (check) {
      if (current !== content) mismatches.push(relativePath);
    } else if (current !== content) {
      fs.writeFileSync(target, content);
    }
  }
  return mismatches;
}

export function unresolvedTokens(text) {
  return [...new Set(text.match(/__[A-Z0-9_]+__/g) || [])];
}
