import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { assertArtifactBudget, assertDocumentationArchiveBudget } from '../metrics-policy.mjs';

const baseline = JSON.parse(await readFile(new URL('../../tests/contracts/artifact-baseline.json', import.meta.url)));
const accepted = Object.fromEntries(Object.keys(baseline.original).map(key =>
  [key, baseline.original[key] + baseline.extractionAllowance[key] + (baseline.documentationAllowance?.[key] ?? 0)]));
test('counts the complete multi-package set with explicit extraction deltas', () => {
  assertArtifactBudget(accepted, baseline);
  assert.equal(baseline.extractionAllowance.css, baseline.original.css);
});
test('rejects each metric independently above the retained 2% bound', () => {
  for (const metric of Object.keys(accepted)) {
    const changed = {
      ...accepted,
      [metric]: Math.floor(baseline.original[metric] * 1.02 + baseline.extractionAllowance[metric] +
        (baseline.documentationAllowance?.[metric] ?? 0)) + 1,
    };
    assert.throws(() => assertArtifactBudget(changed, baseline), new RegExp(metric));
  }
});
test('does not omit formats, ignore extra chunks or accept invalid counters', () => {
  const { maps, ...missing } = accepted;
  void maps;
  assert.throws(() => assertArtifactBudget(missing, baseline), /metric set/);
  assert.throws(() => assertArtifactBudget({ ...accepted, hidden: 1 }, baseline), /metric set/);
  assert.throws(() => assertArtifactBudget({ ...accepted, esm: NaN }, baseline));
});

test('documentation growth cannot buy runtime, CSS, declaration or map growth', () => {
  assert.equal(baseline.documentationAllowance.tarball, 32352);
  for (const metric of ['esm', 'cjs', 'declarations', 'css', 'maps']) {
    assert.throws(() => assertArtifactBudget(accepted, {
      ...baseline, documentationAllowance: { tarball: 32352, [metric]: 1 },
    }), /archive metric/);
  }
  for (const tarball of [NaN, -1, 0.5, Infinity]) {
    assert.throws(() => assertArtifactBudget(accepted, {
      ...baseline, documentationAllowance: { tarball },
    }), /measured, explained/);
  }
  assert.throws(() => assertArtifactBudget(accepted, { ...baseline, documentationReason: '' }), /measured, explained/);
});

test('each package retains its own docs delta instead of spending the pooled React allowance', () => {
  const archives = Object.fromEntries(Object.entries(baseline.documentationPackages)
    .map(([name, entry]) => [name, entry.before + entry.allowance]));
  assertDocumentationArchiveBudget(archives, baseline);
  assert.deepEqual(Object.fromEntries(Object.entries(baseline.documentationPackages)
    .map(([name, entry]) => [name, entry.allowance])), {
    '@drasi/ui-core': 225, '@drasi/ui-styles': 179, '@drasi/react': 31948,
  });
  for (const [name, entry] of Object.entries(baseline.documentationPackages)) {
    assert.throws(() => assertDocumentationArchiveBudget({
      ...archives, [name]: Math.floor(entry.before * 1.02 + entry.allowance) + 1,
    }, baseline), /archive exceeds/);
  }
  assert.throws(() => assertDocumentationArchiveBudget({
    ...archives, '@drasi/ui-core': archives['@drasi/ui-core'] + 10_000,
    '@drasi/react': archives['@drasi/react'] - 10_000,
  }, baseline), /@drasi\/ui-core archive exceeds/);
  assert.throws(() => assertDocumentationArchiveBudget({ '@drasi/react': 1 }, baseline), /each package/);
});
