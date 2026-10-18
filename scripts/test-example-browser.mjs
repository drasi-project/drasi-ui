import assert from 'node:assert/strict';
import { join } from 'node:path';
import { json, root } from './packages.mjs';
import { run } from './consumer-install.mjs';

const { directory } = (await json('.artifacts/consumers.json')).consumers.examples;
const live = process.argv.includes('--live');
assert(process.argv.length === (live ? 3 : 2), 'Usage: test-example-browser.mjs [--live]');
console.log(run('npm', live ? ['run', 'test:live', '--', '--project=chromium'] : ['run', 'test:browser'], directory, {
  env: live ? { DRASI_BACKEND_CACHE: process.env.DRASI_BACKEND_CACHE ?? join(root, '.artifacts/released-backend') } : {},
}));
