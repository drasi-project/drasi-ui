import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { releaseSetHash, validateReleaseSet } from './release-policy.mjs';
import { verifyCandidateFiles } from './verify-preview.mjs';

export async function qualifyCandidates(directory, evidence, expectedSource, runId) {
  const json = async file => JSON.parse(await readFile(file, 'utf8'));
  const bytes = await readFile(join(directory, 'release-set.json'));
  const set = await verifyCandidateFiles(directory, expectedSource);
  validateReleaseSet(set);
  const identities = set.packages.map(({ name, sha256 }) => ({ name, sha256 }));
  const packages = await json(join(directory, 'package-proof.json'));
  assert.equal(Object.keys(packages.packages).length, 3);
  for (const item of set.packages) assert.equal(packages.packages[item.name].sha256, item.sha256);
  const consumers = await json(join(evidence, 'consumers.json'));
  assert.deepEqual(consumers.artifacts, identities);
  assert.equal(consumers.source, set.source);
  for (const key of ['react18', 'react19', 'vue', 'examples', 'guide', 'guideNext']) assert(consumers.consumers[key]);
  const pnpm = await json(join(evidence, 'pnpm-proof.json'));
  assert.deepEqual(pnpm.artifacts, identities);
  assert(pnpm.guide && pnpm.guide.unusedStylesInstalled === false, 'The literal book must also pass pnpm');
  const dependencies = await json(join(evidence, 'dependency-audit/summary.json'));
  assert.deepEqual(dependencies.artifacts, identities);
  assert.equal(dependencies.productionAdvisories, 0);
  assert.equal(dependencies.developmentAdvisories, 0);
  const browsers = await json(join(evidence, 'browser-report.json'));
  assert.equal(browsers.config.metadata.candidateSetSha256, releaseSetHash(bytes));
  assert(browsers.stats.expected > 0 && browsers.stats.unexpected === 0 && browsers.stats.flaky === 0);
  const live = await json(join(evidence, 'live-guide/proof.json'));
  assert.equal(live.success, true);
  assert.equal(live.iteration, false, 'Iteration fixtures cannot qualify preview downloads');
  assert.deepEqual(live.artifacts, identities);
  assert.deepEqual(live.pageErrors, []);
  const guide = await json(join(evidence, 'consumer-proofs/developer-guide/proof.json'));
  assert.equal(live.bookSha256, guide.bookSha256);
  return {
    source: set.source, runId: runId ?? null, releaseSetSha256: releaseSetHash(bytes), humanAcceptance: false,
    checks: ['quality', 'packages', 'npm-consumers', 'pnpm-consumer', 'browsers', 'documentation',
      'released-backend', 'live-guide-auth-notifications-hmr-next', 'release-policy'],
  };
}
