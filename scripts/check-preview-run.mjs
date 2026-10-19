import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const id = process.argv[2];
assert(/^[1-9]\d*$/.test(id ?? ''), 'Select a completed CI run ID');
assert.equal(process.env.GITHUB_REPOSITORY, 'drasi-project/drasi-ui');
assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
assert.equal(process.env.GITHUB_REF_PROTECTED, 'true');
const api = path => JSON.parse(execFileSync('gh', ['api', `repos/drasi-project/drasi-ui/${path}`], { encoding: 'utf8' }));
const run = api(`actions/runs/${id}`);
assert.equal(run.path, '.github/workflows/ci.yml');
assert.equal(run.event, 'push');
assert.equal(run.head_branch, 'main');
assert.equal(run.head_sha, process.env.GITHUB_SHA);
assert.equal(run.status, 'completed');
assert.equal(run.conclusion, 'success');
const { jobs } = api(`actions/runs/${id}/jobs?filter=latest&per_page=100`);
for (const name of ['Quality', 'Node 22 compatibility', 'Packed consumers', 'Release policy',
  'Backend / macOS Intel', 'Backend / Linux arm64', 'Learning builder / Windows']) {
  const matches = jobs.filter(job => job.name === name);
  assert.equal(matches.length, 1, `Missing or ambiguous required job ${name}`);
  assert.equal(matches[0].conclusion, 'success', `${name} has not passed`);
}
console.log(`Protected-main CI run ${id} qualifies the exact source ${run.head_sha}.`);
