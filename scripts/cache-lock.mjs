import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const cache = process.env.NPM_CACHE_OUTPUT;
assert(cache, 'NPM_CACHE_OUTPUT must name an explicit disposable cache directory');
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const specs = [...new Set(Object.values(lock.packages)
  .filter(entry => !entry.link && entry.resolved)
  .map(entry => {
    assert(entry.resolved.startsWith('https://registry.npmjs.org/'), `Non-official registry: ${entry.resolved}`);
    assert(entry.integrity, `Missing integrity for ${entry.resolved}`);
    return entry.resolved;
  }))];
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
  npm: '11.17.0', tarballs: specs.length, hashes,
}, null, 2) + '\n');
console.log(`Cached ${specs.length} official-registry tarballs, including optional platform packages.`);
