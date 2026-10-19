import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runtimeDocuments } from './documentation.mjs';
import { assertProductionFile } from './verify-preview.mjs';

export const guideFigures = [
  '02-first-screen.png', '03-sorting.png', '04-dialog.png', '05-theme.png',
  '06-live.png', '07-identity.png', '08-membership.png', '09-shared-view.png',
  '10-projection-error.png', '11-reconnecting.png', '14-notification.png',
  '15-authentication.png', '16-next.png', '17-capstone.png',
];

// Only these review-authorized, independently accounted assets may accompany the book.
export const guideAssets = new Map([
  ...runtimeDocuments.map(({ target }) => [target.replace('docs/react/', 'docs/'),
    target.endsWith('.mjs') ? 'lesson-tooling' : 'lesson-configuration']),
  ...guideFigures.map(name => [`docs/developer-guide/figures/${name}`, 'figure']),
]);

export async function inspectProductionAssets(packageRoot, name, files) {
  const history = JSON.parse(await readFile(new URL('../tests/contracts/developer-guide-artifacts.json', import.meta.url), 'utf8'));
  const preserved = history.packages[name].unchanged;
  for (const path of files) assertProductionFile(name, path);
  assert.deepEqual(files.filter(file => !file.endsWith('.md')).sort(), Object.keys(preserved).sort(),
    `${name}: non-Markdown inventory differs from the production-only published-file allowlist`);
  for (const file of files.filter(file => !file.endsWith('.md'))) {
    const bytes = await readFile(join(packageRoot, file));
    const entry = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    if (file === 'package.json' && name === '@drasi/react') {
      const { files: published, ...manifest } = JSON.parse(bytes);
      assert.deepEqual(published, ['dist', 'styles.css', 'styles.d.ts', 'styles.d.cts', 'README.md',
        'docs/*.md', 'docs/reference/*.md', 'docs/developer-guide/README.md', 'CHANGELOG.md', 'LICENSE', 'NOTICE']);
      assert.equal(createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),
        '881750cbdd6a96185f1939f05fcfba51cd7c73949fd3a1c8e6a65f4e3a4329d5',
        'Only the React published-file allowlist may change; public manifest contracts remain fixed');
    } else {
      assert.deepEqual(entry, preserved[file], `Preserved public runtime/declaration/CSS/dependency bytes changed: ${name}/${file}`);
    }
  }
  return { nonMarkdownFiles: Object.keys(preserved).length,
    exception: name === '@drasi/react' ? 'package.json files allowlist only' : null };
}

export function leanArchiveBudget(historical, distribution) {
  assert.equal(distribution.schema, 1);
  assert.equal(distribution.historicalEvidence, 'tests/contracts/guide-usability-assets.json');
  const documentationPackages = {};
  for (const [name, entry] of Object.entries(historical.documentationPackages)) {
    const measured = distribution.referenceOnlyArchives[name];
    assert(Number.isSafeInteger(measured) && measured > 0);
    const allowance = Math.max(0, measured - entry.before);
    assert(allowance <= entry.allowance, 'Relocation cannot increase the historical Markdown allowance');
    documentationPackages[name] = { before: entry.before, allowance };
  }
  return { ...historical, documentationPackages,
    documentationAllowance: { tarball: Object.values(documentationPackages).reduce((sum, item) => sum + item.allowance, 0) },
    documentationReason: distribution.reason };
}
