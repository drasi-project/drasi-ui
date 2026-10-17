// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { extractInstallRecipes } from './install-recipes.mjs';
import { loadDocumentation } from './documents.mjs';

const markdown = Object.values(await loadDocumentation(fileURLToPath(
  new URL('../../../packages/react/', import.meta.url),
))).join('\n');

test('retains ordinary React and framework-neutral public installation recipes', () => {
  const recipes = extractInstallRecipes(markdown);
  assert.deepEqual(recipes.get('react').args, ['install', '@drasi/react']);
  assert.deepEqual(recipes.get('core').args, ['install', '@drasi/ui-core', '@drasi/ui-styles']);
  assert.equal(extractInstallRecipes(markdown.replaceAll('\n', '\r\n')).size, 2);
});

test('rejects missing, duplicate, source-linked and peer-bypassing recipes', () => {
  for (const invalid of [
    markdown.replace('# @drasi-install: core', '# removed marker'),
    markdown + '\n```sh\n# @drasi-install: react\nnpm install @drasi/react\n```\n',
    markdown.replace('npm install @drasi/react', 'npm install --force @drasi/react'),
    markdown.replace('npm install @drasi/react', 'npm install --legacy-peer-deps @drasi/react'),
    markdown.replace('npm install @drasi/react', 'npm link @drasi/react'),
    markdown.replace('npm install @drasi/react', 'npm install file:../packages/react'),
  ]) assert.throws(() => extractInstallRecipes(invalid));
});

test('does not evaluate added shell operations or substitutions', () => {
  assert.throws(() => extractInstallRecipes(markdown.replace('npm install @drasi/react',
    'npm install @drasi/react && echo unsafe')));
  assert.throws(() => extractInstallRecipes(markdown.replace('npm install @drasi/react',
    'npm install "$(touch unsafe)"')));
});
