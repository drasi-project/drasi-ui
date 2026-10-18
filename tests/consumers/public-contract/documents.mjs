// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { referenceDocuments } from '../../../scripts/documentation.mjs';

export { repositorySourceRef } from '../../../scripts/documentation.mjs';

export const documentationFiles = [
  'README.md', 'CHANGELOG.md',
  'docs/getting-started.md', 'docs/reference.md', 'docs/connection.md',
  'docs/migration.md', 'docs/testing.md',
  'docs/developer-guide/README.md', 'docs/reference/README.md',
  'docs/reference/migration.md', 'docs/reference/validation.md',
  ...referenceDocuments.map(({ target }) => target.slice('packages/react/'.length)),
];

export async function loadDocumentation(packageRoot) {
  const guides = (await readdir(join(packageRoot, 'docs'), { recursive: true, withFileTypes: true }))
    .filter(file => file.isFile())
    .map(file => relative(packageRoot, join(file.parentPath, file.name)).replaceAll('\\', '/')).sort();
  assert.deepEqual(guides, documentationFiles.filter(file => file.startsWith('docs/')).sort(),
    'Every shipped guide must be included in the executable documentation contract');
  return Object.fromEntries(await Promise.all(documentationFiles.map(async file =>
    [file, await readFile(join(packageRoot, file), 'utf8')],
  )));
}
