import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { defaultPorts, lessonUrls, validatePorts } from '../../examples/react/scripts/lesson-config.mjs';
import { renderServerConfig } from '../../examples/react/scripts/config.mjs';

test('one CLI setting drives persisted launcher, Vite and POSIX/PowerShell curl URLs', async context => {
  const directory = await mkdtemp(join(tmpdir(), 'drasi-lesson-ports-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const execute = promisify(execFile);
  const script = fileURLToPath(new URL('../../examples/react/scripts/lesson-config.mjs', import.meta.url));
  await execute(process.execPath, [script, '--rest-port', '18080', '--sse-port', '18081',
    '--feed-port', '18082', '--auth-port', '18083', '--vite-port', '15173'], { cwd: directory });
  const ports = JSON.parse(await readFile(join(directory, 'lesson-ports.json')));
  assert.deepEqual(ports, { restPort: 18080, ssePort: 18081, feedPort: 18082, authPort: 18083, vitePort: 15173 });
  for (const [name, url] of Object.entries(lessonUrls(ports))) {
    assert((await readFile(join(directory, 'lesson-ports.sh'), 'utf8')).includes(`DRASI_${name.toUpperCase()}_URL='${url}'`));
    assert((await readFile(join(directory, 'lesson-ports.ps1'), 'utf8')).includes(`DRASI_${name.toUpperCase()}_URL = '${url}'`));
  }
  for (const args of [['--rest-port', '80'], ['--rest-port', '8080x'], ['--rest-port', '65536'],
    ['--rest-port', '18081'], ['--unknown', '2000'], ['--rest-port', '18080', '--rest-port', '18080']]) {
    await assert.rejects(execute(process.execPath, [script, ...args], { cwd: directory }));
  }
  assert.deepEqual(JSON.parse(await readFile(join(directory, 'lesson-ports.json'))), ports);
});

test('port validation rejects incomplete, nonnumeric and colliding settings, and supports swapped defaults', async () => {
  for (const ports of [{}, { ...defaultPorts, restPort: '8080' }, { ...defaultPorts, ssePort: 8080 },
    { ...defaultPorts, restPort: 1.1 }, { ...defaultPorts, extra: 8084 }]) assert.throws(() => validatePorts(ports));
  const template = await readFile(new URL('../../examples/react/config/server.yaml', import.meta.url), 'utf8');
  const output = renderServerConfig(template, { restPort: 8081, ssePort: 8080, feedPort: 8082 });
  assert(output.includes('host: "127.0.0.1"\nport: 8081'));
  assert(output.includes('        port: 8080'));
});

test('launcher refuses an occupied port without downloading, reusing or stopping its owner', async context => {
  const server = createServer(socket => socket.end('owned by the test\n'));
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
  context.after(() => new Promise((accept, reject) => server.close(error => error ? reject(error) : accept())));
  const port = server.address().port;
  const directory = await mkdtemp(join(tmpdir(), 'drasi-occupied-port-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const backend = fileURLToPath(new URL('../../examples/react/scripts/backend.mjs', import.meta.url));
  await assert.rejects(promisify(execFile)(process.execPath, [backend, '--rest-port', String(port)], { cwd: directory }),
    error => error.stderr.includes('EADDRINUSE') && !error.stdout.includes('Downloading'));
  assert.equal(server.listening, true);
});
