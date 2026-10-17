import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const cache = process.env.NPM_CACHE_OUTPUT;
assert(cache, 'Select an explicit disposable npm metadata cache');
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const specs = new Map();
for (const [path, entry] of Object.entries(lock.packages)) {
  if (entry.link || !entry.resolved) continue;
  assert(entry.resolved.startsWith('https://registry.npmjs.org/'));
  const name = entry.name ?? path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
  specs.set(name, `${name}@${entry.version}`);
}
const pending = [...specs.values()];
let index = 0;
async function worker() {
  while (index < pending.length) {
    const spec = pending[index++];
    await new Promise((accept, reject) => {
      const child = spawn('npm', ['view', spec, 'version', '--cache', cache, '--registry=https://registry.npmjs.org'],
        { stdio: ['ignore', 'ignore', 'pipe'] });
      let error = '';
      child.stderr.on('data', chunk => { error += chunk; });
      child.once('error', reject);
      child.once('exit', code => code === 0 ? accept() : reject(new Error(`Metadata ${spec}: ${error}`)));
    });
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
console.log(`Cached official full metadata for ${pending.length} locked package names, without installing packages.`);
