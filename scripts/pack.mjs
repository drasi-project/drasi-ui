import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { candidateDirectory, json, releasePackages, root } from './packages.mjs';

const relativeDirectory = relative(root, candidateDirectory);
assert(relativeDirectory.startsWith('.artifacts/'), 'Candidate output must be an explicit directory under .artifacts/');
await mkdir(join(root, '.artifacts'), { recursive: true });
await mkdir(candidateDirectory);
const git = ['-c', `safe.directory=${await realpath(root)}`];
const head = spawnSync('git', [...git, 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
const status = spawnSync('git', [...git, 'status', '--porcelain'], { cwd: root, encoding: 'utf8' });
if (head.error) throw head.error;
if (status.error) throw status.error;
assert.equal(head.status, 0, head.stderr);
assert.equal(status.status, 0, status.stderr);
const packages = [];
for (const item of releasePackages) {
  const manifest = await json(join(root, item.directory, 'package.json'));
  const result = spawnSync('npm', ['pack', '--ignore-scripts', '--json', '--workspace', item.directory,
    '--pack-destination', candidateDirectory], { cwd: root, encoding: 'utf8' });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  const [packed] = JSON.parse(result.stdout);
  assert.equal(packed.name, item.name);
  assert.equal(packed.version, manifest.version);
  const body = await readFile(join(candidateDirectory, packed.filename));
  packages.push({
    name: item.name, version: manifest.version, filename: packed.filename,
    sha256: createHash('sha256').update(body).digest('hex'),
    integrity: `sha512-${createHash('sha512').update(body).digest('base64')}`,
    bytes: body.length, files: packed.files, dependencies: manifest.dependencies ?? {},
  });
}
const lock = await readFile(join(root, 'package-lock.json'));
const set = {
  schema: 1, repository: 'drasi-project/drasi-ui', source: head.stdout.trim(),
  dirty: Boolean(status.stdout.trim()), node: process.version,
  lockSha256: createHash('sha256').update(lock).digest('hex'), packages,
};
await writeFile(join(candidateDirectory, 'release-set.json'), JSON.stringify(set, null, 2) + '\n');
console.log(`Packed exact candidates once: ${packages.map(item => `${item.name}@${item.version}`).join(', ')}.`);
