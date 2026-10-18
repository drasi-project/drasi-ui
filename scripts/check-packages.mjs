import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import ts from 'typescript';
import { publint } from 'publint';
import { checkArtifact } from '../tests/consumers/public-contract/artifact-graphs.mjs';
import { candidateDirectory, json, releasePackages, root } from './packages.mjs';
import { assertArtifactBudget, assertDocumentationArchiveBudget } from './metrics-policy.mjs';
import { applyGuideArchiveAllowance, guideAssets, inspectGuideAssets } from './guide-assets.mjs';

const set = await json(join(candidateDirectory, 'release-set.json'));
assert.equal(set.repository, 'drasi-project/drasi-ui');
assert.deepEqual(set.packages.map(item => item.name), releasePackages.map(item => item.name));
const output = join(root, '.artifacts', `inspection-${basename(candidateDirectory)}`);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const proof = { packages: {}, totals: { tarball: 0, esm: 0, cjs: 0, declarations: 0, css: 0, maps: 0 } };
const styles = [];
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}
for (const item of set.packages) {
  assert.equal(basename(item.filename), item.filename);
  const artifact = join(candidateDirectory, item.filename);
  const bytes = await readFile(artifact);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256);
  assert.equal(`sha512-${createHash('sha512').update(bytes).digest('base64')}`, item.integrity);
  const entries = run('tar', ['-tzf', artifact]).trim().split('\n');
  assert(entries.every(entry => entry.startsWith('package/') && !entry.split('/').includes('..')), 'Unsafe archive path');
  const target = join(output, item.name.split('/')[1]);
  await mkdir(target);
  run('tar', ['-xzf', artifact, '-C', target]);
  const packageRoot = join(target, 'package');
  const manifest = await json(join(packageRoot, 'package.json'));
  assert.equal(manifest.name, item.name);
  assert.equal(manifest.version, item.version);
  assert.notEqual(manifest.private, true, 'Only explicitly prepared public packages may be candidates');
  assert.equal(manifest.repository.url, 'git+https://github.com/drasi-project/drasi-ui.git');
  assert.equal(manifest.repository.directory, releasePackages.find(pkg => pkg.name === item.name).directory);
  assert.equal(manifest.publishConfig.access, 'public');
  for (const name of ['LICENSE', 'NOTICE']) {
    assert.deepEqual(await readFile(join(packageRoot, name)), await readFile(join(root, name)));
  }
  assert(!manifest.scripts?.prepare && !manifest.scripts?.postinstall && !manifest.scripts?.prepack,
    'Consumers and publication must not rebuild the qualified artifact');
  for (const [name, version] of Object.entries(manifest.dependencies ?? {})) {
    assert(!/^(?:workspace:|file:|link:|git|https?:)/.test(version), 'Unresolved local dependency');
    if (name.startsWith('@drasi/')) assert.equal(version, set.packages.find(pkg => pkg.name === name)?.version);
  }
  const metrics = { tarball: bytes.length, esm: 0, cjs: 0, declarations: 0, css: 0, maps: 0 };
  const lessons = await inspectGuideAssets(packageRoot, item.name, entries.map(entry => entry.slice('package/'.length)));
  for (const entry of entries) {
    const file = entry.slice('package/'.length);
    assert(!/^(?:src|test|tests|examples|node_modules|scripts)\//.test(file), `Unintended packed source: ${file}`);
    assert(!/(?:^|\/)(?:\.npmrc|\.env(?:\..*)?|package-lock\.json)$/.test(file), `Unintended configuration: ${file}`);
    if (Object.hasOwn(lessons.assets, file)) {
      assert(item.name === '@drasi/react' && guideAssets.has(file), 'Unclassified documentation asset');
      continue; // Accounted below as an explicit lesson asset, never as product JavaScript/CSS.
    }
    let kind;
    if (/\.d\.(?:ts|cts|mts)$/.test(file)) kind = 'declarations';
    else if (/\.(?:js|mjs)$/.test(file)) kind = 'esm';
    else if (/\.cjs$/.test(file)) kind = 'cjs';
    else if (/\.css$/.test(file)) kind = 'css';
    else if (/\.map$/.test(file)) kind = 'maps';
    if (kind) metrics[kind] += (await readFile(join(packageRoot, file))).length;
    if (kind === 'esm' || kind === 'cjs') {
      const code = await readFile(join(packageRoot, file), 'utf8');
      const map = await json(join(packageRoot, `${file}.map`));
      assert.equal(map.version, 3);
      const client = item.name === '@drasi/react' && !file.startsWith('dist/client/');
      assert.equal(/^["']use client["'];/.test(code), client, `Incorrect client directive in ${item.name}/${file}`);
    }
  }
  const { messages } = await publint({ pkgDir: packageRoot, level: 'suggestion' });
  // Browser/CSS packages do not inherit the maintainer Node pin as an install
  // restriction. Retain this specific informational recommendation in the proof.
  const blocking = messages.filter(message =>
    message.type !== 'suggestion' || message.code !== 'USE_ENGINES_NODE');
  assert.deepEqual(blocking, [], `publint ${item.name}: ${JSON.stringify(messages)}`);
  const code = releasePackages.find(pkg => pkg.name === item.name).code;
  const graph = code ? await checkArtifact(ts, packageRoot, manifest, item.name === '@drasi/ui-core' ? 'core' : 'react') : null;
  if (code) {
    const report = spawnSync(join(root, 'node_modules/.bin/attw'), [
      artifact, '--no-definitely-typed', '--profile', 'node16', '--format', 'json',
      ...(item.name === '@drasi/react' ? ['--exclude-entrypoints', './styles.css'] : []),
    ], { encoding: 'utf8' });
    if (report.error) throw report.error;
    const reportFile = join(output, `${item.name.split('/')[1]}-attw.json`);
    await writeFile(reportFile, report.stdout);
    assert.equal(report.status, 0, `ATWT exports-aware NodeNext/bundler check failed; full report: ${reportFile}\n${report.stderr}`);
  } else {
    assert.equal(metrics.esm + metrics.cjs, 0, 'Styles must not ship a JavaScript runtime');
  }
  if (item.name !== '@drasi/ui-core') {
    const style = manifest.exports['./styles.css'];
    assert.equal(style.import.default, style.require.default);
    for (const condition of ['import', 'require']) {
      const declarations = await readFile(join(packageRoot, style[condition].types), 'utf8');
      assert.match(declarations, /export \{\};/);
    }
    styles.push(await readFile(join(packageRoot, style.import.default)));
  }
  proof.packages[item.name] = { version: item.version, sha256: item.sha256, metrics, graph, publint: messages, lessons };
  for (const metric of Object.keys(metrics)) proof.totals[metric] += metrics[metric];
}
assert.equal(styles.length, 2);
assert.deepEqual(styles[0], styles[1], 'React compatibility CSS must match the styles tarball exactly');
assert.deepEqual(styles[0], await readFile(join(root, 'packages/styles/src/styles.css')));
const baseline = await json(join(root, 'tests/contracts/artifact-baseline.json'));
const revision = await json(join(root, 'tests/contracts/guide-usability-assets.json'));
assert.deepEqual(proof.packages['@drasi/react'].lessons.assets, revision.assets,
  'Lesson asset identities changed; measure/classify the intentional delta rather than silently excluding it');
const adjusted = applyGuideArchiveAllowance(proof.totals,
  Object.fromEntries(Object.entries(proof.packages).map(([name, item]) => [name, item.metrics.tarball])), revision);
assertArtifactBudget(adjusted.totals, baseline);
assertDocumentationArchiveBudget(adjusted.archives, baseline);
proof.guideArchiveAllowance = revision.archiveAllowance;
await writeFile(join(candidateDirectory, 'package-proof.json'), JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify(proof.totals));
console.log('Exact candidate exports, declarations, maps, directives, notices, CSS and package linters passed.');
