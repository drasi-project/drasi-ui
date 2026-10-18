import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { recordBuildOutputs, validateBuildOutputs } from '../build-outputs.mjs';

async function fixture(context) {
  const root = await mkdtemp(join(tmpdir(), 'drasi-build-preflight-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const packages = ['core', 'styles', 'react'].map(name => ({ name: `@drasi/${name}`, directory: name }));
  for (const item of packages) {
    await mkdir(join(root, item.directory, 'dist'), { recursive: true });
    await writeFile(join(root, item.directory, 'package.json'), JSON.stringify({
      name: item.name, version: '1.0.0',
      exports: { '.': { import: { types: './dist/index.d.ts', default: './dist/index.js' } },
        './styles.css': './dist/styles.css' },
    }));
    for (const file of ['index.js', 'index.d.ts', 'index.js.map', 'chunk.js', 'styles.css', 'icon.svg']) {
      await writeFile(join(root, item.directory, 'dist', file), `built ${file}\n`);
    }
  }
  return { root, packages };
}

test('a complete unchanged set passes preflight without rebuilding', async context => {
  const { root, packages } = await fixture(context);
  await recordBuildOutputs(root, packages);
  assert.equal((await validateBuildOutputs(root, packages)).length, 3);
});

test('missing successful build inventory rejects packaging', async context => {
  const { root, packages } = await fixture(context);
  await assert.rejects(validateBuildOutputs(root, packages), /Run npm run build successfully/);
});

for (const missing of ['index.js', 'index.d.ts', 'index.js.map', 'chunk.js', 'styles.css', 'icon.svg']) {
  test(`missing ${missing} in the last package rejects the whole set`, async context => {
    const { root, packages } = await fixture(context);
    await recordBuildOutputs(root, packages);
    await rm(join(root, 'react/dist', missing));
    await assert.rejects(validateBuildOutputs(root, packages), /Candidate preflight failed/);
  });
}

test('partial, modified and stale-version outputs cannot reuse an old build inventory', async context => {
  const { root, packages } = await fixture(context);
  await recordBuildOutputs(root, packages);
  await writeFile(join(root, 'styles/dist/styles.css'), '');
  await assert.rejects(validateBuildOutputs(root, packages), /Candidate preflight failed/);
  await writeFile(join(root, 'styles/dist/styles.css'), 'different CSS');
  await assert.rejects(validateBuildOutputs(root, packages), /Candidate preflight failed/);
  await recordBuildOutputs(root, packages);
  await writeFile(join(root, 'react/package.json'), JSON.stringify({
    name: '@drasi/react', version: '2.0.0', exports: './dist/index.js',
  }));
  await assert.rejects(validateBuildOutputs(root, packages), /Candidate preflight failed/);
});
