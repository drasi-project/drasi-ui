import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { candidateDirectory, json } from './packages.mjs';
import { releaseSetHash, validateReleaseSet } from './release-policy.mjs';

const bytes = await readFile(join(candidateDirectory, 'release-set.json'));
const set = JSON.parse(bytes);
validateReleaseSet(set);
assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
assert.equal(process.env.GITHUB_SHA, set.source);
const packages = await json(join(candidateDirectory, 'package-proof.json'));
assert.equal(Object.keys(packages.packages).length, 3);
for (const item of set.packages) assert.equal(packages.packages[item.name].sha256, item.sha256);
const consumers = await json('.artifacts/consumers.json');
const identities = set.packages.map(({ name, sha256 }) => ({ name, sha256 }));
assert.deepEqual(consumers.artifacts, identities);
for (const key of ['react18', 'react19', 'vue', 'examples']) assert(consumers.consumers[key]);
const pnpm = await json('.artifacts/pnpm-proof.json');
assert.deepEqual(pnpm.artifacts, identities);
const dependencies = await json('.artifacts/dependency-audit/summary.json');
assert.deepEqual(dependencies.artifacts, identities);
assert.equal(dependencies.productionAdvisories, 0);
const browsers = await json('.artifacts/browser-report.json');
assert.equal(browsers.config.metadata.candidateSetSha256, releaseSetHash(bytes));
assert(browsers.stats.expected > 0 && browsers.stats.unexpected === 0 && browsers.stats.flaky === 0);
await writeFile(join(candidateDirectory, 'qualification.json'), JSON.stringify({
  source: set.source, runId: process.env.GITHUB_RUN_ID,
  releaseSetSha256: releaseSetHash(bytes), humanAcceptance: false,
  checks: ['quality', 'packages', 'npm-consumers', 'pnpm-consumer', 'browsers', 'documentation', 'release-policy'],
}, null, 2) + '\n');
