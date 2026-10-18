import assert from 'node:assert/strict';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { json } from './packages.mjs';

export async function exportShowcase(consumers, destination) {
  const dist = join(consumers.consumers.examples.directory, 'dist');
  const html = await readFile(join(dist, 'showcase.html'), 'utf8');
  assert(!/(?:src|href)="\/assets\//.test(html), 'The static showcase must use relocatable asset URLs');
  assert.equal((html.match(/<html\b/g) ?? []).length, 1, 'The showcase must have one document root');
  assert(!html.includes('data-drasi-showcase-only'), 'The consumer document must not already be exported');
  await mkdir(destination);
  await writeFile(join(destination, 'index.html'), html.replace('<html', '<html data-drasi-showcase-only'));
  await cp(join(dist, 'assets'), join(destination, 'assets'), { recursive: true });
  await writeFile(join(destination, 'provenance.json'), JSON.stringify({
    source: consumers.source, artifacts: consumers.artifacts, simulated: true, backend: false,
  }, null, 2) + '\n');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await exportShowcase(await json('.artifacts/consumers.json'), '.artifacts/showcase');
}
