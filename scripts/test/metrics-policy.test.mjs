import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { assertArtifactBudget } from '../metrics-policy.mjs';

const baseline = JSON.parse(await readFile(new URL('../../tests/contracts/artifact-baseline.json', import.meta.url)));
const accepted = Object.fromEntries(Object.keys(baseline.original).map(key =>
  [key, baseline.original[key] + baseline.extractionAllowance[key]]));
test('counts the complete multi-package set with explicit extraction deltas', () => {
  assertArtifactBudget(accepted, baseline);
  assert.equal(baseline.extractionAllowance.css, baseline.original.css);
});
test('rejects each metric independently above the retained 2% bound', () => {
  for (const metric of Object.keys(accepted)) {
    const changed = {
      ...accepted,
      [metric]: Math.floor(baseline.original[metric] * 1.02 + baseline.extractionAllowance[metric]) + 1,
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
