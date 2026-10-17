import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { basename } from 'node:path';
import { releasePackages } from './packages.mjs';

export const repository = 'drasi-project/drasi-ui';
export const workflow = '.github/workflows/npm-release.yml';
export const registry = 'https://registry.npmjs.org/';

export function validateReleaseSet(set) {
  assert.equal(set.schema, 1);
  assert.equal(set.repository, repository);
  assert.equal(set.dirty, false, 'Release candidates must come from a clean protected checkout');
  assert.match(set.source, /^[a-f0-9]{40}$/);
  assert.deepEqual(set.packages.map(item => item.name), releasePackages.map(item => item.name), 'Unexpected release package or order');
  for (const item of set.packages) {
    assert.match(item.version, /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/);
    assert.equal(basename(item.filename), item.filename);
    assert.equal(item.filename, `${item.name.replace('@', '').replace('/', '-')}-${item.version}.tgz`);
    assert.match(item.sha256, /^[a-f0-9]{64}$/);
    assert.match(item.integrity, /^sha512-[A-Za-z0-9+/]+={0,2}$/);
    for (const [name, version] of Object.entries(item.dependencies)) {
      assert(!/^(?:file:|workspace:|link:|git|https?:)/.test(version));
      if (name.startsWith('@drasi/')) assert.equal(version, set.packages.find(pkg => pkg.name === name)?.version);
    }
  }
}

export const releaseSetHash = bytes => createHash('sha256').update(bytes).digest('hex');

export function assertProtectedContext(env, set, operation) {
  assert.equal(env.GITHUB_ACTIONS, 'true', 'Release operations run only in GitHub Actions');
  assert.equal(env.RUNNER_ENVIRONMENT, 'github-hosted', 'Use a GitHub-hosted OIDC runner');
  assert.equal(env.GITHUB_REPOSITORY, repository);
  assert.equal(env.GITHUB_REF, 'refs/heads/main', 'Release from protected main, never a branch or arbitrary tag');
  assert.equal(env.DRASI_RELEASE_ENVIRONMENT, 'npm-release');
  if (operation === 'stage') {
    assert.equal(env.GITHUB_SHA, set.source,
      'Staging must attest the candidate source; resume the original workflow run if main has advanced');
  }
  if (operation === 'stage' || operation === 'promote-latest') {
    assert(env.ACTIONS_ID_TOKEN_REQUEST_URL && env.ACTIONS_ID_TOKEN_REQUEST_TOKEN, 'OIDC permission is required');
    assert(!env.NODE_AUTH_TOKEN && !env.NPM_TOKEN, 'Long-lived npm write-token fallback is forbidden');
  }
}

export function assertHumanApprovals(env, hash) {
  assert(env.NPM_ACCOUNT_APPROVAL, 'Missing maintainer-owned npm account/trusted-publisher approval');
  const accounts = JSON.parse(env.NPM_ACCOUNT_APPROVAL);
  assert.equal(accounts.repository, repository);
  assert.equal(accounts.workflow, 'npm-release.yml');
  assert.equal(accounts.environment, 'npm-release');
  assert.deepEqual(accounts.packages, releasePackages.map(item => item.name));
  assert(Array.isArray(accounts.maintainers) && new Set(accounts.maintainers).size >= 2 &&
    accounts.maintainers.every(name => typeof name === 'string' && name.length > 0), 'Two distinct npm maintainers are required');
  for (const flag of ['twoFactorVerified', 'ownershipVerified', 'trustedPublishersVerified']) assert.equal(accounts[flag], true);
  assert(env.HUMAN_ACCESSIBILITY_ACCEPTANCE, 'Automated checks are not human accessibility acceptance');
  const acceptance = JSON.parse(env.HUMAN_ACCESSIBILITY_ACCEPTANCE);
  assert.equal(acceptance.candidateSha256, hash, 'Human acceptance must identify these exact candidates');
  assert.equal(acceptance.decision, 'accepted');
  assert(typeof acceptance.reviewer === 'string' && acceptance.reviewer.length > 0);
  assert(typeof acceptance.reportUrl === 'string' && acceptance.reportUrl.startsWith('https://'));
  assert(Array.isArray(acceptance.screenReaders) && acceptance.screenReaders.length > 0 &&
    acceptance.screenReaders.every(item => typeof item === 'string' && item.length > 0));
  assert(Number.isFinite(Date.parse(acceptance.completedAt)));
}

export function assertLatestVersions(set) {
  assert(set.packages.every(item => !item.version.includes('-')), 'A beta must never be relabeled stable');
}

export function assertProvenance(statement, item, source) {
  assert.equal(statement.predicateType, 'https://slsa.dev/provenance/v1');
  const definition = statement.predicate?.buildDefinition;
  assert.equal(definition?.externalParameters?.workflow?.repository, `https://github.com/${repository}`);
  assert.equal(definition.externalParameters.workflow.path, workflow);
  assert.equal(definition.externalParameters.workflow.ref, 'refs/heads/main');
  assert(definition.resolvedDependencies?.some(dependency =>
    dependency.uri === `git+https://github.com/${repository}@refs/heads/main` &&
    dependency.digest?.gitCommit === source), 'Provenance identifies a different source');
  const digest = Buffer.from(item.integrity.slice('sha512-'.length), 'base64').toString('hex');
  assert(statement.subject?.some(subject => subject.digest?.sha512 === digest), 'Provenance identifies different tarball bytes');
}
