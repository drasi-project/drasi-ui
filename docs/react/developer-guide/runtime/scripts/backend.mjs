// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { chmod, copyFile, lstat, mkdir, mkdtemp, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { renderServerConfig, verifyRuntimeVersion } from './config.mjs';
import { lessonArguments, portHelp, saveLessonPorts } from './lesson-config.mjs';

assert.equal(typeof import.meta.main, 'boolean', 'Use a supported launcher toolchain: Node 22.20.0 or 24.19.0');
export const pins = JSON.parse(await readFile(new URL('../config/runtime-pins.json', import.meta.url), 'utf8'));
const execute = promisify(execFile);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function pluginLock(platform) {
  return 'version = 1\n' + platform.plugins.map(plugin => {
    const name = `${plugin.kind}:${plugin.version}`;
    return `\n[plugins.${JSON.stringify(name)}]\n` + Object.entries({
      reference: `ghcr.io/drasi-project/${plugin.kind}@sha256:${plugin.digest}`,
      version: plugin.version, digest: `sha256:${plugin.digest}`,
      sdk_version: pins.sdkVersion, core_version: '0.5.10', lib_version: '0.9.3',
      platform: platform.platform, filename: plugin.filename, file_hash: plugin.sha256,
    }).map(([key, value]) => `${key} = ${JSON.stringify(value)}\n`).join('') +
      `\n[plugins.${JSON.stringify(name)}.signature]\nverified = true\n` +
      `issuer = ${JSON.stringify(pins.issuer)}\nsubject = ${JSON.stringify(pins.subject)}\n`;
  }).join('');
}

async function verifyFile(file, expected) {
  assert((await lstat(file)).isFile(), `Expected a regular downloaded file: ${file}`);
  assert.equal(sha256(await readFile(file)), expected, `Download checksum mismatch: ${file}`);
}

async function prepareRuntime(directory) {
  const platform = pins.platforms[`${process.platform}-${process.arch}`];
  assert(platform, 'No pinned backend for this platform. See the tested native-platform matrix in the backend lesson.');
  await mkdir(directory, { recursive: true });
  assert((await lstat(directory)).isDirectory(), 'Runtime directory must not be a symlink');
  const binary = join(directory, platform.binary);
  try { await verifyFile(binary, platform.sha256); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const temporary = join(directory, `download-${randomUUID()}`);
    const url = `https://github.com/drasi-project/drasi-server/releases/download/${pins.serverVersion}/${platform.binary}`;
    console.log(`Downloading Drasi Server ${pins.serverVersion} from its versioned GitHub release.`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
      assert(response.ok && response.body, `Server download failed: HTTP ${response.status}`);
      await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary, { flags: 'wx' }));
      await verifyFile(temporary, platform.sha256);
      await rename(temporary, binary);
    } finally { await rm(temporary, { force: true }); }
  }
  await chmod(binary, 0o755);
  const { stdout: version } = await execute(binary, ['--version']);
  verifyRuntimeVersion(version, { server: pins.serverVersion, sdk: pins.sdkVersion });
  assert(version.includes(`plugin ABI: ${pins.abiVersion}`), 'Unexpected server plugin ABI');
  const plugins = join(directory, 'plugins');
  await mkdir(plugins, { recursive: true });
  assert((await lstat(plugins)).isDirectory(), 'Plugin directory must not be a symlink');
  const lock = pluginLock(platform);
  try {
    assert((await lstat(join(plugins, 'plugins.lock'))).isFile(), 'Plugin lock must be a regular file');
    assert.equal(await readFile(join(plugins, 'plugins.lock'), 'utf8'), lock, 'Existing runtime plugin lock differs');
  }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await writeFile(join(plugins, 'plugins.lock'), lock, { flag: 'wx' });
  }
  const config = join(directory, 'install.json');
  await writeFile(config, JSON.stringify({
    apiVersion: 'drasi.io/v1', verifyPlugins: true, autoInstallPlugins: false,
    plugins: platform.plugins.map(plugin => ({ ref: `${plugin.kind}:${plugin.version}` })),
  }) + '\n');
  // The released installer can exit zero after a per-plugin failure; verify every result.
  const result = await execute(binary, ['--config', config, '--plugins-dir', plugins,
    'plugin', 'install', '--from-config', '--locked'], { timeout: 300_000, maxBuffer: 4 * 1024 * 1024 });
  await writeFile(join(directory, 'plugin-install.log'), result.stdout + result.stderr);
  for (const plugin of platform.plugins) await verifyFile(join(plugins, plugin.filename), plugin.sha256);
  assert.equal(await readFile(join(plugins, 'plugins.lock'), 'utf8'), lock, 'Installer changed pinned plugin identities');
  return { binary, plugins, platform, version };
}

async function assertFreePort(port) {
  const server = createServer();
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', accept);
  });
  await new Promise((accept, reject) => server.close(error => error ? reject(error) : accept()));
}

export async function startBackend({
  directory = resolve('.cold-storage-backend'),
  ports = { restPort: 8080, ssePort: 8081, feedPort: 8082 },
  configFile,
} = {}) {
  directory = resolve(directory);
  const template = await readFile(configFile ?? new URL('../config/server.yaml', import.meta.url), 'utf8');
  const config = renderServerConfig(template, ports);
  assert.equal(new Set(Object.values(ports)).size, 3, 'Backend ports must be distinct');
  for (const port of Object.values(ports)) await assertFreePort(port);
  const runtime = await prepareRuntime(directory);
  const run = await mkdtemp(join(directory, 'run-'));
  await writeFile(join(run, 'server.yaml'), config);
  await copyFile(new URL('../config/readings.jsonl', import.meta.url), join(run, 'readings.jsonl'));
  const log = await open(join(run, 'server.log'), 'wx');
  const child = spawn(runtime.binary, ['--config', join(run, 'server.yaml'), '--plugins-dir', runtime.plugins],
    { cwd: run, stdio: ['ignore', log.fd, log.fd] });
  let processError;
  child.once('error', error => { processError = error; });
  const exited = new Promise(accept => child.once('close', accept));
  let stopped = false;
  const close = async () => {
    if (stopped) return;
    stopped = true;
    if (!processError && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
      await exited;
      clearTimeout(timer);
    }
    await exited;
    await log.close();
    await writeFile(join(run, 'cleanup.json'), JSON.stringify({ pid: child.pid, stopped: true }) + '\n');
  };
  const rest = `http://127.0.0.1:${ports.restPort}`;
  const events = `http://127.0.0.1:${ports.ssePort}`;
  const feed = `http://127.0.0.1:${ports.feedPort}`;
  try {
    let snapshots;
    for (let attempt = 0; attempt < 300; attempt += 1) {
      if (processError) throw processError;
      assert(child.exitCode === null && child.signalCode === null, `Server stopped; inspect ${join(run, 'server.log')}`);
      try {
        snapshots = {};
        for (const query of ['north-room', 'south-room', 'warm-probes']) {
          const response = await fetch(`${rest}/api/v1/instances/cold-chain/queries/${query}/results`,
            { signal: AbortSignal.timeout(1500) });
          if (!response.ok) { snapshots = null; break; }
          const body = await response.json();
          assert(body.success && Array.isArray(body.data), 'Invalid released server snapshot response');
          snapshots[query] = body.data;
        }
        if (snapshots?.['north-room'].length === 2 && snapshots['south-room'].length === 2 &&
            snapshots['warm-probes'].length === 1) break;
      } catch (error) {
        if (!(error instanceof TypeError && ['ECONNREFUSED', 'ECONNRESET', 'UND_ERR_SOCKET'].includes(error.cause?.code)) &&
            !(error instanceof DOMException && error.name === 'TimeoutError')) throw error;
      }
      snapshots = null;
      await delay(200);
    }
    assert(snapshots, `Backend did not become ready; inspect ${join(run, 'server.log')}`);
    const response = await fetch(`${rest}/api/v1/plugins`, { signal: AbortSignal.timeout(5000) });
    assert(response.ok, `Plugin metadata unavailable: HTTP ${response.status}`);
    const loaded = await response.json();
    for (const plugin of runtime.platform.plugins) {
      const actual = loaded.plugins?.find(item => item.id === plugin.kind);
      assert(actual && actual.fileHash === plugin.sha256 && actual.pluginVersion === plugin.version &&
        actual.sdkVersion === pins.abiVersion && ['Loaded', 'Active'].includes(actual.status),
      `Loaded plugin differs from pinned ${plugin.kind}; inspect ${join(run, 'server.log')}`);
    }
    const evidence = {
      serverVersion: pins.serverVersion, sseVersion: '0.3.8', binarySha256: runtime.platform.sha256,
      serverSource: pins.serverSource, pluginSource: runtime.platform.pluginSource ?? pins.pluginSource,
      platform: runtime.platform.platform, loaded, snapshots, rest, events, feed, pid: child.pid,
    };
    await writeFile(join(run, 'provenance.json'), JSON.stringify(evidence, null, 2) + '\n');
    console.log(`Cold storage ready: REST ${rest}, SSE ${events}/events, feed ${feed}.\n` +
      `North: 2 probes; South: 2 probes; warm-probes: 1 probe. Ctrl+C stops this server.\nLogs: ${run}`);
    return { rest, events, feed, directory: run, provenance: join(run, 'provenance.json'), close, child };
  } catch (error) { await close(); throw error; }
}

if (import.meta.main) {
  const options = lessonArguments(process.argv.slice(2), { config: true });
  if (options.help) console.log(`Usage: node backend.mjs [--config server.yaml] ${portHelp}\n` +
    'Uses lesson-ports.json (defaults 8080/8081/8082). Explicit port flags update that shared app configuration. Ctrl+C stops only this server.');
  else {
    const { restPort, ssePort, feedPort } = options.ports;
    const backend = await startBackend({ ports: { restPort, ssePort, feedPort }, configFile: options.config });
    if (options.changed) saveLessonPorts(options.ports);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
      void backend.close().catch(error => { console.error(error); process.exitCode = 1; });
    });
  }
}
