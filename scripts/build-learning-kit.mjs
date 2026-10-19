// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
// Dependency-free entrypoint: the learner need not install this repository's workspace.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnNpmSync } from './node-cli.mjs';

assert.equal(typeof import.meta.main, 'boolean', 'Use Node 22.20.0 or 24.19.0 for the learning builder');

export async function reserveBuildOutput(output) {
  await mkdir(dirname(output), { recursive: true });
  await mkdir(output);
}

async function buildLearningKit(output) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  await reserveBuildOutput(output);
  const source = join(output, 'source');
  await mkdir(source);
  const run = (command, args, cwd, env = process.env) => {
    const options = { cwd, env, stdio: 'inherit', timeout: 600_000 };
    const result = command === 'npm' ? spawnNpmSync(args, options) : spawnSync(command, args, options);
    if (result.error) throw result.error;
    assert.equal(result.status, 0, `${command} ${args.join(' ')} failed; no usable kit was produced`);
  };
  const copy = async path => {
    await mkdir(dirname(join(source, path)), { recursive: true });
    await cp(join(root, path), join(source, path), { recursive: true,
      filter: path => !['node_modules', 'dist', '.artifacts'].includes(basename(path)) });
  };
  for (const path of ['packages/core', 'packages/styles', 'packages/react', 'docs/react',
    'examples/react/scripts', 'examples/react/config', 'tsconfig.base.json', '.npmrc', 'LICENSE', 'NOTICE',
    'tests/contracts/developer-guide-artifacts.json', 'tests/contracts/guide-screenshots.json']) await copy(path);
  for (const name of ['build.mjs', 'build-react.mjs', 'build-styles.mjs', 'build-outputs.mjs', 'packages.mjs',
    'pack.mjs', 'node-cli.mjs', 'documentation.mjs', 'sync-documentation.mjs', 'learning-kit.mjs', 'guide-assets.mjs',
    'print-guide.mjs', 'verify-preview.mjs']) await copy(`scripts/${name}`);
  for (const name of ['developer-guide.mjs', 'readme-examples.mjs', 'documentation-links.mjs', 'documents.mjs']) {
    await copy(`tests/consumers/public-contract/${name}`);
  }
  const original = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const tooling = ['tsup', 'typescript', 'marked', '@types/node', '@types/react', '@types/react-dom', 'react', 'react-dom'];
  const manifest = {
    name: 'drasi-learning-package-build', version: '0.0.0', private: true, type: 'module',
    workspaces: ['packages/core', 'packages/styles', 'packages/react'],
    devDependencies: Object.fromEntries(tooling.map(name => [name, original.devDependencies[name]])),
  };
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
  lock.name = manifest.name;
  lock.packages[''] = manifest;
  for (const [path, entry] of Object.entries(lock.packages)) {
    if ((!path.startsWith('node_modules/') && path !== '' && !manifest.workspaces.includes(path)) ||
        (entry.link && !manifest.workspaces.includes(entry.resolved))) delete lock.packages[path];
  }
  await writeFile(join(source, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(join(source, 'package-lock.json'), JSON.stringify(lock, null, 2) + '\n');
  const env = { ...process.env, ...(process.env.DRASI_OFFLINE === '1' ? {
    npm_config_offline: 'true', npm_config_cache: resolve(root, '.artifacts/npm-cache'),
    npm_config_registry: 'https://registry.npmjs.org/', NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org/',
  } : {}) };
  run('npm', ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'], source, env);
  const minimal = JSON.parse(await readFile(join(source, 'package-lock.json'), 'utf8'));
  assert(!Object.keys(minimal.packages).some(path => /node_modules\/(?:next|vue|playwright|@playwright\/|@vue\/)/.test(path)),
    'The minimal builder accidentally selected unrelated workspace dependencies');
  run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], source, env);
  run(process.execPath, ['scripts/sync-documentation.mjs', '--check'], source, env);
  run(process.execPath, ['scripts/build.mjs', '--packages-only'], source, env);
  run(process.execPath, ['scripts/pack.mjs'], source, { ...env, DRASI_CANDIDATES: '.artifacts/candidates' });
  // The optional Next app's lock is generated, but its dependencies are not installed here.
  await copyFile(join(root, 'package-lock.json'), join(source, 'package-lock.json'));
  run(process.execPath, ['scripts/learning-kit.mjs'], source, {
    ...env, DRASI_CANDIDATES: '.artifacts/candidates', DRASI_LEARNING_KIT: join(output, 'kit'),
    ...(process.env.DRASI_OFFLINE === '1' ? { DRASI_NPM_CACHE: resolve(root, '.artifacts/npm-cache') } : {}),
  });
  console.log(`Learning kit ready: ${join(output, 'kit')}\nRead its README.md for install/start commands; no workspace installation is needed.`);
}

if (import.meta.main) {
  assert(process.argv.length <= 3, 'Usage: node scripts/build-learning-kit.mjs [NEW_OUTPUT_DIRECTORY]');
  await buildLearningKit(resolve(process.argv[2] ?? '.artifacts/learning-build'));
}
