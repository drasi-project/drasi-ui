// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const [beforeDirectory, afterDirectory, output] = process.argv.slice(2);
assert(process.argv.length === 5 && beforeDirectory && afterDirectory && output,
  'Usage: compare-documentation.mjs BASELINE_CANDIDATES DOCUMENTATION_CANDIDATES OUTPUT_JSON');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const beforeBytes = await readFile(join(beforeDirectory, 'release-set.json'));
const before = JSON.parse(beforeBytes);
const after = JSON.parse(await readFile(join(afterDirectory, 'release-set.json'), 'utf8'));
assert.equal(before.repository, 'drasi-project/drasi-ui');
assert.equal(after.repository, before.repository);
assert.deepEqual(after.packages.map(item => item.name), before.packages.map(item => item.name));

async function inventory(directory, item) {
  assert.equal(basename(item.filename), item.filename);
  const archive = join(directory, item.filename);
  const bytes = await readFile(archive);
  assert.equal(hash(bytes), item.sha256, 'Archive does not match its release-set identity');
  const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n');
  assert(entries.every(path => path.startsWith('package/') && !path.split('/').includes('..')));
  assert.deepEqual(entries.map(path => path.slice('package/'.length)).sort(),
    item.files.map(file => file.path).sort(), 'Recorded inventory does not match the actual archive');
  const files = new Map();
  for (const entry of entries) {
    const content = execFileSync('tar', ['-xOzf', archive, entry], { maxBuffer: 16 * 1024 * 1024 });
    files.set(entry.slice('package/'.length), { bytes: content.length, sha256: hash(content) });
  }
  return { archive: { filename: item.filename, bytes: bytes.length, sha256: item.sha256 }, files };
}

const proof = {
  scope: 'One-time Markdown-only comparison. Packed file identities bind the documentation, not a publication or human acceptance.',
  baseline: { source: before.source, releaseSetSha256: hash(beforeBytes) },
  packages: {},
  totals: { before: 0, after: 0, delta: 0, markdownBefore: 0, markdownAfter: 0 },
};
for (const item of after.packages) {
  const prior = before.packages.find(value => value.name === item.name);
  assert.equal(item.version, prior.version, 'Documentation comparison must not bump a package version');
  const old = await inventory(beforeDirectory, prior);
  const current = await inventory(afterDirectory, item);
  const nonMarkdown = map => [...map.keys()].filter(path => !path.endsWith('.md')).sort();
  assert.deepEqual(nonMarkdown(current.files), nonMarkdown(old.files), 'Non-Markdown inventory changed');
  const unchanged = {};
  for (const path of nonMarkdown(current.files)) {
    assert.deepEqual(current.files.get(path), old.files.get(path), `Non-Markdown bytes changed: ${item.name}/${path}`);
    unchanged[path] = current.files.get(path);
  }
  const markdown = {};
  for (const path of [...new Set([...old.files.keys(), ...current.files.keys()])].filter(path => path.endsWith('.md')).sort()) {
    markdown[path] = { before: old.files.get(path) ?? null, after: current.files.get(path) ?? null };
  }
  const markdownBefore = Object.values(markdown).reduce((sum, file) => sum + (file.before?.bytes ?? 0), 0);
  const markdownAfter = Object.values(markdown).reduce((sum, file) => sum + (file.after?.bytes ?? 0), 0);
  const delta = current.archive.bytes - old.archive.bytes;
  proof.packages[item.name] = {
    before: old.archive, after: current.archive, delta, markdownBefore, markdownAfter,
    nonMarkdownInventoryAndBytesUnchanged: true, unchanged, markdown,
  };
  proof.totals.before += old.archive.bytes;
  proof.totals.after += current.archive.bytes;
  proof.totals.delta += delta;
  proof.totals.markdownBefore += markdownBefore;
  proof.totals.markdownAfter += markdownAfter;
}
await writeFile(output, JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify(proof.totals));
console.log(`Non-Markdown inventories and bytes are identical; comparison retained at ${output}.`);
