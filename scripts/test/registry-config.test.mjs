import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

test('official lock URLs respect a trusted user registry, while npm still enforces integrity', async context => {
  const directory = await mkdtemp(join(tmpdir(), 'drasi-registry-contract-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const fixture = join(directory, 'fixture'), consumer = join(directory, 'consumer');
  await mkdir(fixture);
  await mkdir(consumer);
  await writeFile(join(fixture, 'package.json'), JSON.stringify({
    name: 'drasi-registry-contract-probe', version: '1.0.0', files: ['index.js'],
  }));
  await writeFile(join(fixture, 'index.js'), 'module.exports = 42;\n');
  const execute = promisify(execFile);
  const packed = JSON.parse((await execute('npm', ['pack', '--ignore-scripts', '--json'], { cwd: fixture })).stdout)[0];
  const archive = await readFile(join(fixture, packed.filename));
  const integrity = `sha512-${createHash('sha512').update(archive).digest('base64')}`;
  const requests = [];
  let corrupt = false;
  const server = createServer((request, response) => {
    requests.push(request.url);
    if (request.url !== '/drasi-registry-contract-probe/-/drasi-registry-contract-probe-1.0.0.tgz') {
      response.writeHead(404).end('Unexpected contract route');
      return;
    }
    response.writeHead(200, { 'Content-Type': 'application/octet-stream' }).end(corrupt ? Buffer.from('wrong bytes') : archive);
  });
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
  context.after(async () => {
    server.closeAllConnections();
    await new Promise((accept, reject) => server.close(error => error ? reject(error) : accept()));
  });
  const registry = `http://127.0.0.1:${server.address().port}/`;
  const userconfig = join(directory, 'trusted-user.npmrc');
  await writeFile(userconfig, `registry=${registry}\ncafile=${join(directory, 'corporate-ca.pem')}\n`);
  await writeFile(join(consumer, 'package.json'), JSON.stringify({
    name: 'registry-consumer', version: '1.0.0', private: true,
    dependencies: { 'drasi-registry-contract-probe': '1.0.0' },
  }));
  await writeFile(join(consumer, 'package-lock.json'), JSON.stringify({
    name: 'registry-consumer', version: '1.0.0', lockfileVersion: 3,
    packages: {
      '': { name: 'registry-consumer', version: '1.0.0', dependencies: { 'drasi-registry-contract-probe': '1.0.0' } },
      'node_modules/drasi-registry-contract-probe': {
        version: '1.0.0', resolved: 'https://registry.npmjs.org/drasi-registry-contract-probe/-/drasi-registry-contract-probe-1.0.0.tgz',
        integrity,
      },
    },
  }));
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^npm_config_(registry|cafile|userconfig|cache|offline)$/i.test(key)) delete env[key];
  const command = (args, cache = 'cache') => execute('npm', [
    ...args, '--userconfig', userconfig, '--cache', join(directory, cache), '--fetch-retries=0',
  ], { cwd: consumer, env, timeout: 30_000 });
  for (const config of ['../../.npmrc', '../../examples/react/.npmrc']) {
    await copyFile(new URL(config, import.meta.url), join(consumer, '.npmrc'));
    assert.equal((await command(['config', 'get', 'registry'])).stdout.trim(), registry);
    assert.equal((await command(['config', 'get', 'cafile'])).stdout.trim(), join(directory, 'corporate-ca.pem'));
  }
  await command(['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
  assert.equal(await readFile(join(consumer, 'node_modules/drasi-registry-contract-probe/index.js'), 'utf8'), 'module.exports = 42;\n');
  assert(requests.length > 0);
  assert(requests.includes('/drasi-registry-contract-probe/-/drasi-registry-contract-probe-1.0.0.tgz'));
  corrupt = true;
  await assert.rejects(command(['ci', '--ignore-scripts', '--no-audit', '--no-fund'], 'corrupt-cache'),
    error => error.stderr.includes('EINTEGRITY'));
});
