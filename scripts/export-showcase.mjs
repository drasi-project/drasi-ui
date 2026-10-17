import assert from 'node:assert/strict';
import { copyFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { json } from './packages.mjs';

const consumers = await json('.artifacts/consumers.json');
const dist = join(consumers.consumers.examples.directory, 'dist');
const html = await readFile(join(dist, 'showcase.html'), 'utf8');
assert(!/(?:src|href)="\/assets\//.test(html), 'The static showcase must use relocatable asset URLs');
await mkdir('.artifacts/showcase');
await copyFile(join(dist, 'showcase.html'), '.artifacts/showcase/index.html');
await cp(join(dist, 'assets'), '.artifacts/showcase/assets', { recursive: true });
await writeFile('.artifacts/showcase/provenance.json', JSON.stringify({
  source: consumers.source, artifacts: consumers.artifacts, simulated: true, backend: false,
}, null, 2) + '\n');
