import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { runtimeDocuments } from './documentation.mjs';

export const guideFigures = [
  '02-first-screen.png', '03-sorting.png', '04-dialog.png', '05-theme.png',
  '06-live.png', '07-identity.png', '08-membership.png', '09-shared-view.png',
  '10-projection-error.png', '11-reconnecting.png', '14-notification.png',
  '15-authentication.png', '16-next.png', '17-capstone.png',
];

// Only these review-authorized, independently accounted assets may accompany the book.
export const guideAssets = new Map([
  ...runtimeDocuments.map(({ target }) => [target.slice('packages/react/'.length),
    target.endsWith('.mjs') ? 'lesson-tooling' : 'lesson-configuration']),
  ...guideFigures.map(name => [`docs/developer-guide/figures/${name}`, 'figure']),
]);

export async function inspectGuideAssets(packageRoot, name, files) {
  const history = JSON.parse(await readFile(new URL('../tests/contracts/developer-guide-artifacts.json', import.meta.url), 'utf8'));
  const preserved = history.packages[name].unchanged;
  const extra = name === '@drasi/react' ? [...guideAssets.keys()] : [];
  assert.deepEqual(files.filter(file => !file.endsWith('.md')).sort(), [...Object.keys(preserved), ...extra].sort(),
    `${name}: non-Markdown inventory differs from the 81 preserved public files plus the explicit lesson assets`);
  const assets = {};
  for (const file of files.filter(file => !file.endsWith('.md'))) {
    const bytes = await readFile(join(packageRoot, file));
    const entry = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    if (Object.hasOwn(preserved, file)) {
      assert.deepEqual(entry, preserved[file], `Preserved public runtime/declaration/CSS/dependency bytes changed: ${name}/${file}`);
    } else {
      const kind = guideAssets.get(file);
      if (kind === 'figure') {
        assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `Expected an actual PNG: ${file}`);
        const captures = JSON.parse(await readFile(new URL('../tests/contracts/guide-screenshots.json', import.meta.url), 'utf8'));
        assert.deepEqual(entry, {
          bytes: captures.figures[basename(file)].bytes, sha256: captures.figures[basename(file)].sha256,
        }, `Figure differs from its actual browser capture: ${file}`);
      }
      assets[file] = { kind, ...entry };
    }
  }
  return { preserved: Object.keys(preserved).length, assets };
}

export function applyGuideArchiveAllowance(totals, archives, revision) {
  assert.equal(revision.schema, 1);
  assert.equal(revision.baselineSource, 'aaf5aa62e4e3d87d68580fe2d0f54033d429e572');
  assert.deepEqual(Object.keys(revision.archiveAllowance).sort(), Object.keys(archives).sort());
  let total = 0;
  const adjusted = {};
  for (const [name, bytes] of Object.entries(archives)) {
    const allowance = revision.archiveAllowance[name];
    const original = { '@drasi/ui-core': 106317, '@drasi/ui-styles': 7527, '@drasi/react': 160626 };
    assert.equal(revision.archives[name].before.bytes, original[name], 'Historical guide archive baseline changed');
    assert.equal(allowance, Math.max(0, revision.archives[name].measured.bytes - original[name]),
      'Archive allowance must equal its explicitly measured delta');
    assert(Number.isSafeInteger(allowance) && allowance >= 0 && bytes > allowance,
      'Only an explicit nonnegative archive allowance is supported');
    adjusted[name] = bytes - allowance;
    total += allowance;
  }
  assert.deepEqual(Object.keys(revision.assets).sort(), [...guideAssets.keys()].sort());
  return { totals: { ...totals, tarball: totals.tarball - total }, archives: adjusted };
}
