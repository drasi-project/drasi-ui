// Prepares download files only. No release, tag, npm operation or upload occurs here.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { candidateDirectory, root } from './packages.mjs';
import { qualifyCandidates } from './qualified-candidates.mjs';
import { readArchive, verifyPreview } from './verify-preview.mjs';
import { renderPrintGuide } from './print-guide.mjs';
import { guideFigures } from './guide-assets.mjs';

assert(process.argv.length <= 3, 'Usage: prepare-preview.mjs [NEW_OUTPUT_DIRECTORY]');
const output = resolve(process.argv[2] ?? '.artifacts/preview');
const expectedSource = process.env.GITHUB_SHA ?? execFileSync('git',
  ['-c', `safe.directory=${await realpath(root)}`, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const qualification = await qualifyCandidates(candidateDirectory, join(root, '.artifacts'), expectedSource, process.env.GITHUB_RUN_ID);
const set = JSON.parse(await readFile(join(candidateDirectory, 'release-set.json'), 'utf8'));
await mkdir(output);
for (const item of set.packages) await copyFile(join(candidateDirectory, item.filename), join(output, item.filename));
await copyFile(join(candidateDirectory, 'release-set.json'), join(output, 'release-set.json'));
await copyFile(new URL('./verify-preview.mjs', import.meta.url), join(output, 'verify-preview.mjs'));
await writeFile(join(output, 'preview.json'), JSON.stringify({
  kind: 'github-prerelease-candidate', ...qualification,
  publication: 'Prepared files only. Publish as a GitHub prerelease after reviewed merge and successful protected-main qualification.',
  npmPublished: false,
}, null, 2) + '\n');
const archive = name => set.packages.find(item => item.name === name).filename;
const temporary = await mkdtemp(join(tmpdir(), 'drasi-preview-print-'));
try {
  const files = readArchive(await readFile(join(candidateDirectory, archive('@drasi/react'))));
  for (const path of ['docs/developer-guide/README.md',
    ...guideFigures.map(name => `docs/developer-guide/figures/${name}`)]) {
    assert(files.has(path), `Missing printable book input: ${path}`);
    await mkdir(dirname(join(temporary, path)), { recursive: true });
    await writeFile(join(temporary, path), files.get(path));
  }
  await writeFile(join(output, 'developer-guide.html'), await renderPrintGuide(temporary, set.source));
} finally { await rm(temporary, { recursive: true, force: true }); }
await writeFile(join(output, 'README.md'), `# Drasi UI preview downloads\n\n` +
  `Source: \`${set.source}\`. These are the exact tested archives, not rebuilt release copies.\n\n` +
  `Download every file from the same approved drasi-project/drasi-ui GitHub prerelease over HTTPS.\n` +
  `Run \`node verify-preview.mjs\` in that directory. It checks SHA-256, npm integrity,\n` +
  `archive contents and required built exports. The source and qualification run are in preview.json.\n\n` +
  `For the React guide, in your app run:\n\n\`\`\`sh\n` +
  `npm install /path/to/downloads/${archive('@drasi/ui-core')} /path/to/downloads/${archive('@drasi/react')}\n\`\`\`\n\n` +
  `On PowerShell, check \`if ($LASTEXITCODE) { throw 'Install failed' }\` before continuing.\n` +
  `Keep the styles archive with this cohort; the React app uses the CSS included in React.\n` +
  `Open \`node_modules/@drasi/react/docs/developer-guide/README.md\` for the complete book.\n` +
  `Open \`developer-guide.html\` for an offline print edition with wrapped code and embedded figures.\n` +
  `Its backend launcher downloads the documented released Server and signed plugins only when explicitly run.\n\n` +
  `The illustrated React archive is approximately 900 KB. Documentation and lesson assets add\n` +
  `about 0.83 MB to the installed package; public runtime and dependency graphs are unchanged.\n` +
  `These downloads are previews, not npm publication or completed human accessibility acceptance.\n`);
const files = [...set.packages.map(item => item.filename), 'release-set.json', 'preview.json',
  'README.md', 'verify-preview.mjs', 'developer-guide.html'];
const sums = [];
for (const file of files) {
  sums.push(`${createHash('sha256').update(await readFile(join(output, file))).digest('hex')}  ${file}`);
}
await writeFile(join(output, 'SHA256SUMS'), sums.join('\n') + '\n');
await verifyPreview(output, expectedSource);
console.log(`Prepared exact verified preview downloads in ${output}; nothing was published.`);
