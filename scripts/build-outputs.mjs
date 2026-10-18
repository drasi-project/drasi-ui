import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const buildInventory = '.artifacts/build-outputs.json';

function targets(value) {
  if (typeof value === 'string') return [value];
  return Object.values(value ?? {}).flatMap(targets);
}

async function builtFiles(root, item) {
  const directory = join(root, item.directory);
  const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  const required = [...new Set([
    ...targets(manifest.exports), ...targets(manifest.main),
    ...targets(manifest.module), ...targets(manifest.types),
  ])];
  assert(required.length > 0, `${item.name}: no declared build targets`);
  const files = new Set(required.map(path => {
    assert(path.startsWith('./') && !path.split('/').includes('..'),
      `${item.name}: unsafe build target ${path}`);
    return path.slice(2);
  }));
  for (const path of await readdir(join(directory, 'dist'), { recursive: true })) {
    if ((await lstat(join(directory, 'dist', path))).isDirectory()) continue;
    files.add(`dist/${path}`);
  }
  const inventory = {};
  for (const path of [...files].sort()) {
    const file = join(directory, path);
    assert((await lstat(file)).isFile(), `${item.name}: build output must be a regular file: ${path}`);
    const bytes = await readFile(file);
    assert(bytes.length > 0, `${item.name}: empty build output: ${path}`);
    inventory[path] = { bytes: bytes.length, sha256: hash(bytes) };
  }
  return { name: manifest.name, version: manifest.version, files: inventory };
}

export async function recordBuildOutputs(root, packages) {
  const outputs = [];
  for (const item of packages) outputs.push(await builtFiles(root, item));
  const file = join(root, buildInventory);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ schema: 1, packages: outputs }, null, 2) + '\n');
}

/** Check every package before npm can create even the first candidate archive. */
export async function validateBuildOutputs(root, packages) {
  let recorded;
  try {
    recorded = JSON.parse(await readFile(join(root, buildInventory), 'utf8'));
    assert.equal(recorded.schema, 1);
    assert.deepEqual(recorded.packages.map(item => item.name), packages.map(item => item.name));
    for (const [index, item] of packages.entries()) {
      const actual = await builtFiles(root, item);
      assert.deepEqual(actual, recorded.packages[index], `${item.name}: missing, changed or incomplete build output`);
    }
  } catch (cause) {
    throw new Error('Candidate preflight failed. Run npm run build successfully before packing the complete package set.', { cause });
  }
  return recorded.packages.map((item, index) => ({
    ...item,
    directory: relative(root, join(root, packages[index].directory)),
  }));
}
