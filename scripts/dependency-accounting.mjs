import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, readdir, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';

export async function installedDependencyAccounting(directory, roots) {
  const owner = await realpath(directory);
  const pending = roots.map(name => ({ name, from: join(owner, 'package.json') }));
  const packages = new Map();
  while (pending.length) {
    const { name, from } = pending.pop();
    const require = createRequire(from);
    const metadata = (require.resolve.paths(name) ?? []).map(path => join(path, name, 'package.json'))
      .find(file => existsSync(file));
    assert(metadata, `Missing installed dependency ${name}`);
    const location = await realpath(dirname(metadata));
    assert(relative(owner, location).split('/')[0] !== '..', `Dependency ${name} escaped the isolated installation`);
    const manifest = JSON.parse(await readFile(join(location, 'package.json'), 'utf8'));
    assert.equal(manifest.name, name);
    if (packages.has(location)) continue;
    let bytes = 0, files = 0;
    const paths = [location];
    while (paths.length) {
      const path = paths.pop();
      for (const entry of await readdir(path, { withFileTypes: true })) {
        if (entry.name === 'node_modules') continue;
        const file = join(path, entry.name);
        if (entry.isDirectory()) paths.push(file);
        else if (entry.isFile()) { files += 1; bytes += (await readFile(file)).length; }
      }
    }
    packages.set(location, {
      name, version: manifest.version, license: manifest.license ?? null,
      path: relative(owner, location), files, bytes,
      dependencies: manifest.dependencies ?? {}, peerDependencies: manifest.peerDependencies ?? {},
    });
    for (const dependency of Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies, ...manifest.optionalDependencies })) {
      if (manifest.peerDependenciesMeta?.[dependency]?.optional || manifest.optionalDependencies?.[dependency]) {
        if (!(require.resolve.paths(dependency) ?? []).some(path => existsSync(join(path, dependency)))) continue;
      }
      pending.push({ name: dependency, from: join(location, 'package.json') });
    }
  }
  const entries = [...packages.values()].sort((a, b) => a.path.localeCompare(b.path));
  return { roots, packages: entries, totalFiles: entries.reduce((sum, item) => sum + item.files, 0), totalBytes: entries.reduce((sum, item) => sum + item.bytes, 0) };
}
