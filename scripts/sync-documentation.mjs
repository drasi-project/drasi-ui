// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packagedReference, referenceDocuments, runtimeDocuments } from './documentation.mjs';

assert(process.argv.slice(2).every(argument => argument === '--check'), 'Usage: sync-documentation.mjs [--check]');
const check = process.argv.includes('--check');
for (const { source, target } of referenceDocuments) {
  const sourceUrl = new URL(`../${source}`, import.meta.url);
  const targetUrl = new URL(`../${target}`, import.meta.url);
  const expected = packagedReference(await readFile(sourceUrl, 'utf8'), source, target);
  if (check) {
    assert.equal(await readFile(targetUrl, 'utf8'), expected,
      `${target} is stale. Edit ${source}, then run npm run docs:sync.`);
  } else {
    await mkdir(dirname(fileURLToPath(targetUrl)), { recursive: true });
    await writeFile(targetUrl, expected);
  }
}
console.log(`${check ? 'Checked' : 'Generated'} ${referenceDocuments.length} co-located reference copies.`);
for (const { source, target } of runtimeDocuments) {
  const expected = await readFile(new URL(`../${source}`, import.meta.url));
  const destination = new URL(`../${target}`, import.meta.url);
  if (check) assert.deepEqual(await readFile(destination), expected, `${target} is stale; run npm run docs:sync.`);
  else {
    await mkdir(dirname(fileURLToPath(destination)), { recursive: true });
    await writeFile(destination, expected);
  }
}
console.log(`${check ? 'Checked' : 'Generated'} ${runtimeDocuments.length} executable lesson copies.`);
