// Copyright 2026 The Drasi Authors.
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile, readdir, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const entrypoints = {
  root: '.',
  client: './client',
  react: './react',
  components: './components',
};
const componentNames = new Set([
  'DataTable', 'DataTableProps', 'DataTableState', 'DataTableRenderContext',
  'DataTableErrorContext', 'DataTableHeaderContext', 'queryTableState',
  'QueryTable', 'QueryTableProps', 'QueryTableRenderContext', 'QueryTableErrorContext',
  'ColumnDef', 'RowAction', 'Modal', 'ModalProps', 'ModalLayer', 'ClientModal', 'TableHeight',
  'usePortalTheme', 'tableHeight', 'LengthUnit', 'focusAvailable',
  'CodeViewerDialog', 'CodeViewerDialogProps', 'CodeIcon', 'ExpandIcon', 'CollapseIcon',
]);
const tutorialNames = new Set([
  'CodeViewerDialog', 'CodeViewerDialogProps', 'QueryInspector', 'formatQueryConfig',
  'codeSnippet', 'reactCode', 'cypherQuery', 'drasiUiUrl',
]);

export function inside(root, file) {
  const path = relative(root, file);
  return path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

export async function filesUnder(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else if (entry.isFile()) files.push(path);
    else if (entry.name !== '.bin') {
      // npm's executable links are not module/type-resolution inputs.
      assert.equal(dirname(path).endsWith(`${sep}.bin`), true, `Unexpected installed link: ${path}`);
    }
  }
  return files;
}

export function moduleReferences(ts, source) {
  const references = [
    ...source.referencedFiles.map(reference => reference.fileName),
    ...source.typeReferenceDirectives.map(reference => reference.fileName),
  ];
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      references.push(node.moduleSpecifier.text);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      references.push(node.argument.literal.text);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      references.push(node.moduleReference.expression.text);
    } else if (ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && ['require', '__require'].includes(node.expression.text)))) {
      assert(node.arguments.length && ts.isStringLiteralLike(node.arguments[0]),
        `Unverifiable dynamic module load in ${source.fileName}`);
      references.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return references;
}

export function checkBoundary(ts, source, kind) {
  const frameworkFree = kind === 'client' || kind === 'server-client';
  const headless = frameworkFree || kind === 'react' || kind === 'server-react';
  const generic = ['root', 'client', 'react', 'components'].includes(kind);
  function visit(node) {
    if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) {
      assert(!tutorialNames.has(node.text),
        `Published ${kind} graph contains app-owned tutorial code ${node.text}: ${source.fileName}`);
    }
    if (headless && ts.isIdentifier(node)) {
      assert(!componentNames.has(node.text), `${kind} graph contains component ${node.text}: ${source.fileName}`);
    }
    if (kind === 'components' && ts.isStringLiteralLike(node)) {
      assert(!/drasi-code-dialog(?:__|--|\b)/.test(node.text) &&
        !['React Code', 'Query Definition', 'View code'].includes(node.text),
      `Components graph contains tutorial presentation: ${source.fileName}`);
    }
    if (frameworkFree && ts.isIdentifier(node)) {
      assert(!/^(React|ReactDOM|jsxRuntime|jsx_runtime|createPortal)$/.test(node.text),
        `Client graph contains React implementation/types: ${source.fileName}`);
    }
    if (generic && ts.isIdentifier(node)) {
      assert(!['DrasiClient', 'DrasiSSEClient', 'DrasiProvider', 'QueryConfig', 'ReactionConfig',
        'useDrasiServerUiUrl', 'useDrasiQueryDefinition'].includes(node.text),
      `Generic ${kind} graph reaches Server API ${node.text}: ${source.fileName}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  for (const specifier of moduleReferences(ts, source)) {
    assert(!/\.(?:css|scss|sass)(?:$|\?)/i.test(specifier), `Styles must be explicitly imported: ${source.fileName}`);
    assert(!/(?:^|[/\\])(?:src|examples|tutorials?|trading)(?:[/\\]|$)/i.test(specifier),
      `Published graph imports source/example code: ${specifier}`);
    assert(!/(?:CodeViewerDialog|QueryInspector|formatQueryConfig)/.test(specifier),
      `Published graph imports app-owned tutorial code: ${specifier}`);
    if (frameworkFree) {
      assert(!/^(?:@types\/)?react(?:-dom)?(?:\/|$)/.test(specifier),
        `Client graph reaches a React peer: ${specifier}`);
    }
    if (generic) assert(!specifier.includes('/adapters/'), `Generic entry reaches an optional adapter: ${specifier}`);
    if (headless) {
      assert(!/(?:^|[/\\])components(?:[/\\.]|$)/i.test(specifier),
        `${kind} graph reaches components: ${specifier}`);
      assert(!/^(?:@types\/)?react-dom(?:\/|$)/.test(specifier),
        `${kind} graph reaches ReactDOM: ${specifier}`);
      assert(!/^@radix-ui\//.test(specifier),
        `${kind} graph reaches a UI primitive: ${specifier}`);
      assert(!/^(?:scroll-into-view-if-needed|compute-scroll-into-view)(?:\/|$)/.test(specifier),
        `${kind} graph reaches modal scroll geometry: ${specifier}`);
    }
  }
}

async function runtimeGraph(ts, packageRoot, entry, kind) {
  const pending = [entry];
  const visited = new Set();
  const external = new Set();
  while (pending.length) {
    const file = await realpath(pending.pop());
    if (visited.has(file)) continue;
    visited.add(file);
    assert(inside(join(packageRoot, 'dist'), file), `Runtime escaped packed dist: ${file}`);
    assert(/\.(?:cjs|mjs|js)$/.test(file), `Runtime references non-JavaScript source: ${file}`);
    const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    checkBoundary(ts, source, kind);
    for (const specifier of moduleReferences(ts, source)) {
      if (specifier.startsWith('.')) {
        pending.push(resolve(dirname(file), specifier));
      } else {
        assert(!isAbsolute(specifier) && !specifier.startsWith('file:'),
          `Runtime contains a machine-local import: ${specifier}`);
        external.add(specifier);
      }
    }
  }
  return {
    files: [...visited].map(file => relative(packageRoot, file)).sort(),
    external: [...external].sort(),
  };
}

export async function checkArtifact(ts, packageRoot, manifest, packageKind = 'react') {
  const graph = {};
  const entries = packageKind === 'core'
    ? { client: '.', 'server-client': './adapters/drasi-server' }
    : { ...entrypoints, 'server-react': './adapters/drasi-server' };
  for (const [kind, subpath] of Object.entries(entries)) {
    graph[kind] = {};
    for (const [condition, extension] of [['import', '.js'], ['require', '.cjs']]) {
      const entry = manifest.exports[subpath]?.[condition];
      assert(entry && typeof entry === 'object', `Missing conditional ${condition} export for ${subpath}`);
      assert(entry.default?.startsWith('./dist/') && entry.default.endsWith(extension),
        `Expected built ${condition} entry for ${subpath}`);
      assert(entry.types?.startsWith('./dist/') &&
        entry.types.endsWith(condition === 'import' ? '.d.ts' : '.d.cts'),
      `Expected dual-format declarations for ${subpath}`);
      assert(existsSync(join(packageRoot, entry.types)), `Missing published declaration ${entry.types}`);
      graph[kind][condition] = await runtimeGraph(ts, packageRoot, join(packageRoot, entry.default), kind);
    }
  }
  for (const file of await filesUnder(packageRoot)) {
    const declaration = /\.d\.(?:ts|mts|cts)$/.test(file);
    if (!declaration && /\.[cm]?js$/.test(file)) {
      const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      checkBoundary(ts, source, 'package');
      for (const specifier of moduleReferences(ts, source)) {
        assert(!isAbsolute(specifier) && !specifier.startsWith('file:'),
          `JavaScript contains a machine-local import: ${specifier}`);
        if (specifier.startsWith('.')) {
          assert(inside(join(packageRoot, 'dist'), resolve(dirname(file), specifier)),
            `JavaScript imports outside packed dist: ${specifier}`);
          assert(/\.[cm]?js$/.test(specifier), `JavaScript imports non-built source: ${specifier}`);
        }
      }
      continue;
    }
    if (!/\.(?:ts|tsx|mts|cts)$/.test(file)) continue;
    assert(declaration, `Package contains implementation source: ${file}`);
    const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true);
    function visit(node) {
      assert.notEqual(node.kind, ts.SyntaxKind.AnyKeyword, `Published declaration contains ambient any: ${file}`);
      ts.forEachChild(node, visit);
    }
    visit(source);
    checkBoundary(ts, source, 'package');
    for (const specifier of moduleReferences(ts, source)) {
      assert(!isAbsolute(specifier) && !specifier.startsWith('file:'),
        `Declaration contains a machine-local import: ${specifier}`);
    }
  }
  return graph;
}
