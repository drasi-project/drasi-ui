import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { json } from './packages.mjs';

const consumers = await json('.artifacts/consumers.json');
await mkdir('.artifacts/dependency-audit', { recursive: true });
const summary = {};
for (const key of ['react18', 'react19', 'vue']) {
  const directory = consumers.consumers[key].directory;
  const reports = {};
  for (const scope of ['production', 'all']) {
    const result = spawnSync('npm', [
      'audit', '--json', '--registry=https://registry.npmjs.org',
      ...(scope === 'production' ? ['--omit=dev'] : []),
    ], { cwd: directory, encoding: 'utf8', timeout: 120_000 });
    if (result.error) throw result.error;
    await writeFile(`.artifacts/dependency-audit/${key}-${scope}.json`, result.stdout);
    assert(result.stdout, result.stderr);
    const report = JSON.parse(result.stdout);
    assert(!report.error, `Advisory service failed: ${JSON.stringify(report.error)}`);
    reports[scope] = report.metadata.vulnerabilities;
    assert.equal(result.status, 0, `${key} has ${scope} advisories; see the retained report`);
    console.log(`${key} ${scope} advisory counts: ${JSON.stringify(reports[scope])}`);
  }
  summary[key] = reports;
}
for (const major of [18, 19]) {
  const report = await json(`.artifacts/consumer-proofs/react-${major}-dependency-bytes.json`);
  for (const dependency of report.packages) {
    assert(['MIT', 'Apache-2.0', 'ISC', '0BSD', 'BSD-2-Clause', 'BSD-3-Clause'].includes(dependency.license),
      `Review the runtime dependency license for ${dependency.name}: ${dependency.license}`);
  }
}
await writeFile('.artifacts/dependency-audit/summary.json', JSON.stringify({
  artifacts: consumers.artifacts, productionAdvisories: 0,
  developmentAdvisories: 0, summary,
}, null, 2) + '\n');
