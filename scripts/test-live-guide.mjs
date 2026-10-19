// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import assert from 'node:assert/strict';
import { execFileSync, fork, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer as createNetServer } from 'node:net';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';
import { extractGuide } from '../tests/consumers/public-contract/developer-guide.mjs';
import { guideFigures } from './guide-assets.mjs';
import { candidateDirectory } from './packages.mjs';
import { renderPrintGuide } from './print-guide.mjs';

const args = process.argv.slice(2);
assert(args.every(arg => ['--iteration', '--capture', '--non-default-ports'].includes(arg)),
  'Usage: test-live-guide.mjs [--iteration] [--capture] [--non-default-ports]');
const iteration = args.includes('--iteration');
const capturing = args.includes('--capture');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const output = resolve(args.includes('--non-default-ports') ? '.artifacts/live-guide/non-default' : '.artifacts/live-guide');
await mkdir(join(output, 'figures'), { recursive: true });
const selection = JSON.parse(await readFile(iteration ? '.artifacts/guide-iteration.json' : '.artifacts/consumers.json', 'utf8'));
const app = selection.consumers.guide.directory;
const nextApp = selection.consumers.guideNext.directory;
const kit = selection.consumers.guide.kitDirectory;
const runtime = join(kit, 'docs/developer-guide/runtime');
const { startBackend, pins } = await import(pathToFileURL(join(runtime, 'scripts/backend.mjs')).href);
const { readLessonPorts } = await import(pathToFileURL(join(runtime, 'scripts/lesson-config.mjs')).href);
execFileSync(process.execPath, [join(runtime, 'scripts/lesson-config.mjs'),
  ...(args.includes('--non-default-ports')
    ? ['--rest-port', '18080', '--sse-port', '18081', '--feed-port', '18082', '--auth-port', '18083', '--vite-port', '15173'] : [])],
{ cwd: app, stdio: 'pipe' });
const ports = readLessonPorts(app);
const backendPorts = { restPort: ports.restPort, ssePort: ports.ssePort, feedPort: ports.feedPort };
const book = await readFile(join(kit, 'docs/developer-guide/README.md'), 'utf8');
const { examples, assets } = extractGuide(book);
const modules = new Map(examples.map(example => [example.name, example.code]));
const set = JSON.parse(await readFile(join(iteration ? selection.candidates : candidateDirectory, 'release-set.json'), 'utf8'));
const proof = {
  source: set.source, iteration, artifacts: set.packages.map(({ name, sha256 }) => ({ name, sha256 })),
  bookSha256: hash(book), moduleSha256: Object.fromEntries(examples.map(item => [item.name, hash(item.code)])),
  server: { version: pins.serverVersion, source: pins.serverSource,
    pluginsSource: pins.platforms[`${process.platform}-${process.arch}`]?.pluginSource ?? pins.pluginSource,
    platform: pins.platforms[`${process.platform}-${process.arch}`] },
  checks: [], figures: {}, browser: null, pageErrors: [], consoleErrors: [], requests: [],
  ports, learningKitSha256: selection.consumers.guide.learningKitSha256,
};
let backend, gateway, vite, browser, next, nextExit, nextLog, frozen = false, phase = 'setup';
let currentConfig = 'vite.config.mjs';
const cache = resolve(process.env.DRASI_BACKEND_CACHE ?? '.artifacts/released-backend');
const changedFigures = new Set(['04-dialog.png', '07-identity.png', '14-notification.png', '15-authentication.png']);
const previousCaptures = capturing ? JSON.parse(await readFile('tests/contracts/guide-screenshots.json', 'utf8')) : null;
async function startVite(config) {
  await vite?.close();
  await writeFile(join(app, 'vite.config.mjs'), assets.get(config).code);
  currentConfig = config;
  vite = await createServer({
    root: app, configFile: join(app, 'vite.config.mjs'),
    server: {
      host: '127.0.0.1', port: ports.vitePort, strictPort: true,
      ...(config === 'vite.config.mjs' ? {} : { proxy: { '/unmonitored-events': {
        target: backend.events, rewrite: path => path.replace('/unmonitored-events', '/events'),
      } } }),
    },
  });
  await vite.listen();
}
async function startGateway(options = {}) {
  const child = fork(new URL('../tests/consumers/public-contract/auth-gateway-process.mjs', import.meta.url),
    [runtime, JSON.stringify({ rest: backend.rest, events: backend.events, port: ports.authPort, ...options })],
    { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], execArgv: [] });
  const log = createWriteStream(join(output, `auth-gateway-${child.pid}.log`));
  child.stdout.pipe(log); child.stderr.pipe(log);
  let stats, sequence = 0, closed = false, exited = false;
  const pending = new Map();
  const exit = new Promise(accept => child.once('exit', code => {
    exited = true; log.end();
    for (const request of pending.values()) request.reject(new Error(`Owned gateway exited: ${code}`));
    pending.clear();
    accept(code);
  }));
  const url = await new Promise((accept, reject) => {
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Gateway startup timed out')); }, 10_000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`Gateway startup exited: ${code}`)); });
    child.on('message', message => {
      if (message.stats) stats = message.stats;
      if (message.ready) { clearTimeout(timer); accept(message.url); }
      const request = pending.get(message.id);
      if (request) {
        pending.delete(message.id);
        if (message.error) request.reject(new Error(message.error));
        else request.accept();
      }
    });
  });
  const command = (operation, value) => new Promise((accept, reject) => {
    if (exited) { reject(new Error('Gateway is no longer running')); return; }
    const id = ++sequence;
    pending.set(id, { accept, reject });
    child.send({ id, operation, value });
  });
  return {
    url, pid: child.pid, get stats() { return stats; },
    closeStreams: () => command('closeStreams'),
    setAccepting: value => command('setAccepting', value),
    setSessionStatus: value => command('setSessionStatus', value),
    setResourceStatus: value => command('setResourceStatus', value),
    async close() {
      if (closed) return;
      closed = true;
      const timer = setTimeout(() => child.kill('SIGTERM'), 5000);
      try {
        if (!exited) await command('close');
        assert.equal(await exit, 0, 'Owned gateway did not stop cleanly');
      } finally { clearTimeout(timer); }
    },
  };
}

async function freePort(port) {
  const server = createNetServer();
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', accept); });
  await new Promise((accept, reject) => server.close(error => error ? reject(error) : accept()));
}
try {
  backend = await startBackend({ directory: cache, ports: backendPorts });
  gateway = await startGateway();
  await writeFile(join(app, 'src/main.tsx'), modules.get('main.tsx'));
  await startVite('vite.config.mjs');
  const origin = `http://127.0.0.1:${ports.vitePort}`;
  assert.equal((await fetch(origin)).status, 200);
  browser = await chromium.launch({ headless: true });
  proof.browser = browser.version();
  const page = await browser.newPage({ viewport: { width: 1100, height: 880 }, locale: 'en-US' });
  page.on('pageerror', error => proof.pageErrors.push({ phase, message: error.message, stack: error.stack }));
  page.on('console', message => {
    if (message.type() === 'error') proof.consoleErrors.push({ phase, message: message.text() });
  });
  page.on('request', request => {
    const url = new URL(request.url());
    if (['/events', '/secured/events', '/lesson-session'].includes(url.pathname) || url.pathname.includes('/api/v1/')) {
      proof.requests.push({ phase, path: url.pathname, method: request.method() });
    }
  });
  const reads = query => proof.requests.filter(request => request.path.endsWith(`/queries/${query}/results`)).length;
  const streams = () => proof.requests.filter(request => request.path === '/events').length;
  async function entry(name) {
    phase = name;
    const config = ['main.tsx', 'sorted-main.tsx', 'review-main.tsx', 'theme-main.tsx'].includes(name)
      ? 'vite.config.mjs' : name === 'authenticated-main.tsx' ? 'vite-auth.config.mjs' : 'vite-live.config.mjs';
    if (config !== currentConfig) {
      await page.goto('about:blank');
      await writeFile(join(app, 'src/main.tsx'), modules.get(name));
      await startVite(config);
      await page.goto(origin);
      return;
    }
    const loaded = page.url() === 'about:blank' ? null : page.waitForEvent('load', { timeout: 20_000 });
    if (loaded) {
      await writeFile(join(app, 'src/.main-next.tmp'), modules.get(name));
      await rename(join(app, 'src/.main-next.tmp'), join(app, 'src/main.tsx'));
      await loaded;
    }
    else await page.goto(origin);
  }
  async function capture(name) {
    assert(guideFigures.includes(name), `Unregistered figure ${name}`);
    const file = join(output, 'figures', name);
    if (await page.getByRole('dialog').count()) {
      await page.screenshot({ path: file, fullPage: true, animations: 'disabled', scale: 'css' });
    } else {
      await page.locator('body').screenshot({ path: file, animations: 'disabled', scale: 'css' });
    }
    const bytes = await readFile(file);
    proof.figures[name] = { bytes: bytes.length, sha256: hash(bytes), entry: phase };
    if (capturing && changedFigures.has(name)) {
      const directory = resolve('docs/react/developer-guide/figures');
      await mkdir(directory, { recursive: true });
      await copyFile(file, join(directory, name));
    }
  }
  async function feed(operation, id, properties) {
    const body = operation === 'delete' ? { operation, id, labels: ['Probe'] }
      : { operation, element: { type: 'node', id, labels: ['Probe'], properties } };
    const response = await fetch(`${backend.feed}/sources/probe-feed/events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    assert(response.ok, `Real source mutation failed: HTTP ${response.status}`);
  }
  const temperature = value => feed('update', 'north-probe',
    { probeId: 'probe-1001', room: 'North', temperatureC: value });
  const probe = (table, id = 'probe-1001') => table.getByRole('row').filter({ hasText: id });
  const northTable = () => page.getByRole('table', { name: 'North room', exact: true });
  await entry('main.tsx');
  await expect(probe(page.getByRole('table'))).toContainText('3.0');
  await page.getByRole('button', { name: 'Warm North', exact: true }).click();
  await expect(probe(page.getByRole('table'))).toContainText('8.0');
  await capture('02-first-screen.png');
  await page.getByRole('button', { name: 'Reset readings', exact: true }).click();
  await expect(probe(page.getByRole('table'))).toContainText('3.0');
  proof.checks.push('Four-row starter warms, resets and renders a stable identity');

  await entry('sorted-main.tsx');
  await expect(page.locator('tbody tr').first()).toContainText('9.0');
  await page.getByRole('button', { name: 'Warm North', exact: true }).click();
  await expect(page.locator('tbody tr').nth(1)).toContainText('probe-1001');
  await capture('03-sorting.png');
  await page.getByRole('button', { name: 'Reset readings', exact: true }).click();
  const heading = page.getByRole('columnheader', { name: 'Temperature (C)' });
  await heading.getByRole('button').focus();
  await page.keyboard.press('Enter');
  await expect(heading).toHaveAttribute('aria-sort', 'ascending');
  await expect(page.locator('tbody tr').first()).toContainText('3.0');
  await page.keyboard.press('Space');
  await expect(heading).toHaveAttribute('aria-sort', 'descending');
  await page.getByRole('button', { name: 'Input order', exact: true }).click();
  await expect(page.locator('tbody tr').first()).toContainText('6.0');
  proof.checks.push('HMR chapter switch, warming while sorted, keyboard sorting, aria-sort and distinct input order');

  await entry('review-main.tsx');
  const reviewButton = probe(page.getByRole('table')).getByRole('button', { name: 'Review probe' });
  await reviewButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Close review' })).toBeFocused();
  await capture('04-dialog.png');
  await page.keyboard.press('Escape');
  await expect(reviewButton).toBeFocused();
  const scheduledAt = Date.now();
  await page.getByRole('button', { name: 'Remove probe-1001 in 8 seconds', exact: true }).click();
  await reviewButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toContainText('no longer in the current view', { timeout: 12_000 });
  assert(Date.now() - scheduledAt >= 7900, 'The local dialog exercise did not wait for its scheduled timer');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Record local review' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Local probe reviews', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Reset readings', exact: true }).click();
  await expect(probe(page.getByRole('table'))).toContainText('3.0');
  proof.checks.push('Backend-free scheduled removal fires with dialog open after eight seconds; unavailable row, disabled review and heading focus fallback');
  await entry('theme-main.tsx');
  await page.getByRole('button', { name: 'Dark theme', exact: true }).click();
  await probe(page.getByRole('table')).getByRole('button', { name: 'Review probe' }).click();
  await expect(page.getByRole('dialog')).toHaveCSS('background-color', 'rgb(15, 23, 42)');
  await capture('05-theme.png');
  await page.keyboard.press('Escape');
  proof.checks.push('Dialog keyboard focus/return and portal theme inheritance');

  await entry('live-main.tsx');
  await expect(probe(northTable())).toContainText('3.0');
  await temperature(8);
  await expect(probe(northTable())).toContainText('8.0');
  await capture('06-live.png');
  await backend.close();
  backend = await startBackend({ directory: cache, ports: backendPorts });
  await expect(probe(northTable())).toContainText('3.0', { timeout: 25_000 });
  await feed('insert', 'new-probe', { probeId: 'probe-3001', room: 'North', temperatureC: 2 });
  await expect(probe(northTable(), 'probe-3001')).toContainText('2.0');
  await capture('07-identity.png');
  await feed('delete', 'new-probe');
  await expect(probe(northTable(), 'probe-3001')).toHaveCount(0);
  proof.checks.push('Released Server snapshots and actual source insert/update/delete rendered in QueryTable');

  await temperature(4);
  await entry('warm-main.tsx');
  const warm = page.getByRole('table', { name: 'Warm probes', exact: true });
  await expect(probe(warm)).toHaveCount(0);
  await temperature(8);
  await expect(probe(warm)).toContainText('8.0');
  await capture('08-membership.png');
  await temperature(9);
  await expect(probe(warm)).toContainText('9.0');
  await temperature(4);
  await expect(probe(warm)).toHaveCount(0);
  await expect(probe(northTable())).toContainText('4.0');
  proof.checks.push('Warm query entry at 8 C, update while present at 9 C, and exit at 4 C');

  phase = 'configuration-client-query-set';
  await writeFile(join(app, 'src/live-cold-storage.tsx'), modules.get('live-cold-storage.tsx')
    .replace("const queryIds = ['north-room', 'south-room', 'warm-probes'];",
      "const queryIds = ['north-room', 'south-room'];"));
  await expect(page.getByRole('alert').filter({ hasText: 'INVALID_CONFIGURATION' })).toHaveCount(1);
  await expect(probe(northTable())).toContainText('4.0');
  await expect(page.getByRole('table', { name: 'South room', exact: true })).toContainText('5.0');
  await writeFile(join(app, 'src/live-cold-storage.tsx'), modules.get('live-cold-storage.tsx'));
  await expect(page.getByRole('alert').filter({ hasText: 'INVALID_CONFIGURATION' })).toHaveCount(0);
  phase = 'configuration-reaction-query-set';
  const template = await readFile(join(runtime, 'config/server.yaml'), 'utf8');
  const editedConfig = join(app, 'lesson-server.yaml');
  await writeFile(editedConfig, template.replace('queries: [north-room, south-room, warm-probes]',
    'queries: [north-room, south-room]'));
  await backend.close();
  backend = await startBackend({ directory: cache, ports: backendPorts, configFile: editedConfig });
  await expect(page.getByRole('alert').filter({ hasText: 'INCOMPATIBLE_RESOURCE' })).toHaveCount(3, { timeout: 25_000 });
  await backend.close();
  await writeFile(editedConfig, template);
  backend = await startBackend({ directory: cache, ports: backendPorts, configFile: editedConfig });
  await page.reload();
  await expect(probe(northTable())).toContainText('3.0');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await temperature(4);
  proof.checks.push('Both configuration exercises: one query-local INVALID_CONFIGURATION card, shared INCOMPATIBLE_RESOURCE for missing reaction membership, explicit restore/reload');

  await entry('dashboard-main.tsx');
  const north = page.getByRole('region', { name: 'North room', exact: true });
  await expect(north.getByRole('table')).toContainText('4.0');
  const beforeFilter = { reads: reads('north-room'), streams: streams() };
  await north.getByLabel('Show warm probes only').check();
  await expect(north.getByRole('status').filter({ hasText: 'Query:' })).toContainText('Query: empty');
  await temperature(8);
  await expect(north.getByRole('list')).toContainText('8.0');
  await expect(north.getByRole('table')).toContainText('8.0');
  await capture('09-shared-view.png');
  assert.equal(reads('north-room'), beforeFilter.reads);
  assert.equal(streams(), beforeFilter.streams);
  proof.checks.push('Local projection/filter changes share cards/table data without new reads or transport');

  await entry('failure-main.tsx');
  await expect(north.getByRole('table')).toContainText('8.0');
  const beforeFailure = { reads: reads('north-room'), streams: streams() };
  await page.getByLabel('Demonstrate a projection error (client only)').check();
  await expect(north.getByRole('alert')).toContainText('RESULT_PROCESSING_FAILED');
  await expect(north.getByRole('button', { name: 'Retry query', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'South room', exact: true }).getByRole('status')
    .filter({ hasText: 'Query:' })).toContainText('Query: live');
  await capture('10-projection-error.png');
  await page.getByLabel('Demonstrate a projection error (client only)').uncheck();
  await expect(north.getByRole('alert')).toHaveCount(0);
  assert.equal(reads('north-room'), beforeFailure.reads);
  assert.equal(streams(), beforeFailure.streams);
  proof.checks.push('Isolated sanitized projection error and code-fix recovery without retry or reconnect');

  await entry('live-main.tsx');
  await expect(probe(northTable())).toContainText('8.0');
  await page.evaluate(() => new Promise((accept, reject) => {
    const stream = new EventSource('/unmonitored-events');
    globalThis.guideControlStream = stream;
    stream.onopen = () => accept();
    stream.onerror = () => reject(new Error('Control stream failed to open'));
  }));
  phase = 'real-backend-silence';
  const paused = Date.now();
  assert(backend.child.kill('SIGSTOP'), 'Could not pause the owned backend');
  frozen = true;
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 12_000 });
  const detectedMs = Date.now() - paused;
  assert(detectedMs >= 4000 && detectedMs < 12_000, `Unexpected guarded silence detection: ${detectedMs}ms`);
  assert.equal(await page.evaluate(() => globalThis.guideControlStream.readyState), 1,
    'Unmonitored EventSource control did not reproduce an apparently open silent stream');
  await capture('11-reconnecting.png');
  backend.child.kill('SIGCONT');
  frozen = false;
  await page.evaluate(() => globalThis.guideControlStream.close());
  await expect(page.getByRole('alert')).toHaveCount(0, { timeout: 20_000 });
  proof.liveness = { detectedMs, controlReadyStateWhileGuardedStreamFailed: 1, heartbeatMs: 1000, proxyIdleLimitMs: 5000 };
  proof.checks.push('Real backend paused: unmonitored stream stayed OPEN; heartbeat-aware Vite proxy detected silence');
  await backend.close();
  await expect(page.getByRole('alert')).toBeVisible();
  backend = await startBackend({ directory: cache, ports: backendPorts });
  await expect(probe(northTable())).toContainText('3.0', { timeout: 25_000 });
  await expect(page.getByRole('alert')).toHaveCount(0);
  proof.checks.push('Real backend stop/restart recovers automatically to fresh initialization');

  await temperature(8);
  await entry('notification-main.tsx');
  const notifications = page.getByRole('list', { name: 'Warm notifications' });
  await expect(north.getByRole('table')).toContainText('8.0');
  await expect(notifications.getByRole('listitem')).toHaveCount(0);
  await temperature(4);
  await expect(north.getByRole('table')).toContainText('4.0');
  await temperature(8);
  await expect(notifications.getByRole('listitem')).toHaveCount(1);
  await capture('14-notification.png');
  await temperature(9);
  await expect(north.getByRole('table')).toContainText('9.0');
  await north.getByRole('button', { name: 'Refresh query', exact: true }).click();
  await expect(north.getByRole('status').filter({ hasText: 'Query:' })).toContainText('Query: live');
  await north.getByLabel('Show warm probes only').check();
  await north.getByLabel('Show warm probes only').uncheck();
  await expect(notifications.getByRole('listitem')).toHaveCount(1);
  await feed('delete', 'north-probe');
  await expect(probe(north.getByRole('table'))).toHaveCount(0);
  await feed('insert', 'north-probe', { probeId: 'probe-1001', room: 'North', temperatureC: 8 });
  await expect(notifications.getByRole('listitem')).toHaveCount(2);
  const southTemperature = value => feed('update', 'south-probe',
    { probeId: 'probe-2001', room: 'South', temperatureC: value });
  await southTemperature(8);
  await expect(notifications.getByRole('listitem')).toHaveCount(3);
  await expect(notifications.getByRole('listitem').last()).toContainText('South: probe-2001');
  await southTemperature(9);
  await expect(probe(page.getByRole('table', { name: 'Warm probes', exact: true }), 'probe-2001')).toContainText('9.0');
  await expect(notifications.getByRole('listitem')).toHaveCount(3);
  await southTemperature(4);
  await expect(probe(page.getByRole('table', { name: 'Warm probes', exact: true }), 'probe-2001')).toHaveCount(0);
  await southTemperature(8);
  await expect(notifications.getByRole('listitem')).toHaveCount(4);
  const beforeWarmRefresh = { reads: reads('warm-probes'), streams: streams() };
  await page.getByRole('button', { name: 'Refresh warm result', exact: true }).click();
  await expect.poll(() => reads('warm-probes')).toBe(beforeWarmRefresh.reads + 1);
  await expect(notifications.getByRole('listitem')).toHaveCount(4);
  assert.equal(streams(), beforeWarmRefresh.streams);
  await backend.close();
  backend = await startBackend({ directory: cache, ports: backendPorts });
  await expect(north.getByRole('table')).toContainText('3.0', { timeout: 25_000 });
  await expect(notifications.getByRole('listitem')).toHaveCount(4);
  await page.reload();
  await expect(north.getByRole('table')).toContainText('3.0');
  await expect(notifications.getByRole('listitem')).toHaveCount(0);
  proof.checks.push('Actual StrictMode membership notifications: both rooms, quiet already-warm baseline, within-membership updates, exit/reentry, Warm refresh without extra transport, quiet reconnect/resync and reload');

  await temperature(8);
  await entry('authenticated-main.tsx');
  await expect(north.getByRole('table')).toContainText('8.0');
  await expect(north.locator('.drasi-query-table')).toHaveCSS('border-top-width', '1px');
  await expect.poll(() => gateway.stats.acceptedStreams).toBeGreaterThan(0);
  assert.equal((await fetch(`${gateway.url}/secured/api/v1/instances/cold-chain/queries/north-room/results`)).status, 401);
  assert.equal((await fetch(`${gateway.url}/secured/events`)).status, 401);
  const authenticated = { ...gateway.stats };
  assert(authenticated.issued <= 2, `Expected a shared session token, not ${authenticated.issued} issued tokens`);
  await temperature(9);
  await expect(north.getByRole('table')).toContainText('9.0');
  await north.getByRole('button', { name: 'Refresh query', exact: true }).click();
  await expect.poll(() => gateway.stats.acceptedReads).toBeGreaterThan(authenticated.acceptedReads);
  assert.equal(gateway.stats.issued, authenticated.issued, 'Fresh cached token was not reused on refresh');
  await gateway.closeStreams();
  await expect.poll(() => gateway.stats.acceptedStreams).toBeGreaterThan(authenticated.acceptedStreams);
  await expect(page.getByRole('region', { name: 'Connection' }).getByRole('status')).toHaveText('Stream: open.');
  phase = 'auth-gateway-restart-cached-token';
  const previousGatewayPid = gateway.pid;
  await gateway.close();
  await expect(page.getByRole('region', { name: 'Connection' }).getByRole('status')).toHaveText('Stream: reconnecting.');
  gateway = await startGateway();
  assert.notEqual(gateway.pid, previousGatewayPid, 'The restart must create a new gateway process');
  await expect(page.getByRole('region', { name: 'Connection' }).getByRole('status')).toHaveText('Stream: open.', { timeout: 25_000 });
  assert(gateway.stats.rejected > 0, 'Restart did not exercise a still-unexpired cached token rejected by the new gateway');
  assert.equal(gateway.stats.issued, 1, 'Concurrent stale-token revalidation must share one refresh');
  await temperature(7);
  await expect(north.getByRole('table')).toContainText('7.0');
  proof.authentication = { initial: authenticated, cachedTokenRestart: {
    ...gateway.stats, previousPid: previousGatewayPid, newPid: gateway.pid, automatic: true,
  } };

  phase = 'auth-session-service-503';
  await gateway.setSessionStatus(503);
  await expect(page.getByRole('region', { name: 'Connection' }).getByRole('status')).toHaveText('Stream: reconnecting.');
  await gateway.setSessionStatus(200);
  await expect(page.getByRole('region', { name: 'Connection' }).getByRole('status')).toHaveText('Stream: open.', { timeout: 25_000 });
  await temperature(6);
  await expect(north.getByRole('table')).toContainText('6.0');
  proof.authentication.service503 = { recoveredAutomatically: true, sessionRequests: gateway.stats.sessionRequests };

  phase = 'auth-gateway-down-expired-token';
  const tokenRequests = () => proof.requests.filter(request => request.phase === phase && request.path === '/lesson-session').length;
  await gateway.close();
  await expect.poll(tokenRequests, { timeout: 45_000 }).toBeGreaterThan(0);
  gateway = await startGateway();
  await expect(page.getByRole('region', { name: 'Connection' }).getByRole('status')).toHaveText('Stream: open.', { timeout: 45_000 });
  await temperature(5);
  await expect(north.getByRole('table')).toContainText('5.0');
  proof.authentication.expiredTokenRestart = { ...gateway.stats, automatic: true };

  for (const [status, code] of [[401, 'UNAUTHENTICATED'], [403, 'FORBIDDEN']]) {
    phase = `auth-token-endpoint-${status}`;
    await gateway.setSessionStatus(status);
    await expect(page.getByRole('region', { name: 'Connection' }).getByRole('alert')).toContainText(code, { timeout: 25_000 });
    const stopped = gateway.stats.sessionRequests;
    await delay(1500);
    assert.equal(gateway.stats.sessionRequests, stopped, 'A terminal session denial started an automatic retry loop');
    await gateway.setSessionStatus(200);
    await page.getByRole('region', { name: 'Connection' }).getByRole('button', { name: 'Retry connection' }).click();
    await expect(page.getByRole('region', { name: 'Connection' }).getByRole('status')).toHaveText('Stream: open.');
    proof.authentication[`session${status}`] = { terminal: true, repairedSessionManualRetry: true };
  }
  for (const [status, code] of [[401, 'UNAUTHENTICATED'], [403, 'FORBIDDEN']]) {
    phase = `auth-protected-resource-${status}`;
    const issued = gateway.stats.issued;
    await gateway.setResourceStatus(status);
    await expect(page.getByRole('region', { name: 'Connection' }).getByRole('alert')).toContainText(code, { timeout: 25_000 });
    assert(gateway.stats.issued - issued <= (status === 401 ? 1 : 0), 'Protected resource denial caused unbounded token refresh');
    const stopped = gateway.stats.sessionRequests;
    await delay(1500);
    assert.equal(gateway.stats.sessionRequests, stopped);
    await gateway.setResourceStatus(200);
    await page.getByRole('region', { name: 'Connection' }).getByRole('button', { name: 'Retry connection' }).click();
    await expect(page.getByRole('region', { name: 'Connection' }).getByRole('status')).toHaveText('Stream: open.');
    proof.authentication[`resource${status}`] = { terminal: true, boundedRefresh: true };
  }
  phase = 'auth-logout';
  await page.getByRole('button', { name: 'End lesson session', exact: true }).click();
  await expect.poll(() => gateway.stats.acceptedStreams - gateway.stats.cancelledStreams).toBe(0);
  const stopped = gateway.stats.sessionRequests;
  await delay(1500);
  assert.equal(gateway.stats.sessionRequests, stopped);
  await page.getByRole('button', { name: 'Start new lesson session', exact: true }).click();
  await expect(north.getByRole('table')).toContainText('5.0');
  assert(gateway.stats.sessionRequests > stopped, 'New session reused a logged-out owner cache');
  await temperature(9);
  await expect(north.getByRole('table')).toContainText('9.0');
  await capture('15-authentication.png');
  proof.authentication.final = { ...gateway.stats };
  proof.checks.push('Real gateway process stopped/restarted with cached and expired tokens; live updates resumed without Retry connection; shared refresh, token-service 503 recovery, terminal session/resource 401/403 and logout cancellation');

  await freePort(18474);
  if (args.includes('--non-default-ports')) {
    const buildLog = execFileSync('npm', ['run', 'build'], { cwd: nextApp, encoding: 'utf8',
      timeout: 180_000, env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
        DRASI_REST_URL: backend.rest, DRASI_SSE_URL: backend.events } });
    await writeFile(join(output, 'next-non-default-build.log'), buildLog);
  }
  nextLog = createWriteStream(join(output, 'next.log'));
  next = spawn(process.execPath, [join(nextApp, 'node_modules/next/dist/bin/next'),
    'start', '--hostname', '127.0.0.1', '--port', '18474'], {
    cwd: nextApp, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
      DRASI_REST_URL: backend.rest, DRASI_SSE_URL: backend.events },
  });
  next.stdout.pipe(nextLog);
  next.stderr.pipe(nextLog);
  let nextError;
  next.once('error', error => { nextError = error; });
  nextExit = new Promise(accept => next.once('exit', accept));
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (nextError) throw nextError;
    assert.equal(next.exitCode, null, 'Next server exited; see .artifacts/live-guide/next.log');
    try {
      const response = await fetch('http://127.0.0.1:18474/cold-storage');
      if (response.ok) { ready = true; break; }
    } catch (error) {
      if (!(error instanceof TypeError && error.cause?.code === 'ECONNREFUSED')) throw error;
    }
    await delay(100);
  }
  assert(ready, 'Next server did not become ready');
  phase = 'next-cold-storage-page.tsx';
  await page.goto('http://127.0.0.1:18474/cold-storage');
  await expect(north.getByRole('table')).toContainText('9.0');
  await temperature(8);
  await expect(north.getByRole('table')).toContainText('8.0');
  await capture('16-next.png');
  proof.checks.push('Actual Next build/prerender/hydration and released-backend update using extensionless application imports');

  await page.goto(origin);
  await entry('capstone-main.tsx');
  await expect(northTable()).toContainText('8.0');
  const southReads = reads('south-room'), beforeRefresh = reads('north-room');
  await page.getByRole('button', { name: 'Refresh North room', exact: true }).click();
  await expect.poll(() => reads('north-room')).toBeGreaterThan(beforeRefresh);
  assert.equal(reads('south-room'), southReads);
  await page.getByRole('button', { name: 'Dark theme', exact: true }).click();
  await capture('17-capstone.png');
  const south = page.getByRole('table', { name: 'South room', exact: true });
  await probe(south, 'probe-2001').getByRole('button', { name: 'Review probe' }).focus();
  await page.keyboard.press('Enter');
  await feed('delete', 'south-probe');
  await expect(page.getByRole('dialog')).toContainText('no longer in the current view');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'South room', exact: true })).toBeFocused();
  await feed('insert', 'south-probe', { probeId: 'probe-2001', room: 'South', temperatureC: 5 });
  await expect(probe(south, 'probe-2001')).toContainText('5.0');
  proof.checks.push('Capstone scoped refresh, shared ConnectionNotice, live dialog deletion fallback and focus restoration');

  const require = createRequire(join(app, 'package.json'));
  const { DrasiClient } = require('@drasi/ui-core/adapters/drasi-server');
  const restricted = new DrasiClient({
    serverUrl: backend.rest, instanceId: 'cold-chain', queryIds: ['north-room', 'south-room'],
    reaction: { id: 'cold-chain-events', endpoint: `${backend.events}/events` },
  });
  assert.throws(() => restricted.subscribe('warm-probes', () => {}), error => error.code === 'INVALID_CONFIGURATION');
  await restricted.disconnect();
  proof.checks.push('Third-query subscription outside provider queryIds raises INVALID_CONFIGURATION');

  const printPage = await browser.newPage({ viewport: { width: 674, height: 960 } });
  await printPage.emulateMedia({ media: 'print' });
  await printPage.setContent(await renderPrintGuide(join(kit, 'docs'), set.source));
  proof.print = await printPage.evaluate(() => ({
    chapters: [...document.querySelectorAll('h3')].filter(heading => /^\d+-/.test(heading.id)).length,
    images: document.images.length,
    loadedImages: [...document.images].every(image => image.complete && image.naturalWidth > 0 && image.alt),
    clippedCode: [...document.querySelectorAll('pre')].filter(element => element.scrollWidth > element.clientWidth + 1).length,
    bodyOverflow: document.body.scrollWidth > 674,
    diagrams: document.querySelectorAll('table.diagram').length,
    brokenLinks: [...document.querySelectorAll('a[href^="#"]')].map(link => link.getAttribute('href'))
      .filter(href => !document.getElementById(decodeURIComponent(href.slice(1)))),
  }));
  assert.deepEqual(proof.print, { chapters: 17, images: 14, loadedImages: true, clippedCode: 0,
    bodyOverflow: false, diagrams: 3, brokenLinks: [] });
  await printPage.pdf({ path: join(output, 'developer-guide.pdf'), preferCSSPageSize: true, printBackground: true });
  await printPage.close();
  proof.checks.push('Actual print layout: 17 chapters, 14 embedded figures, three diagram alternatives, no horizontal code clipping');

  assert.deepEqual(proof.pageErrors, [], 'Uncaught page errors are failures, including invalid hook calls');
  assert.deepEqual(proof.consoleErrors.filter(item => /invalid hook|multiple.*react|more than one copy|useDrasiClient|rendered.*hooks/i.test(item.message)), [],
    'React identity/HMR errors must not be treated as benign warnings');
  assert.deepEqual(Object.keys(proof.figures).sort(), [...guideFigures].sort());
  if (capturing) await writeFile('tests/contracts/guide-screenshots.json', JSON.stringify({
    generator: 'scripts/test-live-guide.mjs --capture',
    browser: proof.browser, platform: process.platform, viewport: { width: 1100, height: 880 },
    bookSha256: proof.bookSha256, moduleSha256: proof.moduleSha256, server: proof.server,
    figures: Object.fromEntries(guideFigures.map(name => [name, changedFigures.has(name)
      ? { ...proof.figures[name], captureBookSha256: proof.bookSha256 }
      : { ...previousCaptures.figures[name], captureBookSha256:
        previousCaptures.figures[name].captureBookSha256 ?? previousCaptures.bookSha256 }])),
  }, null, 2) + '\n');
  proof.success = true;
  console.log(`Live guide passed ${proof.checks.length} checks; ${Object.keys(proof.figures).length} real screenshots captured.`);
} finally {
  if (frozen) backend?.child.kill('SIGCONT');
  await browser?.close();
  await vite?.close();
  await gateway?.close();
  await backend?.close();
  if (next && next.exitCode === null && next.signalCode === null) {
    next.kill('SIGTERM');
    await nextExit;
  }
  nextLog?.end();
  await writeFile(join(output, 'proof.json'), JSON.stringify(proof, null, 2) + '\n');
}
