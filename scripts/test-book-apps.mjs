import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { candidateDirectory, json, root } from './packages.mjs';
import { prepareGuideConsumer, prepareNextGuideConsumer } from './guide-consumer.mjs';

const set = await json(join(candidateDirectory, 'release-set.json'));
await json(join(candidateDirectory, 'package-proof.json'));
const directory = await mkdtemp(join(tmpdir(), 'drasi-book-apps-'));
const packageRoot = join(root, '.artifacts', `inspection-${basename(candidateDirectory)}`, 'react/package');
try {
  const vite = await prepareGuideConsumer({ packageRoot, directory: join(directory, 'vite'), set });
  const next = await prepareNextGuideConsumer({ packageRoot, directory: join(directory, 'next'), set });
  assert.equal(vite.bookSha256, next.bookSha256);
  await mkdir(join(root, '.artifacts'), { recursive: true });
  await writeFile(join(root, '.artifacts/book-apps.json'), JSON.stringify({
    node: process.version, artifacts: set.packages.map(({ name, sha256 }) => ({ name, sha256 })),
    vite, next,
  }, null, 2) + '\n');
  console.log('Both literal book applications build from installed packages on this Node version.');
} finally { await rm(directory, { recursive: true, force: true }); }
