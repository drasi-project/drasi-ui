// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
// Self-contained: this file can accompany downloads without installing the monorepo.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';

const names = ['@drasi/ui-core', '@drasi/ui-styles', '@drasi/react'];
assert.equal(typeof import.meta.main, 'boolean', 'Use Node 22.20.0 or 24.19.0 to verify preview downloads');
const hash = (bytes, algorithm = 'sha256', encoding = 'hex') =>
  createHash(algorithm).update(bytes).digest(encoding);

export function readArchive(bytes) {
  const tar = gunzipSync(bytes, { maxOutputLength: 32 * 1024 * 1024 });
  const files = new Map();
  let terminated = false;
  for (let offset = 0; offset < tar.length; offset += 512) {
    const header = tar.subarray(offset, offset + 512);
    assert.equal(header.length, 512, 'Truncated tar header');
    if (header.every(byte => byte === 0)) {
      assert(tar.subarray(offset).every(byte => byte === 0), 'Unexpected data after tar terminator');
      terminated = true;
      break;
    }
    const text = (start, size) => header.subarray(start, start + size).toString('utf8').replace(/\0.*$/, '');
    const checksum = Number.parseInt(text(148, 8).trim(), 8);
    const observed = header.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 32 : byte), 0);
    assert.equal(observed, checksum, 'Tar header checksum mismatch');
    assert(['0', ''].includes(text(156, 1)), 'Only regular files are accepted in preview packages');
    const path = [text(345, 155), text(0, 100)].filter(Boolean).join('/');
    assert(path.startsWith('package/') && !path.includes('\\') &&
      !path.split('/').some(part => part === '..' || part === '.' || part === ''),
    'Unsafe package path');
    const name = path.slice('package/'.length);
    assert(!files.has(name), 'Duplicate package path');
    const size = Number.parseInt(text(124, 12).trim(), 8);
    assert(Number.isSafeInteger(size) && size >= 0 && offset + 512 + size <= tar.length, 'Invalid tar size');
    files.set(name, tar.subarray(offset + 512, offset + 512 + size));
    offset += Math.ceil(size / 512) * 512;
  }
  assert(terminated && files.size > 0, 'Empty or unterminated package archive');
  return files;
}

function targets(value) {
  if (typeof value === 'string') return [value];
  assert(value && typeof value === 'object' && !Array.isArray(value), 'Invalid export condition');
  return Object.values(value).flatMap(targets);
}

export function assertProductionFile(name, path) {
  const common = /^(?:package\.json|README\.md|CHANGELOG\.md|LICENSE|NOTICE|dist\/[a-zA-Z0-9_./-]+\.(?:js|cjs|mjs|ts|cts|mts|css|map))$/;
  const react = /^(?:styles\.(?:css|d\.ts|d\.cts)|docs\/[a-z-]+\.md|docs\/reference\/(?:README|[a-z-]+)\.md|docs\/developer-guide\/README\.md)$/;
  assert(common.test(path) || (name === '@drasi/react' && react.test(path)),
    `Production archive contains a learning/server/downloader or unlisted file: ${name}/${path}`);
}

export async function verifyCandidateFiles(directory, expectedSource, { allowDirty = false } = {}) {
  const setBytes = await readFile(join(directory, 'release-set.json'));
  const set = JSON.parse(setBytes);
  assert.equal(set.schema, 1);
  assert.equal(set.repository, 'drasi-project/drasi-ui');
  assert.equal(typeof set.dirty, 'boolean');
  if (!allowDirty) assert.equal(set.dirty, false, 'Preview downloads require a clean committed source');
  assert(/^[a-f0-9]{40}$/.test(set.source), 'Missing source commit');
  if (expectedSource !== undefined) assert.equal(set.source, expectedSource, 'Preview is from a different source commit');
  assert(Array.isArray(set.packages), 'Missing package set');
  assert.deepEqual(set.packages.map(item => item.name), names, 'Expected the complete ordered package set');
  for (const item of set.packages) {
    assert.equal(basename(item.filename), item.filename);
    assert(/^[a-z0-9.-]+\.tgz$/.test(item.filename), 'Unsafe archive filename');
    const bytes = await readFile(join(directory, item.filename));
    assert.equal(bytes.length, item.bytes, `${item.name}: archive size mismatch`);
    assert.equal(hash(bytes), item.sha256, `${item.name}: SHA-256 mismatch`);
    assert.equal(`sha512-${hash(bytes, 'sha512', 'base64')}`, item.integrity, `${item.name}: npm integrity mismatch`);
    const files = readArchive(bytes);
    for (const path of files.keys()) assertProductionFile(item.name, path);
    assert.deepEqual([...files.keys()].sort(), item.files.map(file => file.path).sort(), `${item.name}: inventory mismatch`);
    for (const file of item.files) assert.equal(files.get(file.path).length, file.size, `${item.name}/${file.path}: size mismatch`);
    assert(files.has('package.json'), `${item.name}: missing package manifest`);
    const manifest = JSON.parse(files.get('package.json').toString('utf8'));
    assert.equal(manifest.name, item.name);
    assert(typeof item.version === 'string' && /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(item.version),
      'Invalid package version');
    assert.equal(manifest.version, item.version);
    assert.notEqual(manifest.private, true);
    assert.deepEqual(manifest.dependencies ?? {}, item.dependencies);
    assert(!manifest.scripts?.prepare && !manifest.scripts?.prepack && !manifest.scripts?.postinstall,
      'A downloaded package must not rebuild or launch a backend on installation');
    for (const path of targets(manifest.exports)) {
      assert(path.startsWith('./') && !path.split('/').includes('..'));
      assert(files.get(path.slice(2))?.length > 0, `${item.name}: missing built export ${path}`);
    }
    for (const [path, body] of files) {
      if (path.startsWith('dist/') && /\.(?:js|cjs|mjs)$/.test(path)) {
        assert(body.length > 0 && files.has(`${path}.map`), `${item.name}: missing runtime/map ${path}`);
      }
    }
    for (const [name, version] of Object.entries(manifest.dependencies ?? {})) {
      if (name.startsWith('@drasi/')) assert.equal(version, set.packages.find(pkg => pkg.name === name)?.version,
        'Internal dependencies must match the downloaded cohort');
    }
  }
  return set;
}

export function verifyLearningFiles(files, set, { allowDirty = false } = {}) {
  assert(files.has('learning-kit.json'), 'Missing learning-kit.json');
  const kit = JSON.parse(files.get('learning-kit.json').toString('utf8'));
  assert.equal(kit.schema, 1);
  assert.equal(kit.kind, 'react-learning-kit');
  assert.equal(kit.source, set.source, 'Learning bundle is from a different source commit');
  assert.equal(kit.version, set.packages.find(item => item.name === '@drasi/react').version);
  assert.equal(kit.dirty, set.dirty);
  if (!allowDirty) assert.equal(kit.dirty, false, 'Preview learning bundle must be clean');
  assert.deepEqual([...files.keys()].sort(), ['learning-kit.json', ...Object.keys(kit.files)].sort(),
    'Learning bundle inventory mismatch');
  for (const [path, entry] of Object.entries(kit.files)) {
    assert(!path.startsWith('/') && !path.includes('\\') && !path.split('/').some(part => ['', '.', '..'].includes(part)),
      'Unsafe learning file path');
    const bytes = files.get(path);
    assert.equal(bytes.length, entry.bytes, `Learning file size mismatch: ${path}`);
    assert.equal(hash(bytes), entry.sha256, `Learning file checksum mismatch: ${path}`);
  }
  for (const path of ['README.md', 'LICENSE', 'NOTICE', 'verify-preview.mjs', 'artifacts/release-set.json',
    'docs/developer-guide/README.md', 'docs/developer-guide/print.html', 'docs/reference/README.md',
    'docs/developer-guide/runtime/scripts/backend.mjs', 'docs/developer-guide/runtime/scripts/auth-gateway.mjs',
    'docs/developer-guide/runtime/scripts/lesson-config.mjs',
    'starter/package.json', 'starter/package-lock.json', 'starter/src/main.tsx',
    'next/package.json', 'next/package-lock.json', 'next/app/cold-storage/page.tsx',
    'checkpoints/12-authentication/src/session-auth.ts', 'checkpoints/11-notifications/src/threshold-alerts.ts']) {
    assert(files.has(path), `Missing self-contained learning input: ${path}`);
  }
  const setBytes = files.get('artifacts/release-set.json');
  assert.deepEqual(JSON.parse(setBytes.toString('utf8')), set);
  assert.equal(kit.releaseSetSha256, hash(setBytes));
  assert.equal(kit.bookSha256, hash(files.get('docs/developer-guide/README.md')));
  for (const item of set.packages) {
    assert.equal(hash(files.get(`artifacts/${item.filename}`)), item.sha256, 'Learning kit relabeled a package set');
  }
  const manifest = JSON.parse(files.get('starter/package.json').toString('utf8'));
  assert.deepEqual(Object.keys(manifest.dependencies).sort(), ['@drasi/react', '@drasi/ui-core', 'react', 'react-dom']);
  const lock = JSON.parse(files.get('starter/package-lock.json').toString('utf8'));
  assert(!Object.keys(lock.packages).some(path =>
    /node_modules\/(?:next|vue|playwright|@playwright\/|@vue\/)/.test(path)), 'Unrelated dependencies in the starter');
  assert(![...files.keys()].some(path => /^starter\/src\/(?:next-|cold-storage-client)/.test(path)),
    'Next modules leaked into the Vite starter');
  return kit;
}

export async function verifyLearningDirectory(directory, expectedSource, options = {}) {
  const files = new Map();
  for (const entry of await readdir(directory, { recursive: true, withFileTypes: true })) {
    assert(entry.isDirectory() || entry.isFile(), 'Learning kit cannot contain symlinks or special files');
    if (entry.isFile()) {
      const path = join(entry.parentPath, entry.name);
      assert((await lstat(path)).isFile());
      files.set(relative(directory, path).replaceAll('\\', '/'), await readFile(path));
    }
  }
  const set = await verifyCandidateFiles(join(directory, 'artifacts'), expectedSource, options);
  return verifyLearningFiles(files, set, options);
}

export async function verifyPreview(directory, expectedSource) {
  const set = await verifyCandidateFiles(directory, expectedSource);
  const preview = JSON.parse(await readFile(join(directory, 'preview.json'), 'utf8'));
  const learning = preview.learning;
  assert(learning && /^drasi-react-learning-[a-zA-Z0-9.-]+\.tgz$/.test(learning.filename), 'Missing versioned learning bundle');
  const expected = [...set.packages.map(item => item.filename),
    'release-set.json', 'preview.json', 'README.md', 'verify-preview.mjs', learning.filename];
  const sums = (await readFile(join(directory, 'SHA256SUMS'), 'utf8')).trim().split('\n');
  const checked = new Set();
  for (const line of sums) {
    const match = /^([a-f0-9]{64})  ([a-zA-Z0-9.-]+)$/.exec(line);
    assert(match && basename(match[2]) === match[2], 'Invalid checksum file entry');
    assert(expected.includes(match[2]), 'Unlisted preview download');
    assert(!checked.has(match[2]), 'Duplicate checksum entry');
    checked.add(match[2]);
    assert.equal(hash(await readFile(join(directory, match[2]))), match[1], `Download checksum mismatch: ${match[2]}`);
  }
  for (const file of expected) {
    assert(checked.has(file), `Missing download checksum: ${file}`);
  }
  assert.equal(preview.kind, 'github-prerelease-candidate');
  assert.equal(preview.source, set.source);
  assert.equal(preview.releaseSetSha256, hash(await readFile(join(directory, 'release-set.json'))));
  const bundle = await readFile(join(directory, learning.filename));
  assert.equal(bundle.length, learning.bytes);
  assert.equal(hash(bundle), learning.sha256);
  const kit = verifyLearningFiles(readArchive(bundle), set);
  assert.equal(kit.bookSha256, learning.bookSha256);
  return set;
}

if (import.meta.main) {
  if (process.argv[2] === '--kit') {
    assert(process.argv.length <= 4, 'Usage: node verify-preview.mjs --kit [EXTRACTED_KIT_DIRECTORY]');
    const kit = await verifyLearningDirectory(resolve(process.argv[3] ?? '.'), process.env.DRASI_EXPECTED_SOURCE);
    console.log(`Verified complete React learning kit ${kit.version}; source ${kit.source}.`);
  } else {
    assert(process.argv.length <= 3, 'Usage: node verify-preview.mjs [DOWNLOAD_DIRECTORY]');
    const set = await verifyPreview(resolve(process.argv[2] ?? '.'), process.env.DRASI_EXPECTED_SOURCE);
    for (const item of set.packages) console.log(`Verified ${item.name}@${item.version}: ${item.bytes} bytes`);
    console.log(`Source: ${set.source}. Package and learning-bundle checksums, inventories and built exports match.`);
  }
}
