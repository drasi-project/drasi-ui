import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { candidateDirectory, json, root } from './packages.mjs';
import { prepareGuideConsumer, prepareNextGuideConsumer } from './guide-consumer.mjs';
import { createLearningKit, learningDirectory, npmRun } from './learning-kit.mjs';

assert(process.argv.slice(2).every(arg => arg === '--keep'), 'Usage: test-book-apps.mjs [--keep]');
const keep = process.argv.includes('--keep');
const set = await json(join(candidateDirectory, 'release-set.json'));
await json(join(candidateDirectory, 'package-proof.json'));
const directory = await mkdtemp(join(tmpdir(), 'drasi-book-apps-'));
let passed = false;
try {
  await createLearningKit({ iteration: set.dirty });
  const vite = await prepareGuideConsumer({ kitRoot: learningDirectory, directory: join(directory, 'vite'), set });
  const next = await prepareNextGuideConsumer({ kitRoot: learningDirectory, directory: join(directory, 'next'), set });
  assert.equal(vite.bookSha256, next.bookSha256);
  await mkdir(join(root, '.artifacts'), { recursive: true });
  const proof = {
    node: process.version, npm: npmRun(['--version'], root).trim(),
    artifacts: set.packages.map(({ name, sha256 }) => ({ name, sha256 })),
    vite, next,
  };
  await writeFile(join(root, '.artifacts/book-apps.json'), JSON.stringify(proof, null, 2) + '\n');
  if (keep) await writeFile(join(root, '.artifacts/guide-iteration.json'), JSON.stringify({
    directory, candidates: candidateDirectory, consumers: { guide: vite, guideNext: next },
  }, null, 2) + '\n');
  passed = true;
  console.log('Both literal book applications build from installed packages on this Node version.');
} finally { if (!keep || !passed) await rm(directory, { recursive: true, force: true }); }
