// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { extractGuide, guideSource } from '../tests/consumers/public-contract/developer-guide.mjs';
import { runtimeDocuments, learningReferenceDocuments } from './documentation.mjs';
import { guideFigures } from './guide-assets.mjs';
import { candidateDirectory, root } from './packages.mjs';
import { renderPrintGuide } from './print-guide.mjs';
import { readArchive, verifyCandidateFiles, verifyLearningDirectory } from './verify-preview.mjs';
import { defaultPorts, saveLessonPorts } from '../examples/react/scripts/lesson-config.mjs';
import { markdownAnchors, relativeMarkdownLinks } from '../tests/consumers/public-contract/documentation-links.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const learningDirectory = resolve(process.env.DRASI_LEARNING_KIT ?? '.artifacts/learning-kit');
export const checkpoints = [
  ['01-local', 'main.tsx', 'vite.config.mjs'],
  ['02-sorting', 'sorted-main.tsx', 'vite.config.mjs'],
  ['03-dialog', 'review-main.tsx', 'vite.config.mjs'],
  ['04-theme', 'theme-main.tsx', 'vite.config.mjs'],
  ['06-live', 'live-main.tsx', 'vite-live.config.mjs'],
  ['08-membership', 'warm-main.tsx', 'vite-live.config.mjs'],
  ['09-shared-view', 'dashboard-main.tsx', 'vite-live.config.mjs'],
  ['10-recovery', 'failure-main.tsx', 'vite-live.config.mjs'],
  ['11-notifications', 'notification-main.tsx', 'vite-live.config.mjs'],
  ['12-authentication', 'authenticated-main.tsx', 'vite-auth.config.mjs'],
  ['17-capstone', 'capstone-main.tsx', 'vite-live.config.mjs'],
  ['appendix-gateway', 'application-main.tsx', 'vite.config.mjs'],
];
export const nextModules = ['readings.ts', 'reading-model.ts', 'live-cold-storage.tsx',
  'connection-notice.tsx', 'cold-storage-dashboard.tsx', 'cold-storage-client.tsx'];

export function npmEnvironment(directory = root) {
  return { ...process.env, ...(process.env.DRASI_OFFLINE === '1' ? {
    npm_config_offline: 'true', npm_config_cache: process.env.DRASI_NPM_CACHE ?? resolve(directory, '.artifacts/npm-cache'),
    npm_config_registry: 'https://registry.npmjs.org/', NPM_CONFIG_REGISTRY: 'https://registry.npmjs.org/',
  } : {}) };
}

export function npmRun(args, directory, env = npmEnvironment()) {
  const result = spawnSync('npm', args, { cwd: directory, encoding: 'utf8', env,
    timeout: 600_000, maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `npm ${args.join(' ')} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout + result.stderr;
}

async function writeJson(file, value) {
  await writeFile(file, JSON.stringify(value, null, 2) + '\n');
}

export async function validateLearningLinks(directory) {
  const documents = (await readdir(join(directory, 'docs'), { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'));
  for (const entry of documents) {
    const source = join(entry.parentPath, entry.name);
    const body = await readFile(source, 'utf8');
    for (const link of relativeMarkdownLinks(body)) {
      const [path, fragment] = link.split('#');
      const target = path ? resolve(dirname(source), decodeURIComponent(path)) : source;
      const local = relative(directory, target);
      assert(local !== '..' && !local.startsWith('../'), `Learning link escapes the kit: ${link}`);
      assert((await stat(target)).isFile(), `Learning link needs a bundled file: ${link}`);
      if (fragment) assert(markdownAnchors(await readFile(target, 'utf8')).has(decodeURIComponent(fragment)),
        `Learning link has a missing anchor: ${link}`);
    }
  }
}

async function lockApp(directory, manifest, set, sourceLock, next = false) {
  const packages = Object.fromEntries(Object.entries(sourceLock.packages)
    .filter(([path, entry]) => path.startsWith('node_modules/') && !entry.link));
  if (next) for (const [path, entry] of Object.entries(sourceLock.packages)) {
    if (path.startsWith('tests/consumers/react-19/node_modules/')) {
      packages[path.slice('tests/consumers/react-19/'.length)] = entry;
    }
  }
  for (const item of set.packages) {
    if (!manifest.dependencies[item.name]) continue;
    assert.equal(manifest.dependencies[item.name], item.version, 'Stale learner package version');
    const archive = `file:../artifacts/${item.filename}`;
    manifest.dependencies[item.name] = archive;
    const packed = JSON.parse(readArchive(await readFile(join(directory, '..', 'artifacts', item.filename)))
      .get('package.json').toString('utf8'));
    packages[`node_modules/${item.name}`] = {
      version: item.version, resolved: archive, integrity: item.integrity, license: packed.license,
      ...(packed.dependencies ? { dependencies: packed.dependencies } : {}),
      ...(packed.peerDependencies ? { peerDependencies: packed.peerDependencies } : {}),
    };
  }
  await writeJson(join(directory, 'package.json'), manifest);
  await writeJson(join(directory, 'package-lock.json'), {
    name: manifest.name, version: manifest.version, lockfileVersion: 3, requires: true,
    packages: { '': manifest, ...packages },
  });
  npmRun(['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund',
    ...(next ? ['--offline'] : [])], directory);
  const lock = JSON.parse(await readFile(join(directory, 'package-lock.json'), 'utf8'));
  for (const [path, entry] of Object.entries(lock.packages)) {
    assert(!entry.link, `Learner lock contains a workspace link: ${path}`);
    if (!entry.resolved || entry.resolved.startsWith('file:')) continue;
    assert(Object.values(sourceLock.packages).some(known =>
      known.version === entry.version && known.integrity === entry.integrity),
    `Learner lock selected an unpinned dependency: ${path}`);
  }
  if (!next) {
    assert(!Object.keys(lock.packages).some(path => /node_modules\/(?:next|vue|playwright|@playwright\/|@vue\/)/.test(path)));
    assert.equal(lock.packages['node_modules/react'].version, '18.3.1');
    assert.equal(lock.packages['node_modules/@drasi/ui-styles'], undefined);
  }
  return lock;
}

export function moduleGraph(examples, entry) {
  const modules = new Map(examples.map(example => [example.name, example.code]));
  const selected = new Map();
  function visit(name) {
    if (selected.has(name)) return;
    const code = modules.get(name);
    assert(code, `Missing checkpoint module: ${name}`);
    selected.set(name, code);
    for (const [, specifier] of code.matchAll(/(?:from\s+|import\s*)['"]\.\/([^'"]+)['"]/g)) {
      if (specifier.endsWith('.css')) continue;
      const imported = [specifier, `${specifier}.ts`, `${specifier}.tsx`].find(path => modules.has(path));
      assert(imported, `Unresolved lesson import ${name}: ${specifier}`);
      visit(imported);
    }
  }
  visit(entry);
  return selected;
}

export async function createLearningKit({ directory = learningDirectory, candidates = candidateDirectory,
  iteration = false } = {}) {
  const set = await verifyCandidateFiles(candidates, undefined, { allowDirty: iteration });
  await mkdir(directory);
  const put = async (path, contents) => {
    await mkdir(dirname(join(directory, path)), { recursive: true });
    await writeFile(join(directory, path), contents);
  };
  const book = await readFile(join(root, guideSource), 'utf8');
  const { examples, assets } = extractGuide(book);
  const sourceLock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
  for (const item of set.packages) await put(`artifacts/${item.filename}`, await readFile(join(candidates, item.filename)));
  await put('artifacts/release-set.json', await readFile(join(candidates, 'release-set.json')));
  await put('docs/developer-guide/README.md', book);
  for (const name of guideFigures) await put(`docs/developer-guide/figures/${name}`,
    await readFile(join(root, 'docs/react/developer-guide/figures', name)));
  for (const { target } of [...learningReferenceDocuments, ...runtimeDocuments]) {
    await put(target.replace('docs/react/', 'docs/'), await readFile(join(root, target)));
  }
  await validateLearningLinks(directory);
  for (const name of ['LICENSE', 'NOTICE']) await put(name, await readFile(join(root, name)));
  await put('verify-preview.mjs', await readFile(new URL('./verify-preview.mjs', import.meta.url)));
  await mkdir(join(directory, 'starter/src'), { recursive: true });
  for (const name of ['tsconfig.json', 'index.html', 'vite.config.mjs', 'identity.test.mjs']) {
    await put(`starter/${name}`, assets.get(name).code);
  }
  for (const [name, code] of moduleGraph(examples, 'main.tsx')) await put(`starter/src/${name}`, code);
  saveLessonPorts(defaultPorts, join(directory, 'starter'));
  const manifest = JSON.parse(assets.get('package.json').code);
  const lock = await lockApp(join(directory, 'starter'), manifest, set, sourceLock);
  const core = set.packages.find(item => item.name === '@drasi/ui-core');
  await put('starter/pnpm-workspace.yaml', `overrides:\n  "${core.name}@${core.version}": "file:../artifacts/${core.filename}"\n`);
  for (const [name, entry, config] of checkpoints) {
    const path = `checkpoints/${name}`;
    for (const file of ['package.json', 'package-lock.json', 'tsconfig.json', 'index.html', 'identity.test.mjs', 'pnpm-workspace.yaml']) {
      await put(`${path}/${file}`, (await readFile(join(directory, 'starter', file), 'utf8'))
        .replaceAll('file:../artifacts/', 'file:../../artifacts/'));
    }
    await put(`${path}/vite.config.mjs`, assets.get(config).code.replaceAll("'../docs/", "'../../docs/"));
    await put(`${path}/src/cold-storage.css`, assets.get('cold-storage.css').code);
    for (const [module, code] of moduleGraph(examples, entry)) {
      await put(`${path}/src/${module === entry ? 'main.tsx' : module}`, code);
    }
    saveLessonPorts(defaultPorts, join(directory, path));
  }
  const modules = new Map(examples.map(example => [example.name, example.code]));
  await mkdir(join(directory, 'next/app/cold-storage'), { recursive: true });
  await put('next/tsconfig.json', assets.get('next-tsconfig.json').code);
  await lockApp(join(directory, 'next'), JSON.parse(assets.get('next-package.json').code), set, sourceLock, true);
  for (const name of nextModules) await put(`next/app/cold-storage/${name}`, modules.get(name));
  await put('next/app/layout.tsx', modules.get('next-layout.tsx'));
  await put('next/app/cold-storage/page.tsx', modules.get('next-cold-storage-page.tsx'));
  await put('docs/developer-guide/print.html', await renderPrintGuide(join(directory, 'docs'), set.source));
  await put('README.md', `# React learning kit\n\n` +
    `Version: ${set.packages.find(item => item.name === '@drasi/react').version}. Source: \`${set.source}\`.\n` +
    `${set.dirty ? '**Iteration only: source has uncommitted changes.**\n' : ''}` +
    `These files are not an npm publication or a public release announcement.\n\n` +
    `Verify first: \`node verify-preview.mjs --kit .\` (Node 22.20.0 or 24.19.0).\n` +
    `Start the backend-free app:\n\n\`\`\`sh\ncd starter && npm ci && npm run build && npm run dev\n\`\`\`\n\n` +
    `Node 22's bundled npm 10 works for this path. npm uses your configured registry and trusted CA;\n` +
    `keep integrity and TLS checks enabled. Ask your registry administrator to synchronize missing versions.\n` +
    `PowerShell: run each command separately and check \`if ($LASTEXITCODE) { throw 'Command failed' }\`.\n\n` +
    `Read [the complete book](docs/developer-guide/README.md) or its [offline print edition](docs/developer-guide/print.html).\n` +
    `Each checkpoints/ directory is a complete app with only that chapter's imported modules.\n` +
    `Copy a checkpoint's src/ and vite.config.mjs into starter/ only after adjusting its runtime import\n` +
    `from ../../docs/ to ../docs/, or run it in place with npm ci and npm run dev.\n` +
    `The optional next/ app has a separate manifest and install: cd next, npm ci, npm run build, npm start.\n\n` +
    `From starter/, the live lessons use:\n\n\`\`\`sh\n` +
    `node ../docs/developer-guide/runtime/scripts/lesson-config.mjs\n` +
    `node ../docs/developer-guide/runtime/scripts/backend.mjs\n\`\`\`\n\n` +
    `Chapter 6 adds its complete live Vite config; Chapter 12 adds auth routes and explicitly starts\n` +
    `\`node ../docs/developer-guide/runtime/scripts/auth-gateway.mjs\` in another terminal.\n` +
    `No helper runs at installation. Ctrl+C stops only its owned service. All ports come from lesson-ports.json.\n` +
    `Keep all three archives in artifacts/ together. The starter imports React/core only; styles is optional.\n`);
  const files = {};
  for (const path of (await readdir(directory, { recursive: true, withFileTypes: true }))
    .filter(item => item.isFile()).map(item => join(item.parentPath, item.name).slice(directory.length + 1)).sort()) {
    const bytes = await readFile(join(directory, path));
    files[path.replaceAll('\\', '/')] = { bytes: bytes.length, sha256: hash(bytes) };
  }
  await writeJson(join(directory, 'learning-kit.json'), {
    schema: 1, kind: 'react-learning-kit', version: set.packages.find(item => item.name === '@drasi/react').version,
    source: set.source, dirty: set.dirty, releaseSetSha256: hash(await readFile(join(candidates, 'release-set.json'))),
    bookSha256: hash(book), starterPackages: Object.keys(lock.packages).length - 1, files,
  });
  await verifyLearningDirectory(directory, set.source, { allowDirty: iteration });
  return { directory, set, bookSha256: hash(book), starterPackages: Object.keys(lock.packages).length - 1 };
}

export async function archiveLearningKit(directory, output) {
  const parts = [];
  const entries = (await readdir(directory, { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile()).map(entry => join(entry.parentPath, entry.name).slice(directory.length + 1)).sort();
  for (const path of entries) {
    const name = `package/${path.replaceAll('\\', '/')}`;
    assert(Buffer.byteLength(name) <= 100 && !name.includes('..'), `Unsafe learning archive entry: ${name}`);
    const body = await readFile(join(directory, path)), header = Buffer.alloc(512);
    header.write(name, 0); header.write('0000644\0', 100);
    header.write('0000000\0', 108); header.write('0000000\0', 116);
    header.write(body.length.toString(8).padStart(11, '0') + '\0', 124);
    header.write('00000000000\0', 136); header.fill(32, 148, 156);
    header.write('0', 156); header.write('ustar\0', 257); header.write('00', 263);
    header.write(header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0') + '\0 ', 148);
    parts.push(header, body, Buffer.alloc((512 - body.length % 512) % 512));
  }
  const bytes = gzipSync(Buffer.concat([...parts, Buffer.alloc(1024)]), { level: 9 });
  await writeFile(output, bytes, { flag: 'wx' });
  return { filename: output.split(/[\\/]/).at(-1), bytes: bytes.length, sha256: hash(bytes), files: entries.length };
}

if (import.meta.main) {
  assert(process.argv.slice(2).every(arg => arg === '--iteration'), 'Usage: learning-kit.mjs [--iteration]');
  const kit = await createLearningKit({ iteration: process.argv.includes('--iteration') });
  console.log(`Self-contained learning kit: ${kit.directory}; ${kit.starterPackages} starter dependencies; source ${kit.set.source}.`);
}
