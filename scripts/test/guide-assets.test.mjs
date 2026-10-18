import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { applyGuideArchiveAllowance, guideAssets, inspectGuideAssets } from '../guide-assets.mjs';
import { extractGuide } from '../../tests/consumers/public-contract/developer-guide.mjs';

const history = JSON.parse(await readFile(new URL('../../tests/contracts/developer-guide-artifacts.json', import.meta.url)));
const revision = JSON.parse(await readFile(new URL('../../tests/contracts/guide-usability-assets.json', import.meta.url)));

test('the illustrated book allowance changes archives only, not runtime or consumer budgets', () => {
  const totals = { tarball: 1_014_784, esm: 74660, cjs: 84792, declarations: 93775, css: 17316, maps: 435009 };
  const archives = { '@drasi/ui-core': 106317, '@drasi/ui-styles': 7527, '@drasi/react': 900940 };
  const adjusted = applyGuideArchiveAllowance(totals, archives, revision);
  assert.deepEqual(adjusted.totals, { ...totals, tarball: 274470 });
  assert.deepEqual(adjusted.archives, { ...archives, '@drasi/react': 160626 });
  for (const allowance of [-1, NaN, Infinity, 0.5]) {
    assert.throws(() => applyGuideArchiveAllowance(totals, archives, {
      ...revision, archiveAllowance: { ...revision.archiveAllowance, '@drasi/react': allowance },
    }));
  }
  assert.throws(() => applyGuideArchiveAllowance(totals, archives, {
    ...revision, archiveAllowance: { ...revision.archiveAllowance, esm: 1 },
  }));
  assert.throws(() => applyGuideArchiveAllowance(totals, archives, {
    ...revision, assets: { ...revision.assets, 'docs/unlisted.js': { bytes: 1 } },
  }));
});

test('unlisted assets and missing listed assets fail before any archive content is trusted', async () => {
  const original = Object.keys(history.packages['@drasi/react'].unchanged);
  const files = [...original, ...guideAssets.keys()];
  for (const path of ['docs/unlisted.png', 'docs/developer-guide/source.ts', 'dist/new-runtime.js']) {
    await assert.rejects(inspectGuideAssets('/unused', '@drasi/react', [...files, path]), /non-Markdown inventory/);
  }
  for (const path of guideAssets.keys()) {
    await assert.rejects(inspectGuideAssets('/unused', '@drasi/react', files.filter(file => file !== path)),
      /non-Markdown inventory/);
  }
});

test('a same-sized byte change to any of the 81 preserved non-Markdown files is rejected', async context => {
  const root = await mkdtemp(join(tmpdir(), 'drasi-preserved-files-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  let checked = 0;
  for (const [name, entry] of Object.entries(history.packages)) {
    const files = [...Object.keys(entry.unchanged), ...(name === '@drasi/react' ? guideAssets.keys() : [])];
    for (const [file, expected] of Object.entries(entry.unchanged)) {
      const target = join(root, file);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, Buffer.alloc(expected.bytes, 13));
      await assert.rejects(inspectGuideAssets(root, name, [file, ...files.filter(path => path !== file)]),
        /Preserved public runtime\/declaration\/CSS\/dependency bytes changed/);
      checked += 1;
    }
  }
  assert.equal(checked, 81);
});

test('screenshot provenance matches every literal current lesson module and the explicit PNG identities', async () => {
  const captures = JSON.parse(await readFile(new URL('../../tests/contracts/guide-screenshots.json', import.meta.url)));
  const book = await readFile(new URL('../../packages/react/docs/developer-guide/README.md', import.meta.url), 'utf8');
  const { examples } = extractGuide(book);
  assert.deepEqual(captures.moduleSha256, Object.fromEntries(examples.map(({ name, code }) =>
    [name, createHash('sha256').update(code).digest('hex')])));
  for (const [name, entry] of Object.entries(captures.figures)) {
    const bytes = await readFile(new URL(`../../packages/react/docs/developer-guide/figures/${name}`, import.meta.url));
    assert.equal(bytes.length, entry.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
  }
});
