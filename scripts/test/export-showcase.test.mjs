import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { exportShowcase } from '../export-showcase.mjs';

async function fixture(t, html) {
  const directory = await mkdtemp(join(tmpdir(), 'drasi-showcase-export-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const consumer = join(directory, 'consumer');
  const dist = join(consumer, 'dist');
  await mkdir(join(dist, 'assets'), { recursive: true });
  await writeFile(join(dist, 'showcase.html'), html);
  for (const file of ['index.html', 'query-table.html', 'hooks.html']) {
    await writeFile(join(dist, file), 'Backend-only page: not part of the export');
  }
  await writeFile(join(dist, 'assets/app.js'), 'console.log("qualified bytes");\n');
  const consumers = {
    source: 'reviewed-source', artifacts: [{ name: '@drasi/react', sha256: 'retained-artifact' }],
    consumers: { examples: { directory: consumer } },
  };
  return { consumers, dist, destination: join(directory, 'site') };
}

const document = '<!doctype html><html lang="en"><head><script type="module" src="./assets/app.js"></script></head><body></body></html>';

test('export marks only its HTML as static, retains asset bytes/provenance and excludes backend pages', async t => {
  const f = await fixture(t, document);
  await exportShowcase(f.consumers, f.destination);
  assert.deepEqual((await readdir(f.destination)).sort(), ['assets', 'index.html', 'provenance.json']);
  assert.equal(await readFile(join(f.destination, 'index.html'), 'utf8'),
    document.replace('<html', '<html data-drasi-showcase-only'));
  assert.equal(await readFile(join(f.dist, 'showcase.html'), 'utf8'), document);
  assert.deepEqual(await readFile(join(f.destination, 'assets/app.js')), await readFile(join(f.dist, 'assets/app.js')));
  assert.deepEqual(JSON.parse(await readFile(join(f.destination, 'provenance.json'), 'utf8')), {
    source: f.consumers.source, artifacts: f.consumers.artifacts, simulated: true, backend: false,
  });
  await assert.rejects(exportShowcase(f.consumers, f.destination), { code: 'EEXIST' });
});

for (const [label, html, error] of [
  ['root-relative assets', document.replace('./assets/', '/assets/'), /relocatable asset URLs/],
  ['missing root', '<head></head>', /one document root/],
  ['duplicate roots', document + '<html></html>', /one document root/],
  ['an already exported document', document.replace('<html', '<html data-drasi-showcase-only'), /already be exported/],
]) {
  test(`export rejects ${label} rather than creating a broken static site`, async t => {
    const f = await fixture(t, html);
    await assert.rejects(exportShowcase(f.consumers, f.destination), error);
    await assert.rejects(readdir(f.destination), { code: 'ENOENT' });
  });
}
