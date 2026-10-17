import assert from 'node:assert/strict';
import { copyFile, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { candidateDirectory, json, root } from './packages.mjs';
import { copyConsumer, run, verifyInstalled } from './consumer-install.mjs';

const consumers = await json('.artifacts/consumers.json');
const source = consumers.consumers.react18.directory;
const directory = await realpath(await mkdtemp(join(tmpdir(), 'drasi-pnpm-consumer-')));
const cli = join(root, 'node_modules/pnpm/bin/pnpm.mjs');
const pnpm = args => run(process.execPath, [cli, ...args], directory, {
  env: { COREPACK_ENABLE_NETWORK: '0' },
});
const set = await json(join(candidateDirectory, 'release-set.json'));
assert.deepEqual(consumers.artifacts, set.packages.map(({ name, sha256 }) => ({ name, sha256 })));
try {
  await copyConsumer(source, directory);
  await copyFile(join(source, 'package-lock.json'), join(directory, 'package-lock.json'));
  assert.equal(pnpm(['--version']).trim(), '12.14.0');
  pnpm(['import', '--registry=https://registry.npmjs.org']);
  pnpm(['install', '--frozen-lockfile', '--ignore-scripts', '--registry=https://registry.npmjs.org',
    '--store-dir', join(directory, '.store')]);
  await verifyInstalled(directory, set, true);
  pnpm(['exec', 'vite', 'build']);
  await copyFile(join(root, 'tests/consumers/public-contract/install-render.cjs'), join(directory, 'render.cjs'));
  const renders = [];
  for (const format of ['esm', 'cjs']) renders.push(JSON.parse(run(process.execPath, [
    join(directory, 'render.cjs'), format, 'single-react',
  ], directory)));
  await copyFile(join(directory, 'pnpm-lock.yaml'), '.artifacts/pnpm-lock.yaml');
  await writeFile('.artifacts/pnpm-proof.json', JSON.stringify({
    pnpm: '12.14.0', source: set.source, artifacts: consumers.artifacts, renders,
    sourceLinks: false, peerOverrides: false, scriptsDisabled: true,
  }, null, 2) + '\n');
  console.log('Fresh pnpm consumer built and rendered the exact candidate set with one React identity.');
} finally {
  await rm(directory, { recursive: true, force: true });
}
