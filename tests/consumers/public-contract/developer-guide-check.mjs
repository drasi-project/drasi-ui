// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { packagedReference, referenceDocuments } from '../../../scripts/documentation.mjs';
import { extractGuide, guideAssetLanguages, guidePath } from './developer-guide.mjs';
import { loadDocumentation } from './documents.mjs';
import { markdownAnchors, relativeMarkdownLinks } from './documentation-links.mjs';
import { markdownFences, requiredGuideExamples } from './readme-examples.mjs';

const root = new URL('../../../', import.meta.url);
const documents = await loadDocumentation(fileURLToPath(new URL('packages/react/', root)));
const book = documents[guidePath];

test('the complete book owns every progressive module and runnable project file', () => {
  const { examples, assets } = extractGuide(book);
  assert.deepEqual(examples.map(example => example.name), requiredGuideExamples);
  assert.deepEqual([...assets.keys()], Object.keys(guideAssetLanguages));
  for (const example of [...examples, ...assets.values()]) assert(book.includes(example.code.trim()));
  for (const fence of markdownFences(book)) {
    if (['ts', 'typescript', 'tsx'].includes(fence.language)) {
      assert(fence.lines[0]?.startsWith('// @drasi-docs:'), `Unchecked runnable book code at line ${fence.line}`);
    }
  }
  const manifest = JSON.parse(assets.get('package.json').code);
  assert.equal(manifest.private, true);
  assert.equal(manifest.scripts.build, 'tsc --noEmit && vite build');
  assert.equal(manifest.scripts.dev, 'vite --host 127.0.0.1');
  const config = JSON.parse(assets.get('tsconfig.json').code);
  assert.equal(config.compilerOptions.strict, true);
  assert.equal(config.compilerOptions.skipLibCheck, false);
  assert.equal(config.compilerOptions.allowImportingTsExtensions, undefined);
  assert.deepEqual(config.compilerOptions.types, ['vite/client']);
  assert.equal(config.compilerOptions.noUncheckedSideEffectImports, true);
  assert.match(assets.get('index.html').code, /src="\/src\/main\.tsx"/);
});

test('book examples and asset markers cannot be dropped, duplicated, hidden, or traversed', () => {
  for (const name of requiredGuideExamples) {
    assert.throws(() => extractGuide(book.replace(`// @drasi-docs: ${name}`, '// removed')), /Missing marked README/);
  }
  for (const name of Object.keys(guideAssetLanguages)) {
    const marker = `<!-- @drasi-guide-file: ${name} -->`;
    assert.throws(() => extractGuide(book.replace(marker, '<!-- removed -->')), /Missing guide asset/);
    assert.throws(() => extractGuide(book.replace(marker, '<!-- @drasi-guide-file: ../outside -->')), /Invalid guide asset/);
  }
  assert.throws(() => extractGuide(book + '\n<!-- @drasi-guide-file: package.json -->\n```json\n{}\n```\n'), /Duplicate guide asset/);
  assert.throws(() => extractGuide(book.replace('```html\n<!doctype', '```text\n<!doctype')), /Wrong guide asset language/);
  assert.throws(() => extractGuide(book + '\n<!-- @drasi-guide-file: package.json -->\n```json\n'), /Unclosed guide asset/);
});

test('all numbered chapters and appendices are reachable from the in-book contents', () => {
  const contents = book.slice(book.indexOf('## Contents'), book.indexOf('## Part I'));
  const links = relativeMarkdownLinks(contents);
  const chapters = book.match(/^### \d+\. .+$/gm);
  assert.equal(chapters.length, 17);
  for (const heading of [...chapters, ...book.match(/^## Appendix .+$/gm)]) {
    const anchor = [...markdownAnchors(heading)][0];
    assert(links.includes(`#${anchor}`), `Chapter absent from contents: ${heading}`);
  }
  assert(book.indexOf('```mermaid') < book.indexOf('```tsx'), 'Explain data flow before code/import details');
  assert(book.indexOf('### 1. Run your first screen') < book.indexOf('### 6. Connect your first live table'));
  assert(book.indexOf('### 4. Theme an accessible screen') < book.indexOf('## Part II'));
  assert(book.indexOf('### 5. Run the Cold storage backend') < book.indexOf('### 6. Connect your first live table'));
  assert(!book.includes('blob/main'), 'The learner book must use stable external source references');
});

test('all packaged reference text and link mappings have one co-located authoring source', async () => {
  for (const { source, target } of referenceDocuments) {
    const expected = packagedReference(await readFile(new URL(source, root), 'utf8'), source, target);
    assert.equal(await readFile(new URL(target, root), 'utf8'), expected, `Stale reference copy: ${target}`);
  }
});

test('copy mapping preserves runnable fences and rewrites only prose links', () => {
  const { source, target } = referenceDocuments.find(item => item.source.endsWith('/DataTable.md'));
  const text = '# Table\n[Modal](Modal.md#modal)\n```tsx\nconst example = "[Keep](Modal.md)";\n```\n';
  const copy = packagedReference(text, source, target);
  assert.match(copy, /\[Modal\]\(modal\.md#modal\)/);
  assert(copy.includes('const example = "[Keep](Modal.md)";'));
  assert.throws(() => packagedReference(text, source, 'unregistered.md'), /Unregistered reference/);
});
