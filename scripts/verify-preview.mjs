// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
// Self-contained: this file can accompany downloads without installing the monorepo.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
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

export async function verifyCandidateFiles(directory, expectedSource) {
  const setBytes = await readFile(join(directory, 'release-set.json'));
  const set = JSON.parse(setBytes);
  assert.equal(set.schema, 1);
  assert.equal(set.repository, 'drasi-project/drasi-ui');
  assert.equal(set.dirty, false, 'Preview downloads require a clean committed source');
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

export async function verifyPreview(directory, expectedSource) {
  const set = await verifyCandidateFiles(directory, expectedSource);
  const expected = [...set.packages.map(item => item.filename),
    'release-set.json', 'preview.json', 'README.md', 'verify-preview.mjs', 'developer-guide.html'];
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
  const preview = JSON.parse(await readFile(join(directory, 'preview.json'), 'utf8'));
  assert.equal(preview.kind, 'github-prerelease-candidate');
  assert.equal(preview.source, set.source);
  assert.equal(preview.releaseSetSha256, hash(await readFile(join(directory, 'release-set.json'))));
  return set;
}

if (import.meta.main) {
  assert(process.argv.length <= 3, 'Usage: node verify-preview.mjs [DOWNLOAD_DIRECTORY]');
  const set = await verifyPreview(resolve(process.argv[2] ?? '.'), process.env.DRASI_EXPECTED_SOURCE);
  for (const item of set.packages) console.log(`Verified ${item.name}@${item.version}: ${item.bytes} bytes`);
  console.log(`Source: ${set.source}. Checksums, inventories and built exports match.`);
}
