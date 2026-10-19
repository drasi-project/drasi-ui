import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { packageCli } from './node-cli.mjs';

const directory = fileURLToPath(new URL('../packages/react/', import.meta.url));
const dist = join(directory, 'dist');
await rm(dist, { recursive: true, force: true });
const result = spawnSync(process.execPath, [packageCli('tsup', 'tsup', directory)], {
  cwd: directory, stdio: 'inherit',
});
if (result.error) throw result.error;
assert.equal(result.status, 0, 'React build failed');
// tsup's Rollup tree-shaking pass removes esbuild banners. Mark final React
// chunks, shifting source-map lines so public stack traces still locate source.
for (const file of await readdir(dist, { recursive: true })) {
  if (!/\.(?:js|cjs)$/.test(file) || file.replaceAll('\\', '/').startsWith('client/')) continue;
  const path = join(dist, file);
  const body = await readFile(path, 'utf8');
  const map = JSON.parse(await readFile(`${path}.map`, 'utf8'));
  assert.equal(map.version, 3);
  assert.equal(typeof map.mappings, 'string');
  map.mappings = `;${map.mappings}`;
  await writeFile(path, `"use client";\n${body}`);
  await writeFile(`${path}.map`, JSON.stringify(map));
}
await copyFile(new URL('../packages/styles/dist/styles.css', import.meta.url), join(directory, 'styles.css'));
for (const extension of ['d.ts', 'd.cts']) {
  await copyFile(new URL(`../packages/styles/dist/styles.${extension}`, import.meta.url), join(directory, `styles.${extension}`));
}
