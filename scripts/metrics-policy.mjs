// Adapted from the complete artifact accounting policy in the pinned Trading tooling.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

export function assertArtifactBudget(observed, baseline) {
  assert.deepEqual(Object.keys(observed).sort(), Object.keys(baseline.original).sort(), 'Artifact metric set changed');
  assert.deepEqual(Object.keys(baseline.extractionAllowance).sort(), Object.keys(baseline.original).sort());
  const documentation = baseline.documentationAllowance ?? {};
  assert.deepEqual(Object.keys(documentation), baseline.documentationAllowance ? ['tarball'] : [],
    'Documentation allowance may change only the package archive metric');
  if (baseline.documentationAllowance) {
    assert(Number.isSafeInteger(documentation.tarball) && documentation.tarball >= 0 &&
      typeof baseline.documentationReason === 'string' && baseline.documentationReason.trim(),
    'Documentation allowance requires a measured, explained archive delta');
  }
  for (const [metric, value] of Object.entries(observed)) {
    assert(Number.isSafeInteger(value) && value >= 0, `Invalid ${metric} size`);
    const original = baseline.original[metric];
    const allowance = baseline.extractionAllowance[metric];
    assert(Number.isSafeInteger(original) && original > 0);
    assert(Number.isSafeInteger(allowance) && allowance >= 0 && baseline.reason[metric]);
    assert(value <= original * 1.02 + allowance + (documentation[metric] ?? 0),
      `${metric} exceeds original * 1.02 + its documented extraction/documentation allowances; investigate rather than refreshing the baseline`);
  }
}

export function assertDocumentationArchiveBudget(archives, baseline) {
  const packages = baseline.documentationPackages;
  assert.deepEqual(Object.keys(archives).sort(), Object.keys(packages).sort(),
    'Documentation archive accounting must include each package');
  let allowance = 0;
  for (const [name, entry] of Object.entries(packages)) {
    assert(Number.isSafeInteger(entry.before) && entry.before > 0);
    assert(Number.isSafeInteger(entry.allowance) && entry.allowance >= 0);
    assert(Number.isSafeInteger(archives[name]) && archives[name] >= 0);
    assert(archives[name] <= entry.before * 1.02 + entry.allowance,
      `${name} archive exceeds its own Markdown allowance and future 2% growth bound`);
    allowance += entry.allowance;
  }
  assert.equal(allowance, baseline.documentationAllowance.tarball,
    'Per-package documentation deltas must sum to the recorded total');
}

export async function measureEmittedAssets(directory) {
  const result = { js: 0, jsGzip: 0, css: 0, cssGzip: 0, files: {} };
  for (const file of await readdir(directory, { recursive: true })) {
    if (!/\.(?:[cm]?js|css)$/.test(file)) continue;
    const bytes = await readFile(join(directory, file));
    const kind = file.endsWith('.css') ? 'css' : 'js';
    result[kind] += bytes.length;
    result[`${kind}Gzip`] += gzipSync(bytes).length;
    result.files[file] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  assert(result.js > 0, 'Missing emitted JavaScript assets');
  return result;
}
