import { copyFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildInventory, recordBuildOutputs } from './build-outputs.mjs';
import { releasePackages } from './packages.mjs';
import assert from 'node:assert/strict';
import { spawnNpmSync } from './node-cli.mjs';

assert(process.argv.slice(2).every(arg => arg === '--packages-only'), 'Usage: build.mjs [--packages-only]');
const root = fileURLToPath(new URL('../', import.meta.url));
await rm(new URL(`../${buildInventory}`, import.meta.url), { force: true });
for (const directory of ['core', 'styles', 'react']) {
  const base = new URL(`../packages/${directory}/`, import.meta.url);
  await rm(new URL('dist', base), { recursive: true, force: true });
  for (const file of ['LICENSE', 'NOTICE']) {
    await copyFile(new URL(`../${file}`, import.meta.url), new URL(file, base));
  }
  for (const directory of process.argv.includes('--packages-only') ? []
    : ['examples/vue-canary', 'tests/consumers/react-18', 'tests/consumers/react-19']) {
    const generated = new URL(`../${directory}/.generated/`, import.meta.url);
    await mkdir(generated, { recursive: true });
    await copyFile(new URL('../tests/contracts/host.ts', import.meta.url), new URL('host.ts', generated));
    if (directory.startsWith('tests/')) {
      await copyFile(new URL('../tests/contracts/react-app.tsx', import.meta.url), new URL('react-app.tsx', generated));
    }
  }
  const result = spawnNpmSync(['run', 'build', '--workspace', `packages/${directory}`], {
    cwd: root, stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
await recordBuildOutputs(root, releasePackages);
