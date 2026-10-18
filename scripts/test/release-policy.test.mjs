import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertHumanApprovals, assertLatestVersions, assertProtectedContext,
  assertProvenance, validateReleaseSet,
} from '../release-policy.mjs';

const packages = ['@drasi/ui-core', '@drasi/ui-styles', '@drasi/react'];
const set = {
  schema: 1, repository: 'drasi-project/drasi-ui', dirty: false, source: 'a'.repeat(40),
  packages: packages.map(name => ({
    name, version: '0.1.0-beta.1', filename: `${name.replace('@', '').replace('/', '-')}-0.1.0-beta.1.tgz`,
    sha256: 'b'.repeat(64), integrity: `sha512-${Buffer.alloc(64).toString('base64')}`,
    dependencies: name === '@drasi/react' ? { '@drasi/ui-core': '0.1.0-beta.1' } : {},
  })),
};
const environment = {
  GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', GITHUB_REPOSITORY: set.repository,
  GITHUB_REF: 'refs/heads/main', GITHUB_SHA: set.source, DRASI_RELEASE_ENVIRONMENT: 'npm-release',
  GITHUB_REF_PROTECTED: 'true',
  ACTIONS_ID_TOKEN_REQUEST_URL: 'https://example.invalid/oidc', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'test-only-placeholder',
};
test('allowlist, immutable identities and dependency order are mandatory', () => {
  validateReleaseSet(set);
  for (const changed of [
    { ...set, dirty: true }, { ...set, repository: 'someone/else' },
    { ...set, packages: set.packages.slice().reverse() },
    { ...set, packages: [...set.packages, { name: '@drasi/vue' }] },
    { ...set, packages: [{ ...set.packages[0], filename: '../escape.tgz' }, ...set.packages.slice(1)] },
  ]) assert.throws(() => validateReleaseSet(changed));
});
test('staging requires protected main, the exact candidate source and OIDC without write tokens', () => {
  assertProtectedContext(environment, set, 'stage');
  for (const override of [
    { GITHUB_REF: 'refs/heads/review' }, { GITHUB_REF: 'refs/tags/v1' },
    { GITHUB_SHA: 'c'.repeat(40) }, { RUNNER_ENVIRONMENT: 'self-hosted' },
    { GITHUB_REF_PROTECTED: 'false' },
    { DRASI_RELEASE_ENVIRONMENT: '' }, { NODE_AUTH_TOKEN: 'test-only-placeholder' },
    { ACTIONS_ID_TOKEN_REQUEST_TOKEN: '' },
  ]) assert.throws(() => assertProtectedContext({ ...environment, ...override }, set, 'stage'));
});
test('automation cannot supply missing human accessibility or account acceptance', () => {
  assert.throws(() => assertHumanApprovals({}, 'd'.repeat(64)));
  const accounts = JSON.stringify({
    repository: set.repository, workflow: 'npm-release.yml', environment: 'npm-release',
    packages, maintainers: ['test-maintainer-one', 'test-maintainer-two'],
    twoFactorVerified: true, ownershipVerified: true, trustedPublishersVerified: true,
  });
  assert.throws(() => assertHumanApprovals({ NPM_ACCOUNT_APPROVAL: accounts }, 'd'.repeat(64)),
    /not human accessibility/);
  const acceptance = {
    candidateSha256: 'd'.repeat(64), decision: 'accepted', reviewer: 'test-reviewer',
    reportUrl: 'https://example.invalid/review', screenReaders: ['test-only AT record'], completedAt: '2026-10-17',
  };
  assertHumanApprovals({ NPM_ACCOUNT_APPROVAL: accounts, HUMAN_ACCESSIBILITY_ACCEPTANCE: JSON.stringify(acceptance) }, 'd'.repeat(64));
  assert.throws(() => assertHumanApprovals({
    NPM_ACCOUNT_APPROVAL: accounts, HUMAN_ACCESSIBILITY_ACCEPTANCE: JSON.stringify(acceptance),
  }, 'e'.repeat(64)));
});
test('beta versions cannot be promoted to latest', () => {
  assert.throws(() => assertLatestVersions(set), /beta/);
  assertLatestVersions({ ...set, packages: set.packages.map(item => ({ ...item, version: '0.1.0' })) });
});
test('provenance must bind exact bytes to this protected workflow and source', () => {
  const statement = {
    predicateType: 'https://slsa.dev/provenance/v1', subject: [{ digest: { sha512: '00'.repeat(64) } }],
    predicate: { buildDefinition: {
      externalParameters: { workflow: {
        repository: 'https://github.com/drasi-project/drasi-ui', path: '.github/workflows/npm-release.yml', ref: 'refs/heads/main',
      } },
      resolvedDependencies: [{ uri: 'git+https://github.com/drasi-project/drasi-ui@refs/heads/main', digest: { gitCommit: set.source } }],
    } },
  };
  assertProvenance(statement, set.packages[0], set.source);
  assert.throws(() => assertProvenance(statement, set.packages[0], 'c'.repeat(40)));
  assert.throws(() => assertProvenance({ ...statement, subject: [] }, set.packages[0], set.source));
});
