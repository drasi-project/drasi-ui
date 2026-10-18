// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
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
assert(args.every(arg => ['--iteration', '--capture'].includes(arg)), 'Usage: test-live-guide.mjs [--iteration] [--capture]');
const iteration = args.includes('--iteration');
const capturing = args.includes('--capture');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const output = resolve('.artifacts/live-guide');
await mkdir(join(output, 'figures'), { recursive: true });
const selection = JSON.parse(await readFile(iteration ? '.artifacts/guide-iteration.json' : '.artifacts/consumers.json', 'utf8'));
const app = iteration ? join(selection.directory, 'vite') : selection.consumers.guide.directory;
const nextApp = iteration ? join(selection.directory, 'next') : selection.consumers.guideNext.directory;
const runtime = iteration ? resolve('examples/react') : join(app, 'node_modules/@drasi/react/docs/developer-guide/runtime');
const { startBackend, pins } = await import(pathToFileURL(join(runtime, 'scripts/backend.mjs')).href);
const { serveAuthGateway } = await import(pathToFileURL(join(runtime, 'scripts/auth-gateway.mjs')).href);
const book = await readFile(iteration ? 'packages/react/docs/developer-guide/README.md'
  : join(app, 'node_modules/@drasi/react/docs/developer-guide/README.md'), 'utf8');
const { examples } = extractGuide(book);
const modules = new Map(examples.map(example => [example.name, example.code]));
const set = JSON.parse(await readFile(join(iteration ? '.artifacts/qualified-baseline' : candidateDirectory, 'release-set.json'), 'utf8'));
const proof = {
  source: set.source, iteration, artifacts: set.packages.map(({ name, sha256 }) => ({ name, sha256 })),
  bookSha256: hash(book), moduleSha256: Object.fromEntries(examples.map(item => [item.name, hash(item.code)])),
  server: { version: pins.serverVersion, source: pins.serverSource, pluginsSource: pins.pluginSource,
    platform: pins.platforms[`${process.platform}-${process.arch}`] },
  checks: [], figures: {}, browser: null, pageErrors: [], consoleErrors: [], requests: [],
};
let backend, gateway, vite, browser, next, nextExit, nextLog, frozen = false, phase = 'setup';
const cache = resolve(process.env.DRASI_BACKEND_CACHE ?? '.artifacts/released-backend');

async function freePort(port) {
  const server = createNetServer();
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', accept); });
  await new Promise((accept, reject) => server.close(error => error ? reject(error) : accept()));
}
try {
  backend = await startBackend({ directory: cache });
  gateway = await serveAuthGateway();
  await writeFile(join(app, 'src/main.tsx'), modules.get('cold-storage-main.tsx'));
  vite = await createServer({
    root: app, configFile: join(app, 'vite.config.mjs'),
    server: {
      host: '127.0.0.1', port: 18473, strictPort: true,
      // Deliberately unmonitored control, only for reproducing the silent-stream limitation.
      proxy: { '/unmonitored-events': {
        target: backend.events, rewrite: path => path.replace('/unmonitored-events', '/events'),
      } },
    },
  });
  await vite.listen();
  const origin = 'http://127.0.0.1:18473';
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
    if (capturing) {
      const directory = resolve('packages/react/docs/developer-guide/figures');
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
  await entry('cold-storage-main.tsx');
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
  backend = await startBackend({ directory: cache });
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
  proof.checks.push('Actual StrictMode app: quiet initial/resync snapshots, one crossing toast, no rerender duplicates, delete/reinsert entry');

  await entry('authenticated-main.tsx');
  await expect(north.getByRole('table')).toContainText('8.0');
  assert.equal((await fetch(`${gateway.url}/secured/api/v1/instances/cold-chain/queries/north-room/results`)).status, 401);
  assert.equal((await fetch(`${gateway.url}/secured/events`)).status, 401);
  const authenticated = { ...gateway.stats };
  await temperature(9);
  await expect(north.getByRole('table')).toContainText('9.0');
  await north.getByRole('button', { name: 'Refresh query', exact: true }).click();
  await expect.poll(() => gateway.stats.issued).toBeGreaterThan(authenticated.issued);
  gateway.closeStreams();
  await expect.poll(() => gateway.stats.acceptedStreams).toBeGreaterThan(authenticated.acceptedStreams);
  await expect(page.getByRole('region', { name: 'Connection' }).getByRole('status')).toHaveText('Stream: open.');
  gateway.setAccepting(false);
  await expect(page.getByRole('region', { name: 'Connection' }).getByRole('alert')).toContainText('UNAUTHENTICATED');
  gateway.setAccepting(true);
  await page.getByRole('region', { name: 'Connection' }).getByRole('button', { name: 'Retry connection' }).click();
  await expect(north.getByRole('table')).toContainText('9.0');
  await expect(page.getByRole('region', { name: 'Connection' }).getByRole('alert')).toHaveCount(0);
  await capture('15-authentication.png');
  proof.authentication = { ...gateway.stats };
  proof.checks.push('Real authenticated stream/reads, rejected unauthenticated access, fresh credentials, EOF recovery and repaired-session retry');

  await freePort(18474);
  nextLog = createWriteStream(join(output, 'next.log'));
  next = spawn(process.execPath, [join(nextApp, 'node_modules/next/dist/bin/next'),
    'start', '--hostname', '127.0.0.1', '--port', '18474'], {
    cwd: nextApp, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
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
  await printPage.setContent(await renderPrintGuide(iteration ? resolve('packages/react')
    : join(app, 'node_modules/@drasi/react'), set.source));
  proof.print = await printPage.evaluate(() => ({
    chapters: [...document.querySelectorAll('h3')].filter(heading => /^\d+-/.test(heading.id)).length,
    images: document.images.length,
    loadedImages: [...document.images].every(image => image.complete && image.naturalWidth > 0 && image.alt),
    clippedCode: [...document.querySelectorAll('pre')].filter(element => element.scrollWidth > element.clientWidth + 1).length,
    bodyOverflow: document.body.scrollWidth > 674,
    diagrams: document.querySelectorAll('table.diagram').length,
  }));
  assert.deepEqual(proof.print, { chapters: 17, images: 14, loadedImages: true, clippedCode: 0, bodyOverflow: false, diagrams: 3 });
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
    figures: proof.figures,
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
