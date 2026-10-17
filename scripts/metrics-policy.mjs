// Adapted from the complete artifact accounting policy in the pinned Trading tooling.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

export function assertArtifactBudget(observed, baseline) {
  assert.deepEqual(Object.keys(observed).sort(), Object.keys(baseline.original).sort(), 'Artifact metric set changed');
  assert.deepEqual(Object.keys(baseline.extractionAllowance).sort(), Object.keys(baseline.original).sort());
  for (const [metric, value] of Object.entries(observed)) {
    assert(Number.isSafeInteger(value) && value >= 0, `Invalid ${metric} size`);
    const original = baseline.original[metric];
    const allowance = baseline.extractionAllowance[metric];
    assert(Number.isSafeInteger(original) && original > 0);
    assert(Number.isSafeInteger(allowance) && allowance >= 0 && baseline.reason[metric]);
    assert(value <= original * 1.02 + allowance,
      `${metric} exceeds original * 1.02 + its documented extraction allowance; investigate rather than refreshing the baseline`);
  }
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
