import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

test('lesson CLI entry detection works through installed-package symlinks without launching on import', async context => {
  const directory = await mkdtemp(join(tmpdir(), 'drasi-launcher-links-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const execute = promisify(execFile);
  for (const name of ['backend', 'auth-gateway']) {
    const source = new URL(`../../examples/react/scripts/${name}.mjs`, import.meta.url);
    const link = join(directory, `${name}.mjs`);
    await symlink(fileURLToPath(source), link);
    const result = await execute(process.execPath, [link, '--help'], { timeout: 5000 });
    assert.match(result.stdout, /Usage: node/);
    assert(!result.stdout.includes('Downloading'));
    const imported = await execute(process.execPath, ['--input-type=module', '-e',
      `await import(${JSON.stringify(source.href)}); console.log('inert');`], { timeout: 5000 });
    assert.equal(imported.stdout.trim(), 'inert');
  }
});
