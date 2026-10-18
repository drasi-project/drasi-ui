// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { extractGuide, guidePath } from '../tests/consumers/public-contract/developer-guide.mjs';
import { installConsumer, run } from './consumer-install.mjs';
import { measureEmittedAssets } from './metrics-policy.mjs';

export async function prepareGuideConsumer({ packageRoot, directory, set }) {
  const book = await readFile(join(packageRoot, guidePath), 'utf8');
  const { examples, assets } = extractGuide(book);
  const manifest = JSON.parse(assets.get('package.json').code);
  for (const item of set.packages) {
    if (item.name !== '@drasi/ui-styles') {
      assert.equal(manifest.dependencies[item.name], item.version, 'Book manifest has a stale package version');
    }
    assert(book.includes(item.filename), 'Book tarball install command has a stale filename');
  }
  assert.equal(manifest.dependencies['@drasi/ui-styles'], undefined, 'React-only book should use its included CSS');
  await installConsumer({ directory, manifest, set });
  await mkdir(join(directory, 'src'));
  for (const asset of assets.values()) {
    if (asset.name === 'package.json') continue; // npm records the documented tarball installation.
    await writeFile(join(directory, asset.name.endsWith('.css') ? 'src' : '', asset.name), asset.code);
  }
  for (const example of examples) await writeFile(join(directory, 'src', example.name), example.code);
  await copyFile(join(directory, 'src/cold-storage-main.tsx'), join(directory, 'src/main.tsx'));
  const evidence = new URL('../.artifacts/consumer-proofs/developer-guide/', import.meta.url);
  await mkdir(evidence, { recursive: true });
  await writeFile(new URL('starter-build.log', evidence), run('npm', ['run', 'build'], directory));
  const starter = await measureEmittedAssets(join(directory, 'dist'));

  const fixtures = new URL('../tests/consumers/public-contract/', import.meta.url);
  await copyFile(new URL('guide-runtime.test.mjs', fixtures), join(directory, 'guide-runtime.test.mjs'));
  for (const name of ['application-client', 'reading-model', 'threshold-alerts', 'fetch-event-source']) {
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
    bookSha256: createHash('sha256').update(book).digest('hex'),
    inputs: [...examples, ...assets.values()].map(({ name, code, line }) => ({
      name, line, sha256: createHash('sha256').update(code).digest('hex'),
    })),
    starter,
    fixture: await measureEmittedAssets(join(directory, 'fixture-dist')),
    note: 'Fresh app manifest and source extracted literally from the installed guide. Runtime fixture is a test gateway, not a real Drasi backend.',
  };
  await writeFile(new URL('proof.json', evidence), JSON.stringify(proof, null, 2) + '\n');
  return proof;
}

export async function prepareNextGuideConsumer({ packageRoot, directory, set }) {
  const book = await readFile(join(packageRoot, guidePath), 'utf8');
  const { examples } = extractGuide(book);
  const framework = new URL('../tests/consumers/react-19/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('package.json', framework), 'utf8'));
  await installConsumer({
    directory, set,
    manifest: { ...manifest, name: 'drasi-installed-guide-next', scripts: { build: 'next build' } },
  });
  const route = join(directory, 'app/cold-storage');
  await mkdir(route, { recursive: true });
  const byName = new Map(examples.map(example => [example.name, example.code]));
  await writeFile(join(directory, 'app/layout.tsx'), byName.get('next-layout.tsx'));
  const config = JSON.parse(await readFile(new URL('tsconfig.json', framework), 'utf8'));
  await writeFile(join(directory, 'tsconfig.json'), JSON.stringify(config, null, 2) + '\n');
  for (const name of ['readings.ts', 'reading-model.ts', 'live-cold-storage.tsx', 'connection-notice.tsx',
    'cold-storage-dashboard.tsx', 'cold-storage-client.tsx']) {
    await writeFile(join(route, name), byName.get(name));
  }
  await writeFile(join(route, 'page.tsx'), byName.get('next-cold-storage-page.tsx'));
  const evidence = new URL('../.artifacts/consumer-proofs/developer-guide-next/', import.meta.url);
  await mkdir(evidence, { recursive: true });
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
