import assert from 'node:assert/strict';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { reserveBuildOutput } from '../build-learning-kit.mjs';

async function fixture(context) {
  const directory = await mkdtemp(join(tmpdir(), 'drasi-builder-output-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('fresh source output creates a missing parent and exclusively reserves the leaf', async context => {
  const directory = await fixture(context);
  const output = join(directory, 'fresh clone with spaces', '.artifacts', 'learning-build');
  await assert.rejects(lstat(dirname(output)), { code: 'ENOENT' });
  await reserveBuildOutput(output);
  assert((await lstat(output)).isDirectory());
  assert.deepEqual(await readdir(output), []);
  await assert.rejects(reserveBuildOutput(output), { code: 'EEXIST' });
});

test('an existing output directory or file is refused without changing its contents', async context => {
  const directory = await fixture(context);
  const output = join(directory, 'existing');
  await mkdir(output);
  await writeFile(join(output, 'owned-by-someone-else'), 'preserve\n');
  await assert.rejects(reserveBuildOutput(output), { code: 'EEXIST' });
  assert.equal(await readFile(join(output, 'owned-by-someone-else'), 'utf8'), 'preserve\n');
  assert.deepEqual(await readdir(output), ['owned-by-someone-else']);
  const file = join(directory, 'existing-file');
  await writeFile(file, 'preserve file\n');
  await assert.rejects(reserveBuildOutput(file), { code: 'EEXIST' });
  assert.equal(await readFile(file, 'utf8'), 'preserve file\n');
});

test('an existing output link is not followed or accepted as owned output', async context => {
  const directory = await fixture(context);
  const target = join(directory, 'target'), link = join(directory, 'output');
  await mkdir(target);
  await symlink(target, link, 'junction');
  await assert.rejects(reserveBuildOutput(link), { code: 'EEXIST' });
  assert((await lstat(link)).isSymbolicLink());
  assert.deepEqual(await readdir(target), []);
});
