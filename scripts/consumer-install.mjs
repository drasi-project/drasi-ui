import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, cp, lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import { candidateDirectory, json, root } from './packages.mjs';

export function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, {
    cwd, encoding: 'utf8', timeout: 600_000, maxBuffer: 32 * 1024 * 1024,
    env: {
      ...process.env, NODE_PATH: '', NODE_OPTIONS: '', NEXT_TELEMETRY_DISABLED: '1',
      npm_config_registry: 'https://registry.npmjs.org/', NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org/',
      ...(process.env.DRASI_OFFLINE === '1' ? {
        npm_config_offline: 'true', npm_config_cache: resolve(root, '.artifacts/npm-cache'),
      } : {}),
    },
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed (${result.status})\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

export const npmFlags = [
  '--registry=https://registry.npmjs.org', '--no-audit', '--no-fund',
  ...(process.env.DRASI_OFFLINE === '1'
    ? ['--offline', '--cache', resolve(root, '.artifacts/npm-cache')] : []),
];

export async function copyConsumer(source, target) {
  const excluded = new Set(['node_modules', 'dist', '.next', '.runtime', '.test-runtime',
    'coverage', 'test-results', 'playwright-report', 'package-lock.json']);
  await cp(source, target, {
    recursive: true, filter: path => !excluded.has(basename(path)),
  });
}

export async function verifyInstalled(directory, set, allowStoreLinks = false) {
  const owner = await realpath(directory);
  for (const item of set.packages) {
    const entry = join(directory, 'node_modules', item.name);
    if (!existsSync(entry)) continue;
    if (!allowStoreLinks) assert.equal((await lstat(entry)).isSymbolicLink(), false, 'An npm consumer installed a source link');
    const installed = await realpath(entry);
    assert(relative(owner, installed).split('/')[0] !== '..', `A package resolves outside its isolated consumer: ${installed}`);
    const lock = await json(join(directory, 'package-lock.json'));
    if (!allowStoreLinks) assert.equal(lock.packages[`node_modules/${item.name}`].integrity, item.integrity);
    const inspected = join(root, '.artifacts', `inspection-${basename(candidateDirectory)}`, item.name.split('/')[1], 'package');
    for (const file of item.files) {
      assert.deepEqual(await readFile(join(installed, file.path)), await readFile(join(inspected, file.path)),
        `Installed ${item.name}/${file.path} does not match the qualified tarball`);
    }
  }
}

/** Seed known registry resolutions, then let npm validate and normalize the real consumer lock. */
export async function installConsumer({ directory, source, manifest, set, scripts = false }) {
  if (source) await copyConsumer(join(root, source), directory);
  else await mkdir(directory, { recursive: true });
  const selected = manifest ?? await json(join(directory, 'package.json'));
  assert.equal(selected.private, true, 'Consumer fixtures must remain private');
  delete selected.workspaces;
  delete selected.packageManager;
  await mkdir(join(directory, 'artifacts'));
  for (const item of set.packages) {
    if (!selected.dependencies?.[item.name]) continue;
    await copyFile(join(candidateDirectory, item.filename), join(directory, 'artifacts', item.filename));
    selected.dependencies[item.name] = `file:./artifacts/${item.filename}`;
  }
  await writeFile(join(directory, 'package.json'), JSON.stringify(selected, null, 2) + '\n');
  const original = await json(join(root, 'package-lock.json'));
  const packages = Object.fromEntries(Object.entries(original.packages)
    .filter(([path, entry]) => path.startsWith('node_modules/') && !entry.link));
  if (source) {
    const prefix = `${source}/node_modules/`;
    for (const [path, entry] of Object.entries(original.packages)) {
      if (path.startsWith(prefix)) packages[`node_modules/${path.slice(prefix.length)}`] = entry;
    }
  }
  await writeFile(join(directory, 'package-lock.json'), JSON.stringify({
    name: selected.name, version: selected.version, lockfileVersion: 3, requires: true,
    packages: { '': selected, ...packages },
  }, null, 2) + '\n');
  run('npm', ['install', '--package-lock-only', '--ignore-scripts', ...npmFlags], directory);
  const locked = await json(join(directory, 'package-lock.json'));
  for (const [path, entry] of Object.entries(locked.packages)) {
    assert(!entry.link, `Consumer lock retains a workspace link: ${path}`);
    if (!entry.resolved || entry.resolved.startsWith('file:')) continue;
    assert(entry.resolved.startsWith('https://registry.npmjs.org/'), 'Consumer selected a registry mirror');
    assert(Object.values(original.packages).some(known =>
      known.resolved === entry.resolved && known.integrity === entry.integrity),
    `Consumer selected an unpinned dependency: ${path}`);
  }
  run('npm', [scripts ? 'install' : 'ci', ...(scripts ? [] : ['--ignore-scripts']), ...npmFlags], directory);
  await verifyInstalled(directory, set);
  return locked;
}
