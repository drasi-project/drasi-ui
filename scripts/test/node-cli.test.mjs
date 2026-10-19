import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { npmCli, packageCli, spawnNpmSync } from '../node-cli.mjs';

async function fixture(context, layout = 'windows') {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'drasi node cli spaces ')));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const executable = join(directory, layout === 'windows' ? 'node.exe' : 'bin/node');
  const prefix = join(directory, layout === 'windows' ? 'node_modules' : 'lib/node_modules');
  const packageRoot = join(prefix, 'npm'), cli = join(packageRoot, 'bin/npm-cli.js');
  await mkdir(dirname(executable), { recursive: true });
  await writeFile(executable, 'Not executed; fixture for package discovery.\n');
  await mkdir(dirname(cli), { recursive: true });
  await writeFile(join(packageRoot, 'package.json'), JSON.stringify({
    name: 'npm', version: '0.0.0', bin: { npm: 'bin/npm-cli.js' },
  }));
  await writeFile(cli, 'console.log(JSON.stringify(process.argv.slice(2)));\n');
  await writeFile(join(directory, 'npm.cmd'), '@echo This shim must not run\r\nexit /b 99\r\n');
  return { directory, executable, cli, packageRoot };
}

for (const layout of ['windows', 'unix']) {
  test(`locates the bundled npm JavaScript CLI in a ${layout} layout with spaces`, async context => {
    const { executable, cli } = await fixture(context, layout);
    assert.equal(npmCli({ execPath: executable, env: {} }), cli);
  });
}

test('npm-supplied entrypoint is verified; a pnpm entrypoint is not mistaken for npm', async context => {
  const { executable, cli } = await fixture(context);
  assert.equal(npmCli({ env: { npm_execpath: cli } }), cli);
  assert.equal(npmCli({ execPath: executable, env: { npm_execpath: '/unused/pnpm.mjs' } }), cli);
  await assert.rejects(async () => npmCli({ env: { npm_execpath: join(dirname(cli), 'missing/npm-cli.js') } }),
    { code: 'ENOENT' });
});

test('Node CLI invocation preserves argument boundaries, spaces and shell metacharacters', async context => {
  const { cli } = await fixture(context);
  const args = ['argument with spaces', 'literal&value', 'a; b', '$(not-a-command)', 'quote"value', 'end\\'];
  const result = spawnNpmSync(args, {
    env: { ...process.env, npm_execpath: cli }, encoding: 'utf8',
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), args);
  assert.throws(() => spawnNpmSync(args, { shell: true }), /without a command shell/);
});

test('package CLI lookup uses package metadata, never a platform .bin shim', async context => {
  const { directory, packageRoot, cli } = await fixture(context);
  assert.equal(packageCli('npm', 'npm', directory), cli);
  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json')));
  await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ ...manifest, bin: { npm: '../escape.js' } }));
  await writeFile(join(packageRoot, '../escape.js'), 'throw new Error("not executed");\n');
  assert.throws(() => packageCli('npm', 'npm', directory), /escapes its package/);
});
