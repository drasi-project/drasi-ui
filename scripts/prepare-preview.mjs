// Prepares download files only. No release, tag, npm operation or upload occurs here.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { candidateDirectory, root } from './packages.mjs';
import { qualifyCandidates } from './qualified-candidates.mjs';
import { verifyLearningDirectory, verifyPreview } from './verify-preview.mjs';
import { archiveLearningKit, learningDirectory } from './learning-kit.mjs';

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
const kit = await verifyLearningDirectory(learningDirectory, set.source);
const proof = JSON.parse(await readFile(join(root, '.artifacts/consumer-proofs/developer-guide/proof.json'), 'utf8'));
assert.equal(proof.learningKitSha256, createHash('sha256').update(
  await readFile(join(learningDirectory, 'learning-kit.json'))).digest('hex'),
'The learning kit changed after its fresh installation');
const learning = { ...await archiveLearningKit(learningDirectory,
  join(output, `drasi-react-learning-${kit.version}-${set.source.slice(0, 12)}.tgz`)), bookSha256: kit.bookSha256 };
await writeFile(join(output, 'preview.json'), JSON.stringify({
  kind: 'github-prerelease-candidate', ...qualification,
  learning,
  publication: 'Prepared files only. Publish as a GitHub prerelease after reviewed merge and successful protected-main qualification.',
  npmPublished: false,
}, null, 2) + '\n');
const archive = name => set.packages.find(item => item.name === name).filename;
await writeFile(join(output, 'README.md'), `# Drasi UI preview downloads\n\n` +
  `Source: \`${set.source}\`. These are the exact tested archives, not rebuilt release copies.\n\n` +
  `Download every file from the same approved drasi-project/drasi-ui GitHub prerelease over HTTPS.\n` +
  `Run \`node verify-preview.mjs\` in that directory. It checks SHA-256, npm integrity,\n` +
  `archive contents and required built exports. The source and qualification run are in preview.json.\n\n` +
  `For the complete React learning kit:\n\n\`\`\`sh\n` +
  `node verify-preview.mjs &&\nmkdir react-learning &&\n` +
  `tar -xzf ${learning.filename} -C react-learning --strip-components=1 &&\n` +
  `cd react-learning &&\nnode verify-preview.mjs --kit . &&\n` +
  `cd starter &&\nnpm ci &&\nnpm run build &&\nnpm run dev\n\`\`\`\n\n` +
  `On PowerShell, check \`if ($LASTEXITCODE) { throw 'Install failed' }\` before continuing.\n` +
  `The kit includes all three exact archives, the complete book, figures, reference copies,\n` +
  `offline print edition, minimal starter, complete checkpoints, optional separate Next app,\n` +
  `and backend/authentication helpers. Node 22.20.0 with bundled npm 10 is supported for the learner path.\n` +
  `Open \`docs/developer-guide/README.md\` or \`docs/developer-guide/print.html\` inside the kit.\n` +
  `From starter/, Chapter 5 runs \`node ../docs/developer-guide/runtime/scripts/backend.mjs\`.\n` +
  `Helpers download/run the documented released Server and signed plugins only when explicitly invoked.\n\n` +
  `Production consumers can install just ${archive('@drasi/ui-core')} and ${archive('@drasi/react')}.\n` +
  `The separate styles archive is optional; React includes its compatibility CSS.\n` +
  `Production packages contain no illustrated book, screenshots, printable edition, or lesson executables.\n` +
  `Package and learning archive sizes are recorded separately in release-set.json and preview.json.\n` +
  `These downloads are previews, not npm publication or completed human accessibility acceptance.\n`);
const files = [...set.packages.map(item => item.filename), 'release-set.json', 'preview.json',
  'README.md', 'verify-preview.mjs', learning.filename];
const sums = [];
for (const file of files) {
  sums.push(`${createHash('sha256').update(await readFile(join(output, file))).digest('hex')}  ${file}`);
}
await writeFile(join(output, 'SHA256SUMS'), sums.join('\n') + '\n');
await verifyPreview(output, expectedSource);
console.log(`Prepared exact verified preview downloads in ${output}; nothing was published.`);
