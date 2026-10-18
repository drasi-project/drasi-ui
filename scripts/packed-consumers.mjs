import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { candidateDirectory, json, root } from './packages.mjs';
import { copyConsumer, installConsumer, run } from './consumer-install.mjs';
import { assertFrameworkIsolation, checkPackedPublicContract } from '../tests/consumers/public-contract/packed-contracts.mjs';
import { installedDependencyAccounting } from './dependency-accounting.mjs';
import { measureEmittedAssets } from './metrics-policy.mjs';
import { prepareGuideConsumer, prepareNextGuideConsumer } from './guide-consumer.mjs';

const set = await json(join(candidateDirectory, 'release-set.json'));
assert(await readFile(join(candidateDirectory, 'package-proof.json')), 'Validate candidates before installing consumers');
const directory = await realpath(await mkdtemp(join(tmpdir(), 'drasi-ui-consumers-')));
const runList = join(root, '.artifacts/consumer-runs.json');
const runs = existsSync(runList) ? await json(runList) : [];
await writeFile(runList, JSON.stringify([...runs, directory], null, 2) + '\n');
console.log(`Preparing isolated consumers: ${directory}`);
const output = join(root, '.artifacts', 'consumer-proofs');
await mkdir(output, { recursive: true });
const proof = { directory, source: set.source, artifacts: set.packages.map(({ name, sha256 }) => ({ name, sha256 })), consumers: {} };
const coreOnly = join(directory, 'core-only');
await installConsumer({
  directory: coreOnly, set,
  manifest: {
    name: 'drasi-core-contract', version: '0.0.0', private: true, type: 'module',
    dependencies: { '@drasi/ui-core': set.packages[0].version, '@drasi/ui-styles': set.packages[1].version },
    devDependencies: { typescript: '5.9.3' },
  },
});
await assertFrameworkIsolation(coreOnly);

for (const major of [18, 19]) {
  const app = join(directory, `react-${major}`);
  await installConsumer({ directory: app, source: `tests/consumers/react-${major}`, set, scripts: major === 18 });
  await copyConsumer(join(root, 'tests/consumers/components'), join(app, 'component-fixture'));
  await mkdir(join(app, 'table-fixture'));
  for (const file of ['table-contract-client.tsx', 'table-contract-ssr.ts', 'table-contract-view.tsx']) {
    await copyFile(join(root, 'tests/browser', file), join(app, 'table-fixture', file));
  }
  const report = await checkPackedPublicContract({
    coreOnly, app, output: join(output, `react-${major}`), includeCore: major === 18,
  });
  const pinnedLock = await readFile(join(app, 'package-lock.json'));
  run('npm', ['run', 'build'], app);
  run(join(app, 'node_modules/.bin/vite'), ['build', '--config', 'component-fixture/vite.config.mjs'], app);
  if (major === 19) run('npm', ['run', 'build:next'], app);
  assert.deepEqual(await readFile(join(app, 'package-lock.json')), pinnedLock, 'A framework build changed the pinned dependency graph');
  const graph = JSON.parse(run('npm', ['ls', '--all', '--omit=dev', '--json'], app));
  await writeFile(join(output, `react-${major}-installed-dependencies.json`), JSON.stringify(graph, null, 2) + '\n');
  const dependencies = await installedDependencyAccounting(app, ['@drasi/ui-core', '@drasi/ui-styles', '@drasi/react']);
  await writeFile(join(output, `react-${major}-dependency-bytes.json`), JSON.stringify(dependencies, null, 2) + '\n');
  proof.consumers[`react${major}`] = {
    directory: app, version: report.react, scriptsEnabled: major === 18,
    assets: await measureEmittedAssets(join(app, 'dist')),
    ...(major === 19 ? { nextAssets: await measureEmittedAssets(join(app, '.next/static')) } : {}),
  };
}
const vue = join(directory, 'vue');
await installConsumer({ directory: vue, source: 'examples/vue-canary', set });
await assertFrameworkIsolation(vue, true);
const host = await readFile(join(root, 'tests/contracts/host.ts'));
assert.deepEqual(await readFile(join(vue, '.generated/host.ts')), host, 'Vue uses a different contract fixture');
run('npm', ['run', 'build'], vue);
const vueRequire = createRequire(join(vue, 'package.json'));
proof.consumers.vue = {
  directory: vue, version: vueRequire('vue/package.json').version,
  sharedFixtureSha256: createHash('sha256').update(host).digest('hex'),
  assets: await measureEmittedAssets(join(vue, 'dist')),
};
const example = join(directory, 'examples-react');
await installConsumer({ directory: example, source: 'examples/react', set });
run('npm', ['run', 'typecheck'], example);
run('npm', ['test'], example);
run('npm', ['run', 'build'], example);
proof.consumers.examples = { directory: example };
proof.consumers.guide = await prepareGuideConsumer({
  packageRoot: join(directory, 'react-18/node_modules/@drasi/react'),
  directory: join(directory, 'developer-guide'), set,
});
proof.consumers.guideNext = await prepareNextGuideConsumer({
  packageRoot: join(directory, 'react-19/node_modules/@drasi/react'),
  directory: join(directory, 'developer-guide-next'), set,
});
await writeFile(join(root, '.artifacts/consumers.json'), JSON.stringify(proof, null, 2) + '\n');
console.log(`Source-free npm consumers ready for browser qualification: ${directory}`);
