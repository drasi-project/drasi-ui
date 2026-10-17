import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { candidateDirectory, json } from './packages.mjs';
import {
  assertHumanApprovals, assertLatestVersions, assertProtectedContext, assertProvenance,
  registry, releaseSetHash, repository, validateReleaseSet, workflow,
} from './release-policy.mjs';

const operation = process.argv[2];
assert(['stage', 'verify', 'promote-latest'].includes(operation), 'Select an explicit release operation');
const bytes = await readFile(join(candidateDirectory, 'release-set.json'));
const set = JSON.parse(bytes);
validateReleaseSet(set);
assertProtectedContext(process.env, set, operation);
assertHumanApprovals(process.env, releaseSetHash(bytes));
const qualification = await json(join(candidateDirectory, 'qualification.json'));
assert.equal(qualification.releaseSetSha256, releaseSetHash(bytes));
assert.equal(qualification.source, set.source);
assert.equal(qualification.humanAcceptance, false, 'Technical tests must not claim human approval');
assert.deepEqual(qualification.checks, ['quality', 'packages', 'npm-consumers', 'pnpm-consumer', 'browsers', 'documentation', 'release-policy']);
assert.match(process.env.CANDIDATE_RUN_ID ?? '', /^\d+$/);
const github = await fetch(`https://api.github.com/repos/${repository}/actions/runs/${process.env.CANDIDATE_RUN_ID}`, {
  headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json' },
  signal: AbortSignal.timeout(30_000), redirect: 'error',
});
assert(github.ok, `Cannot verify candidate run (${github.status})`);
const run = await github.json();
assert.equal(run.path, workflow);
assert.equal(run.event, 'workflow_dispatch');
assert.equal(run.head_branch, 'main');
assert.equal(run.head_sha, set.source);
assert.equal(run.head_repository.full_name, repository);
assert.equal(run.conclusion, 'success', 'Candidate qualification did not succeed');
assert.equal(String(qualification.runId), process.env.CANDIDATE_RUN_ID);
for (const item of set.packages) {
  const body = await readFile(join(candidateDirectory, item.filename));
  assert.equal(createHash('sha256').update(body).digest('hex'), item.sha256);
  assert.equal(`sha512-${createHash('sha512').update(body).digest('base64')}`, item.integrity);
}

function npm(args, cwd, receipt) {
  const result = spawnSync('npm', [...args, '--registry=https://registry.npmjs.org'], {
    cwd, encoding: 'utf8', timeout: 600_000, maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (receipt) receipt.output = `${result.stdout}\n${result.stderr}`;
  assert.equal(result.status, 0,
    `npm ${args[0]} failed. Retain the receipt; never rebuild or overwrite a partially released version.\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}
assert.equal(npm(['--version']).trim(), '11.21.0', 'Release tooling must remain pinned');
const progress = { source: set.source, releaseSetSha256: releaseSetHash(bytes), operation, packages: [] };
await mkdir('.artifacts/release-progress', { recursive: true });

async function registryJson(url) {
  assert(typeof url === 'string', 'Missing registry/provenance URL');
  assert.equal(new URL(url).origin, new URL(registry).origin, 'Unapproved registry endpoint');
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30_000), redirect: 'error', headers: { 'Cache-Control': 'no-cache' },
  });
  assert(response.ok, response.status === 404
    ? 'Package ownership is not bootstrapped. This workflow will not create a public 0.0.0-stage placeholder.'
    : `Registry read failed (${response.status})`);
  return response.json();
}
async function state(item) {
  const packument = await registryJson(`${registry}${encodeURIComponent(item.name)}`);
  assert.equal(packument.name, item.name);
  return { item, published: packument.versions?.[item.version] ?? null };
}
async function verifyPublished({ item, published }) {
  assert(published, `${item.name}@${item.version} is not public; an npm maintainer must approve its staged package first`);
  assert.equal(published.name, item.name);
  assert.equal(published.version, item.version);
  assert.deepEqual(published.dependencies ?? {}, item.dependencies);
  assert.equal(published.dist?.integrity, item.integrity, 'An immutable registry version has different bytes');
  const tarball = published.dist.tarball;
  assert.equal(new URL(tarball).origin, new URL(registry).origin);
  const response = await fetch(tarball, { signal: AbortSignal.timeout(30_000), redirect: 'error' });
  assert(response.ok);
  assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'), item.sha256);
  const attestations = await registryJson(published.dist.attestations?.url);
  const entry = attestations.attestations?.find(value => value.predicateType === 'https://slsa.dev/provenance/v1');
  assert(entry?.bundle?.dsseEnvelope?.payload, 'Missing npm provenance bundle');
  assertProvenance(JSON.parse(Buffer.from(entry.bundle.dsseEnvelope.payload, 'base64').toString('utf8')), item, set.source);
}
async function verifyRegistryInstall(items = set.packages) {
  const directory = await mkdtemp(join(tmpdir(), 'drasi-registry-verification-'));
  try {
    await writeFile(join(directory, 'package.json'), JSON.stringify({
      name: 'drasi-registry-verification', version: '0.0.0', private: true,
      dependencies: {
        ...Object.fromEntries(items.map(item => [item.name, item.version])),
        react: '19.3.1', 'react-dom': '19.3.1',
      },
    }, null, 2));
    npm(['install', '--ignore-scripts'], directory);
    const lock = await json(join(directory, 'package-lock.json'));
    for (const item of items) assert.equal(lock.packages[`node_modules/${item.name}`].integrity, item.integrity);
    // This verifies registry signatures and Sigstore bundles, not just their presence.
    const audit = npm(['audit', 'signatures'], directory);
    await writeFile('.artifacts/release-progress/registry-lock.json', JSON.stringify(lock, null, 2));
    await writeFile('.artifacts/release-progress/signatures.log', audit);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

try {
  const states = await Promise.all(set.packages.map(state));
  if (operation === 'stage') {
    const published = states.filter(current => current.published);
    for (const current of published) await verifyPublished(current);
    if (published.length) await verifyRegistryInstall(published.map(current => current.item));
    for (const current of states) {
      if (current.published) {
        await verifyPublished(current);
        progress.packages.push({ name: current.item.name, status: 'already-published-identical' });
        continue;
      }
      if (current.item.name === '@drasi/react') {
        for (const dependency of states.slice(0, 2)) await verifyPublished(dependency);
      }
      const receipt = { name: current.item.name, version: current.item.version, sha256: current.item.sha256, status: 'submitting' };
      progress.packages.push(receipt);
      npm(['stage', 'publish', join(candidateDirectory, current.item.filename),
        '--tag', 'next', '--access', 'public', '--provenance', '--ignore-scripts'], undefined, receipt);
      receipt.status = 'staged-awaiting-human-2fa';
      console.log(`${current.item.name} submitted for human npm approval. No approval was automated. Resume this same workflow run only after approval.`);
      break;
    }
  } else {
    for (const current of states) await verifyPublished(current);
    await verifyRegistryInstall();
    if (operation === 'promote-latest') {
      assertLatestVersions(set);
      assert(process.env.REGISTRY_ADOPTION_ACCEPTANCE, 'Registry adoption acceptance is required before latest');
      const adoption = JSON.parse(process.env.REGISTRY_ADOPTION_ACCEPTANCE);
      assert.equal(adoption.candidateSha256, releaseSetHash(bytes));
      assert.equal(adoption.decision, 'accepted');
      assert(typeof adoption.reportUrl === 'string' && adoption.reportUrl.startsWith('https://'));
      for (const item of set.packages) {
        const receipt = { name: item.name, version: item.version, status: 'promoting-latest' };
        progress.packages.push(receipt);
        npm(['dist-tag', 'add', `${item.name}@${item.version}`, 'latest'], undefined, receipt);
        const tagged = await registryJson(`${registry}${encodeURIComponent(item.name)}`);
        assert.equal(tagged['dist-tags']?.latest, item.version, 'Registry did not confirm the requested latest tag');
        receipt.status = 'latest';
      }
    }
  }
} finally {
  await writeFile('.artifacts/release-progress/progress.json', JSON.stringify(progress, null, 2) + '\n');
}
