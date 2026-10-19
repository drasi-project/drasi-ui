// Verifies the actual PowerShell clean-clone route after its documented install/build commands.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { npmCli, spawnNpmSync } from './node-cli.mjs';
import { readArchive } from './verify-preview.mjs';

assert.equal(process.argv.length, 4, 'Usage: verify-learning-builder.mjs INITIAL_STATE OUTPUT_PROOF');
const root = fileURLToPath(new URL('../', import.meta.url));
const initial = JSON.parse(await readFile(process.argv[2], 'utf8'));
const kitDirectory = join(root, '.artifacts/learning-build/kit');
const kit = JSON.parse(await readFile(join(kitDirectory, 'learning-kit.json'), 'utf8'));
const set = JSON.parse(await readFile(join(kitDirectory, 'artifacts/release-set.json'), 'utf8'));
assert.deepEqual(initial.initialPaths, Object.fromEntries([
  '.artifacts', 'node_modules', 'packages/core/dist', 'packages/react/dist', 'packages/styles/dist',
].map(path => [path, false])));
assert.equal(initial.checkoutContainsSpaces, true);
assert(root.includes(' '), 'The native clone path must contain spaces');
assert.equal(initial.source, set.source);
assert.equal(set.dirty, false);
if (process.env.DRASI_EXPECT_PLATFORM) assert.equal(process.platform, process.env.DRASI_EXPECT_PLATFORM);
assert.equal(existsSync(join(root, 'node_modules')), false, 'Builder installed the original workspace');
const builderManifest = JSON.parse(await readFile(join(root, '.artifacts/learning-build/source/package.json')));
assert.deepEqual(Object.keys(builderManifest.devDependencies).sort(),
  ['tsup', 'typescript', 'marked', '@types/node', '@types/react', '@types/react-dom', 'react', 'react-dom'].sort());
const app = join(kitDirectory, 'starter');
const lock = JSON.parse(await readFile(join(app, 'package-lock.json')));
assert(!Object.keys(lock.packages).some(path => /node_modules\/(?:next|vue|playwright|@playwright\/|@vue\/)/.test(path)));
assert.equal(existsSync(join(app, 'node_modules/@drasi/ui-styles')), false);
const owner = await realpath(app);
for (const item of set.packages.filter(item => item.name !== '@drasi/ui-styles')) {
  const installed = await realpath(join(app, 'node_modules', item.name));
  assert(!relative(owner, installed).replaceAll('\\', '/').startsWith('../'), 'Installed library escaped its consumer');
  assert.equal(lock.packages[`node_modules/${item.name}`].integrity, item.integrity);
  const files = readArchive(await readFile(join(kitDirectory, 'artifacts', item.filename)));
  for (const [path, bytes] of files) assert.deepEqual(await readFile(join(installed, path)), bytes);
}
for (const extension of ['js', 'cjs']) {
  assert(!/^["']use client["'];/.test(await readFile(join(app, `node_modules/@drasi/react/dist/client/index.${extension}`), 'utf8')),
    'Windows path separators added a React directive to the data-only compatibility entrypoint');
}
const render = join(app, 'verify-render.cjs');
await copyFile(new URL('../tests/consumers/public-contract/install-render.cjs', import.meta.url), render);
const renders = [];
for (const format of ['esm', 'cjs']) {
  const result = spawnSync(process.execPath, [render, format, 'single-react'], {
    cwd: app, encoding: 'utf8', env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' },
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  renders.push(JSON.parse(result.stdout));
}
const npm = spawnNpmSync(['--version'], { encoding: 'utf8' });
if (npm.error) throw npm.error;
assert.equal(npm.status, 0, npm.stderr);
assert.equal(initial.shellNodeVersion, process.version);
assert.equal(initial.shellNpmVersion, npm.stdout.trim(), 'Builder and documented shell selected different npm installations');
const { createServer } = await import(pathToFileURL(join(app, 'node_modules/vite/dist/node/index.js')).href);
const server = await createServer({ root: app, configFile: join(app, 'vite.config.mjs'),
  server: { host: '127.0.0.1', port: 15483, strictPort: true } });
try {
  await server.listen();
  const response = await fetch('http://127.0.0.1:15483');
  assert.equal(response.status, 200);
  assert((await response.text()).includes('/src/main.tsx'));
  const module = await fetch('http://127.0.0.1:15483/src/main.tsx');
  assert.equal(module.status, 200);
  assert((await module.text()).includes('ColdStorage'));
} finally { await server.close(); }
assert(!existsSync(join(app, '.cold-storage-backend')), 'Builder unexpectedly launched a backend');
const proof = {
  success: true, source: set.source, ...initial,
  platform: process.platform, arch: process.arch, node: process.version, npm: npm.stdout.trim(),
  npmJavaScriptCli: npmCli(), originalWorkspaceInstalled: false,
  builderDirectDependencies: Object.keys(builderManifest.devDependencies),
  sourceFreeNpmInstall: true, installedBytesMatchTarballs: true, singleReact: renders,
  starterBuild: true, starterDevServer: true, backendLaunched: false,
  learningKitSha256: createHash('sha256').update(await readFile(join(kitDirectory, 'learning-kit.json'))).digest('hex'),
  bookSha256: kit.bookSha256,
  artifacts: set.packages.map(({ name, sha256 }) => ({ name, sha256 })),
};
const output = resolve(process.argv[3]);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(proof, null, 2) + '\n');
console.log(`Verified clean ${process.platform} PowerShell builder and source-free starter with ${proof.node}/npm ${proof.npm}.`);
