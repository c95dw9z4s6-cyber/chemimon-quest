import { loadReleaseConfig, unresolvedTokens, writeOutputs, renderOutputs } from './lib.mjs';

const check = process.argv.includes('--check');
const mismatches = writeOutputs({ check });
const outputs = renderOutputs();
const unresolved = Object.entries(outputs).flatMap(([file, text]) => unresolvedTokens(text).map((token) => `${file}: ${token}`));
if (unresolved.length) {
  console.error('Unresolved template tokens:');
  unresolved.forEach((entry) => console.error(`- ${entry}`));
  process.exit(1);
}
if (check && mismatches.length) {
  console.error('Generated files are out of sync. Run npm run build:');
  mismatches.forEach((file) => console.error(`- ${file}`));
  process.exit(1);
}
const config = loadReleaseConfig();
console.log(check ? `Chemion Quest v${config.version} generated files are in sync.` : `Chemion Quest v${config.version} build complete.`);
