import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { json, releasePackages, root } from './packages.mjs';

const workspace = await json(join(root, 'package.json'));
assert.equal(workspace.private, true, 'The workspace root must remain private');
const names = new Set(releasePackages.map(item => item.name));
for (const directory of workspace.workspaces) {
  const manifest = await json(join(root, directory, 'package.json'));
  if (!names.has(manifest.name)) assert.equal(manifest.private, true, `${directory} is not publishable`);
  else {
    const owner = releasePackages.find(item => item.name === manifest.name);
    assert.equal(directory, owner.directory, 'Public package location changed without an allowlist update');
    assert.equal(manifest.repository.url, 'git+https://github.com/drasi-project/drasi-ui.git');
    assert.equal(manifest.repository.directory, directory);
    assert.equal(manifest.publishConfig.registry, 'https://registry.npmjs.org/');
    assert.equal(manifest.publishConfig.access, 'public');
    for (const group of ['dependencies', 'peerDependencies']) {
      for (const [name, version] of Object.entries(manifest[group] ?? {})) {
        assert(!/^(?:file:|link:|workspace:|git|https?:)/.test(version), `Non-registry dependency ${name}`);
        assert(!/monaco|reactflow|xyflow|management-client/.test(name), `Application dependency leaked: ${name}`);
      }
    }
  }
}
const lock = await json(join(root, 'package-lock.json'));
for (const entry of Object.values(lock.packages)) {
  if (entry.link || !entry.resolved) continue;
  assert(entry.resolved.startsWith('https://registry.npmjs.org/'), 'Only official-registry lock entries are allowed');
  assert(entry.integrity, 'Registry dependency has no integrity');
}
for (const directory of workspace.workspaces) {
  assert(!existsSync(join(root, directory, 'package-lock.json')), 'Use the single root lockfile');
}

function references(source) {
  const imports = [];
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      imports.push(node.moduleSpecifier.text);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      imports.push(node.argument.literal.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      assert(ts.isStringLiteralLike(node.arguments[0]), 'Unverifiable dynamic import in product code');
      imports.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return imports;
}
function localModule(from, specifier) {
  const base = resolve(dirname(from), specifier);
  const target = [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]
    .find(file => /\.(?:ts|tsx)$/.test(file) && existsSync(file));
  assert(target, `Missing local module ${specifier} from ${from}`);
  return target;
}
const forbidden = /^(?:react(?:-dom)?(?:\/|$)|vue(?:\/|$)|@(?:types\/react|vue\/|radix-ui\/))/;
async function graph(entry, kind) {
  const pending = [resolve(root, entry)], visited = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    assert(!file.includes('/adapters/'), `Generic ${kind} graph reaches the optional Server adapter: ${file}`);
    const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true);
    if (kind === 'core') {
      function check(node) {
        if (ts.isIdentifier(node)) {
          assert(!['window', 'document', 'HTMLElement', 'ReactNode', 'RefObject', 'createPortal'].includes(node.text),
            `Core owns renderer/DOM state: ${node.text} in ${file}`);
        }
        ts.forEachChild(node, check);
      }
      check(source);
    }
    for (const specifier of references(source)) {
      assert(!specifier.includes('adapters/'), `Generic ${kind} imports an optional adapter`);
      assert(!specifier.endsWith('.css'), 'Styles must be an explicit consumer import');
      if (kind === 'core') assert(!forbidden.test(specifier), `Core reaches a renderer: ${specifier}`);
      if (specifier.startsWith('.')) pending.push(localModule(file, specifier));
      else if (specifier.startsWith('@drasi/')) {
        assert.equal(specifier, '@drasi/ui-core', 'Renderer must use the public core entrypoint');
      }
    }
  }
  return [...visited].map(file => relative(root, file));
}
const graphs = {};
for (const [name, entry] of [
  ['core', 'packages/core/src/index.ts'],
  ['react', 'packages/react/src/react/index.ts'],
  ['components', 'packages/react/src/components/index.ts'],
  ['root', 'packages/react/src/index.ts'],
]) graphs[name] = await graph(entry, name);
for (const directory of ['packages/core/src', 'packages/react/src']) {
  for (const file of await readdir(join(root, directory), { recursive: true })) {
    if (!/\.(?:ts|tsx)$/.test(file)) continue;
    const body = await readFile(join(root, directory, file), 'utf8');
    assert(!/(?:from|import\()\s*['"][^'"]*(?:packages\/|\/src\/)/.test(body),
      `Product imports a private workspace source path: ${file}`);
  }
}
console.log(`Workspace boundaries passed: ${Object.entries(graphs).map(([name, files]) => `${name}=${files.length}`).join(', ')}.`);
