import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';

const base = process.env.DRASI_BASE_REF ?? 'origin/main';
const result = spawnSync('git', ['diff', '--name-only', `${base}...HEAD`], { encoding: 'utf8' });
if (result.error) throw result.error;
assert.equal(result.status, 0, result.stderr);
const files = result.stdout.trim().split('\n');
const releases = new Set();
for (const file of await readdir('.changeset')) {
  if (!file.endsWith('.md') || file === 'README.md') continue;
  const body = await readFile(`.changeset/${file}`, 'utf8');
  const header = /^---\r?\n([\s\S]*?)\r?\n---/.exec(body)?.[1];
  assert(header, `Invalid changeset: ${file}`);
  for (const match of header.matchAll(/^["']?(@drasi\/[\w-]+)["']?:\s*(major|minor|patch)\s*$/gm)) releases.add(match[1]);
}
const required = new Set();
if (files.some(file => /^packages\/core\/(?:src\/|package\.json$|README\.md$|CHANGELOG\.md$|tsup\.config\.ts$)/.test(file))) {
  required.add('@drasi/ui-core');
  required.add('@drasi/react');
}
if (files.some(file => /^packages\/styles\/(?:src\/|package\.json$|README\.md$|CHANGELOG\.md$)/.test(file))) {
  required.add('@drasi/ui-styles');
  required.add('@drasi/react');
}
if (files.some(file => /^packages\/react\/(?:src\/|docs\/|package\.json$|README\.md$|CHANGELOG\.md$|tsup\.config\.ts$)/.test(file))) required.add('@drasi/react');
if (files.some(file => /^(?:LICENSE|NOTICE|tsconfig\.base\.json|scripts\/build(?:-[\w-]+)?\.mjs)$/.test(file))) {
  for (const name of ['@drasi/ui-core', '@drasi/ui-styles', '@drasi/react']) required.add(name);
}
for (const name of required) assert(releases.has(name), `Changed public bytes require an explicit ${name} changeset, including embedded CSS dependents`);
console.log(`Changeset dependency gate passed for ${[...required].join(', ') || 'documentation-only changes'}.`);
