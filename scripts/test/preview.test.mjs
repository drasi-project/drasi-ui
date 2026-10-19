import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { assertProductionFile, readArchive, verifyCandidateFiles, verifyLearningFiles, verifyPreview } from '../verify-preview.mjs';

const hash = (bytes, algorithm = 'sha256', encoding = 'hex') =>
  createHash(algorithm).update(bytes).digest(encoding);
function tarball(files, type = '0') {
  const parts = [];
  for (const [name, content] of Object.entries(files)) {
    const body = Buffer.from(content), header = Buffer.alloc(512);
    header.write(`package/${name}`, 0);
    header.write('0000644\0', 100);
    header.write(body.length.toString(8).padStart(11, '0') + '\0', 124);
    header.fill(32, 148, 156);
    header.write(type, 156);
    header.write('ustar\0', 257);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148);
    parts.push(header, body, Buffer.alloc((512 - body.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...parts, Buffer.alloc(1024)]));
}
async function fixture(context, missingBuild = false) {
  const directory = await mkdtemp(join(tmpdir(), 'drasi-preview-test-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const set = { schema: 1, repository: 'drasi-project/drasi-ui', source: 'a'.repeat(40), dirty: false, packages: [] };
  for (const name of ['@drasi/ui-core', '@drasi/ui-styles', '@drasi/react']) {
    const dependencies = name === '@drasi/react' ? { '@drasi/ui-core': '0.1.0-beta.1' } : {};
    const manifest = { name, version: '0.1.0-beta.1', exports: './dist/index.js', dependencies };
    const files = {
      'package.json': JSON.stringify(manifest),
      ...(missingBuild && name === '@drasi/react' ? {} : {
        'dist/index.js': 'export const test = true;\n', 'dist/index.js.map': '{"version":3}\n',
      }),
    };
    const bytes = tarball(files), filename = name.slice(1).replace('/', '-') + '-0.1.0-beta.1.tgz';
    await writeFile(join(directory, filename), bytes);
    set.packages.push({ name, version: manifest.version, dependencies, filename, bytes: bytes.length,
      sha256: hash(bytes), integrity: `sha512-${hash(bytes, 'sha512', 'base64')}`,
      files: Object.entries(files).map(([path, text]) => ({ path, size: Buffer.byteLength(text) })),
    });
  }
  await writeFile(join(directory, 'release-set.json'), JSON.stringify(set));
  const learningFiles = Object.fromEntries([
    'README.md', 'LICENSE', 'NOTICE', 'verify-preview.mjs',
    'docs/developer-guide/README.md', 'docs/developer-guide/print.html', 'docs/reference/README.md',
    'docs/developer-guide/runtime/scripts/backend.mjs', 'docs/developer-guide/runtime/scripts/auth-gateway.mjs',
    'docs/developer-guide/runtime/scripts/lesson-config.mjs',
    'starter/src/main.tsx', 'next/package.json', 'next/package-lock.json', 'next/app/cold-storage/page.tsx',
    'checkpoints/12-authentication/src/session-auth.ts', 'checkpoints/11-notifications/src/threshold-alerts.ts',
  ].map(path => [path, 'Synthetic verifier fixture; never executable.']));
  learningFiles['starter/package.json'] = JSON.stringify({
    dependencies: { '@drasi/react': 'file:../artifacts/react.tgz', '@drasi/ui-core': 'file:../artifacts/core.tgz',
      react: '18.3.1', 'react-dom': '18.3.1' },
  });
  learningFiles['starter/package-lock.json'] = JSON.stringify({ packages: {} });
  learningFiles['artifacts/release-set.json'] = JSON.stringify(set);
  for (const item of set.packages) {
    learningFiles[`artifacts/${item.filename}`] = await readFile(join(directory, item.filename));
  }
  learningFiles['learning-kit.json'] = JSON.stringify({
    schema: 1, kind: 'react-learning-kit', source: set.source, dirty: false, version: '0.1.0-beta.1',
    releaseSetSha256: hash(JSON.stringify(set)), bookSha256: hash(learningFiles['docs/developer-guide/README.md']),
    files: Object.fromEntries(Object.entries(learningFiles).map(([path, bytes]) =>
      [path, { bytes: Buffer.byteLength(bytes), sha256: hash(bytes) }])),
  });
  const bundle = tarball(learningFiles);
  const learning = {
    filename: 'drasi-react-learning-0.1.0-beta.1-aaaaaaaaaaaa.tgz', bytes: bundle.length, sha256: hash(bundle),
    bookSha256: hash(learningFiles['docs/developer-guide/README.md']),
  };
  await writeFile(join(directory, learning.filename), bundle);
  await writeFile(join(directory, 'preview.json'), JSON.stringify({
    kind: 'github-prerelease-candidate', source: set.source,
    releaseSetSha256: hash(await readFile(join(directory, 'release-set.json'))),
    learning,
  }));
  await writeFile(join(directory, 'README.md'), 'Synthetic verifier fixture, not a published package.');
  await writeFile(join(directory, 'verify-preview.mjs'), '// Synthetic download fixture\n');
  const names = [...set.packages.map(item => item.filename), 'release-set.json', 'preview.json',
    'README.md', 'verify-preview.mjs', learning.filename];
  await writeFile(join(directory, 'SHA256SUMS'), (await Promise.all(names.map(async name =>
    `${hash(await readFile(join(directory, name)))}  ${name}`))).join('\n') + '\n');
  return { directory, set, bundle };
}

test('a complete exact set verifies without installing dependencies or executing archives', async context => {
  const { directory, set } = await fixture(context);
  assert.deepEqual(await verifyPreview(directory, set.source), set);
  await assert.rejects(verifyPreview(directory, 'b'.repeat(40)), /different source commit/);
});
test('matching hashes and tiny tarballs cannot hide missing built output', async context => {
  const { directory } = await fixture(context, true);
  await assert.rejects(verifyCandidateFiles(directory), /missing built export/);
});
test('modified bytes, altered inventory and dirty source fail explicitly', async context => {
  const { directory, set } = await fixture(context);
  set.packages[0].files[0].size += 1;
  await writeFile(join(directory, 'release-set.json'), JSON.stringify(set));
  await assert.rejects(verifyCandidateFiles(directory), /size mismatch/);
  set.dirty = true;
  await writeFile(join(directory, 'release-set.json'), JSON.stringify(set));
  await assert.rejects(verifyCandidateFiles(directory), /clean committed source/);
  set.dirty = false;
  set.packages[0].files[0].size -= 1;
  await writeFile(join(directory, 'release-set.json'), JSON.stringify(set));
  await writeFile(join(directory, set.packages[0].filename), 'broken download');
  await assert.rejects(verifyCandidateFiles(directory), /archive size mismatch/);
});
test('the checksum list cannot read unlisted or traversal paths', async context => {
  const { directory } = await fixture(context);
  await writeFile(join(directory, 'SHA256SUMS'), `${'a'.repeat(64)}  .env\n`);
  await assert.rejects(verifyPreview(directory), /Unlisted preview download/);
  await writeFile(join(directory, 'SHA256SUMS'), `${'a'.repeat(64)}  ../private\n`);
  await assert.rejects(verifyPreview(directory), /Invalid checksum file entry/);
});
test('tar parser rejects unsafe paths, links and corrupt headers', () => {
  assert.throws(() => readArchive(tarball({ '../outside': 'unsafe' })), /Unsafe package path/);
  assert.throws(() => readArchive(tarball({ link: 'target' }, '2')), /regular files/);
  const bytes = Buffer.alloc(1024, 1);
  assert.throws(() => readArchive(gzipSync(bytes)), /checksum mismatch/);
});

test('production package allowlists reject inert downloaders, lesson servers, PNGs and print editions', () => {
  for (const path of ['docs/developer-guide/runtime/scripts/backend.mjs', 'docs/download.mjs',
    'docs/developer-guide/figures/02-first-screen.png', 'docs/developer-guide/print.html']) {
    assert.throws(() => assertProductionFile('@drasi/react', path), /learning\/server\/downloader/);
  }
  assertProductionFile('@drasi/react', 'docs/reference/query-table.md');
  assertProductionFile('@drasi/react', 'dist/components/index.js');
});

test('learning verification rejects mixed package sets, missing helpers and altered book bytes', async context => {
  const { bundle, set } = await fixture(context);
  const files = readArchive(bundle);
  assert.equal(verifyLearningFiles(files, set).source, set.source);
  await assert.rejects(async () => verifyLearningFiles(files, { ...set, source: 'b'.repeat(40) }), /different source/);
  files.delete('docs/developer-guide/runtime/scripts/backend.mjs');
  assert.throws(() => verifyLearningFiles(files, set), /inventory mismatch/);
  const altered = readArchive(bundle);
  altered.set('docs/developer-guide/README.md', Buffer.from('Different book'));
  assert.throws(() => verifyLearningFiles(altered, set), /Learning file size mismatch|Learning file checksum mismatch/);
});
