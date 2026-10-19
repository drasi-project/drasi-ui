// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { extractGuide, guidePath } from '../tests/consumers/public-contract/developer-guide.mjs';
import { run, verifyInstalled } from './consumer-install.mjs';
import { measureEmittedAssets } from './metrics-policy.mjs';
import { npmRun } from './learning-kit.mjs';
import { verifyLearningDirectory } from './verify-preview.mjs';

export async function prepareGuideConsumer({ kitRoot, directory, set }) {
  await cp(kitRoot, directory, { recursive: true, errorOnExist: true, force: false });
  const kitDirectory = directory;
  const kit = await verifyLearningDirectory(kitDirectory, set.source, { allowDirty: set.dirty });
  directory = join(kitDirectory, 'starter');
  const book = await readFile(join(kitDirectory, guidePath), 'utf8');
  const { examples, assets } = extractGuide(book);
  const manifest = JSON.parse(assets.get('package.json').code);
  for (const item of set.packages) {
    if (item.name !== '@drasi/ui-styles') {
      assert.equal(manifest.dependencies[item.name], item.version, 'Book manifest has a stale package version');
    }
    assert(book.includes(item.filename), 'Book tarball install command has a stale filename');
  }
  assert.equal(manifest.dependencies['@drasi/ui-styles'], undefined, 'React-only book should use its included CSS');
  const evidence = new URL('../.artifacts/consumer-proofs/developer-guide/', import.meta.url);
  await mkdir(evidence, { recursive: true });
  await writeFile(new URL('install.log', evidence), npmRun(['ci', '--no-audit', '--no-fund'], directory));
  await verifyInstalled(directory, set);
  await writeFile(new URL('starter-build.log', evidence), run('npm', ['run', 'build'], directory));
  const starter = await measureEmittedAssets(join(directory, 'dist'));

  // Add later lessons only after the untouched, minimal starter has built.
  for (const asset of assets.values()) {
    if (!['cold-storage.css', 'vite-live.config.mjs', 'vite-auth.config.mjs'].includes(asset.name)) continue;
    await writeFile(join(directory, asset.name.endsWith('.css') ? 'src' : '', asset.name), asset.code);
  }
  for (const example of examples) {
    if (['cold-storage-client.tsx', 'next-cold-storage-page.tsx', 'next-layout.tsx'].includes(example.name)) continue;
    await writeFile(join(directory, 'src', example.name), example.code);
  }
  const fixtures = new URL('../tests/consumers/public-contract/', import.meta.url);
  await copyFile(new URL('guide-runtime.test.mjs', fixtures), join(directory, 'guide-runtime.test.mjs'));
  for (const name of ['application-client', 'reading-model', 'threshold-alerts', 'fetch-event-source', 'session-auth']) {
    run(join(directory, 'node_modules/.bin/esbuild'), [`src/${name}.ts`, '--bundle', '--platform=node',
      '--format=esm', '--packages=external', `--outfile=compiled/${name}.mjs`], directory);
  }
  await copyFile(new URL('guide-recipes.test.mjs', fixtures), join(directory, 'guide-recipes.test.mjs'));
  await writeFile(new URL('runtime-tests.log', evidence),
    run(process.execPath, ['--test', 'identity.test.mjs', 'guide-runtime.test.mjs', 'guide-recipes.test.mjs'], directory));

  await copyFile(new URL('guide-fixture.txt', fixtures), join(directory, 'src/guide-fixture.tsx'));
  await writeFile(join(directory, 'fixture.html'), assets.get('index.html').code
    .replace('/src/main.tsx', '/src/guide-fixture.tsx'));
  await writeFile(join(directory, 'fixture-vite.config.mjs'),
    "export default { base: '/fixture/', build: { outDir: 'fixture-dist', rollupOptions: { input: 'fixture.html' } } };\n");
  await writeFile(new URL('fixture-types.log', evidence), run(join(directory, 'node_modules/.bin/tsc'), ['--noEmit'], directory));
  await writeFile(new URL('fixture-build.log', evidence),
    run(join(directory, 'node_modules/.bin/vite'), ['build', '--config', 'fixture-vite.config.mjs'], directory));
  const proof = {
    directory,
    kitDirectory,
    learningKitSha256: createHash('sha256').update(await readFile(join(kitDirectory, 'learning-kit.json'))).digest('hex'),
    starterPackages: kit.starterPackages,
    bookSha256: createHash('sha256').update(book).digest('hex'),
    inputs: [...examples, ...assets.values()].map(({ name, code, line }) => ({
      name, line, sha256: createHash('sha256').update(code).digest('hex'),
    })),
    starter,
    fixture: await measureEmittedAssets(join(directory, 'fixture-dist')),
    note: 'Fresh minimal starter installed from the self-contained kit; later modules extracted literally from that same book. No Next modules/dependencies in the Vite compilation graph. Runtime fixture is a test gateway, not a real Drasi backend.',
  };
  await writeFile(new URL('proof.json', evidence), JSON.stringify(proof, null, 2) + '\n');
  return proof;
}

export async function prepareNextGuideConsumer({ kitRoot, directory, set }) {
  await cp(kitRoot, directory, { recursive: true, errorOnExist: true, force: false });
  await verifyLearningDirectory(directory, set.source, { allowDirty: set.dirty });
  const book = await readFile(join(directory, guidePath), 'utf8');
  directory = join(directory, 'next');
  const evidence = new URL('../.artifacts/consumer-proofs/developer-guide-next/', import.meta.url);
  await mkdir(evidence, { recursive: true });
  await writeFile(new URL('install.log', evidence), npmRun(['ci', '--ignore-scripts', '--no-audit', '--no-fund'], directory));
  await verifyInstalled(directory, set);
  await writeFile(new URL('build.log', evidence), run('npm', ['run', 'build'], directory));
  const html = await readFile(join(directory, '.next/server/app/cold-storage.html'), 'utf8');
  assert(html.includes('Cold storage') && html.includes('North room') && html.includes('initial-loading'),
    'The literal Next chapter did not prerender its client-boundary loading view');
  const proof = {
    directory,
    bookSha256: createHash('sha256').update(book).digest('hex'),
    pageSha256: createHash('sha256').update(html).digest('hex'),
    assets: await measureEmittedAssets(join(directory, '.next/static')),
    note: 'Separate Next fixture built from literal book modules and the existing qualified Next dependency graph; no change to existing consumer metrics. Prerender is not a live backend result.',
  };
  await writeFile(new URL('proof.json', evidence), JSON.stringify(proof, null, 2) + '\n');
  return proof;
}
