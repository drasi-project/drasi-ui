import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { leanArchiveBudget, guideAssets, inspectProductionAssets } from '../guide-assets.mjs';
import { extractGuide } from '../../tests/consumers/public-contract/developer-guide.mjs';

const history = JSON.parse(await readFile(new URL('../../tests/contracts/developer-guide-artifacts.json', import.meta.url)));
const revision = JSON.parse(await readFile(new URL('../../tests/contracts/guide-usability-assets.json', import.meta.url)));

test('lean production archives retire the illustrated allowance without altering runtime budgets or history', async () => {
  const baseline = JSON.parse(await readFile(new URL('../../tests/contracts/artifact-baseline.json', import.meta.url)));
  const distribution = JSON.parse(await readFile(new URL('../../tests/contracts/learning-distribution.json', import.meta.url)));
  const active = leanArchiveBudget(baseline, distribution);
  assert.deepEqual(active.original, baseline.original);
  assert.deepEqual(active.extractionAllowance, baseline.extractionAllowance);
  assert.equal(active.documentationPackages['@drasi/react'].allowance, 6790);
  assert.equal(active.documentationAllowance.tarball, 7194);
  assert.equal(revision.archiveAllowance['@drasi/react'], 740314, 'Keep historical evidence; do not spend this allowance');
  assert.throws(() => leanArchiveBudget(baseline, { ...distribution, referenceOnlyArchives: {
    ...distribution.referenceOnlyArchives, '@drasi/react': 900940,
  } }), /cannot increase/);
});

test('unlisted assets and missing listed assets fail before any archive content is trusted', async () => {
  const original = Object.keys(history.packages['@drasi/react'].unchanged);
  const files = [...original];
  for (const path of [...guideAssets.keys(), 'docs/unlisted.png', 'docs/developer-guide/source.ts', 'dist/new-runtime.js']) {
    await assert.rejects(inspectProductionAssets('/unused', '@drasi/react', [...files, path]),
      /non-Markdown inventory|learning\/server\/downloader/);
  }
  for (const path of original) {
    await assert.rejects(inspectProductionAssets('/unused', '@drasi/react', files.filter(file => file !== path)),
      /non-Markdown inventory/);
  }
});

test('all 81 production files remain guarded, with only the explicit React manifest allowlist exception', async context => {
  const root = await mkdtemp(join(tmpdir(), 'drasi-preserved-files-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  let checked = 0;
  for (const [name, entry] of Object.entries(history.packages)) {
    const files = Object.keys(entry.unchanged);
    for (const [file, expected] of Object.entries(entry.unchanged)) {
      const target = join(root, file);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, Buffer.alloc(expected.bytes, 13));
      await assert.rejects(inspectProductionAssets(root, name, [file, ...files.filter(path => path !== file)]),
        file === 'package.json' && name === '@drasi/react' ? SyntaxError
          : /Preserved public runtime\/declaration\/CSS\/dependency bytes changed/);
      checked += 1;
    }
  }
  assert.equal(checked, 81);
});

test('screenshot provenance matches every literal current lesson module and the explicit PNG identities', async () => {
  const captures = JSON.parse(await readFile(new URL('../../tests/contracts/guide-screenshots.json', import.meta.url)));
  const book = await readFile(new URL('../../docs/react/developer-guide/README.md', import.meta.url), 'utf8');
  const { examples } = extractGuide(book);
  assert.deepEqual(captures.moduleSha256, Object.fromEntries(examples.map(({ name, code }) =>
    [name, createHash('sha256').update(code).digest('hex')])));
  for (const [name, entry] of Object.entries(captures.figures)) {
    const bytes = await readFile(new URL(`../../docs/react/developer-guide/figures/${name}`, import.meta.url));
    assert.equal(bytes.length, entry.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
  }
});
