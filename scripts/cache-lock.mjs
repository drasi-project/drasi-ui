import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const cache = process.env.NPM_CACHE_OUTPUT;
assert(cache, 'NPM_CACHE_OUTPUT must name an explicit disposable cache directory');
const platform = process.env.NPM_CACHE_PLATFORM;
const architecture = process.env.NPM_CACHE_ARCH;
assert(platform && architecture, 'Select an explicit cache platform and architecture');
const supports = (values, target) => !values ||
  (!values.includes(`!${target}`) && (!values.some(value => !value.startsWith('!')) || values.includes(target)));
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const selected = new Set((process.env.NPM_CACHE_FILTER ?? '').split(',').filter(Boolean));
const found = new Set();
const specs = [...new Set(Object.entries(lock.packages)
  .filter(([path, entry]) => {
    const name = entry.name ?? path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
    const included = !entry.link && entry.resolved && supports(entry.os, platform) &&
      supports(entry.cpu, architecture) && (!selected.size || selected.has(name));
    if (included) found.add(name);
    return included;
  })
  .map(([, entry]) => {
    assert(entry.resolved.startsWith('https://registry.npmjs.org/'), `Non-official registry: ${entry.resolved}`);
    assert(entry.integrity, `Missing integrity for ${entry.resolved}`);
    return entry.resolved;
  }))];
for (const name of selected) assert(found.has(name), `Requested package is absent from the matching locked graph: ${name}`);
let next = 0;
async function worker() {
  while (next < specs.length) {
    const spec = specs[next++];
    await new Promise((accept, reject) => {
      const child = spawn('npm', ['cache', 'add', spec, '--cache', resolve(cache),
        '--registry=https://registry.npmjs.org', '--ignore-scripts'], { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      child.stderr.on('data', data => { stderr += data; });
      child.once('error', reject);
      child.once('exit', code => code === 0 ? accept() : reject(new Error(`Caching ${spec} failed (${code}): ${stderr}`)));
    });
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
const files = ['package.json', 'package-lock.json', ...Object.keys(lock.packages)
  .filter(path => path && !path.includes('node_modules')).map(path => `${path}/package.json`)];
const hashes = {};
for (const file of files) hashes[file] = createHash('sha256').update(await readFile(file)).digest('hex');
await mkdir('.artifacts/dependencies', { recursive: true });
await copyFile('package-lock.json', '.artifacts/dependencies/package-lock.json');
await writeFile('.artifacts/dependencies/provenance.json', JSON.stringify({
  source: process.env.GITHUB_SHA, run: process.env.GITHUB_RUN_ID,
  registry: 'https://registry.npmjs.org/', node: process.version,
  npm: '11.17.0', platform, architecture, partial: selected.size > 0,
  selected: [...selected], tarballs: specs.length, hashes,
}, null, 2) + '\n');
console.log(`Cached ${specs.length} official-registry tarballs for ${platform}-${architecture}.`);
