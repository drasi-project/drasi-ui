// Measure only the authorized documentation revision; never refresh product budgets.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { inspectGuideAssets } from './guide-assets.mjs';

const [directory, output] = process.argv.slice(2);
assert(directory && output && process.argv.length === 4,
  'Usage: measure-guide-revision.mjs CANDIDATES OUTPUT_JSON (new output only)');
const history = JSON.parse(await readFile(new URL('../tests/contracts/developer-guide-artifacts.json', import.meta.url), 'utf8'));
const set = JSON.parse(await readFile(join(directory, 'release-set.json'), 'utf8'));
const proof = {
  schema: 1, baselineSource: 'aaf5aa62e4e3d87d68580fe2d0f54033d429e572',
  reason: 'Review-authorized illustrated book, executable verified-backend/auth lesson helpers, and coherent example configuration. All 81 prior non-Markdown public files remain byte-identical. This is a fixed archive-only addition; original/extraction/Markdown and runtime/declaration/CSS/dependency budgets are unchanged.',
  archiveAllowance: {}, archives: {}, assets: {}, preservedPublicFiles: 0,
};
for (const item of set.packages) {
  assert.equal(basename(item.filename), item.filename);
  const archive = join(directory, item.filename), bytes = await readFile(archive);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256);
  const paths = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n');
  assert(paths.every(path => path.startsWith('package/') && !path.split('/').includes('..')));
  const temporary = await mkdtemp(join(tmpdir(), 'drasi-guide-measure-'));
  try {
    execFileSync('tar', ['-xzf', archive, '-C', temporary]);
    const inspected = await inspectGuideAssets(join(temporary, 'package'), item.name,
      paths.map(path => path.slice('package/'.length)));
    Object.assign(proof.assets, inspected.assets);
    proof.preservedPublicFiles += inspected.preserved;
  } finally { await rm(temporary, { recursive: true, force: true }); }
  const before = history.packages[item.name].after;
  proof.archiveAllowance[item.name] = Math.max(0, bytes.length - before.bytes);
  proof.archives[item.name] = { before, measured: { bytes: bytes.length, sha256: item.sha256 } };
}
assert.equal(proof.preservedPublicFiles, 81);
await writeFile(output, JSON.stringify(proof, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(proof.archiveAllowance));
