// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { exampleRoot } from '../scripts/runtime.mjs';
import { serveExample } from '../scripts/web.mjs';
import { runLive } from './run-live.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'drasi-live-runner-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const dist = join(directory, 'dist');
  await mkdir(dist);
  await writeFile(join(dist, 'index.html'), '<!doctype html><title>Owned test web service</title>');
  const occupied = await serveExample({ dist, port: 0 });
  t.after(() => occupied.close());
  const env = {
    ...process.env,
    DRASI_WEB_PORT: new URL(occupied.url).port,
    DRASI_SERVER_URL: 'http://127.0.0.1:18080',
    DRASI_SSE_URL: 'http://127.0.0.1:18081',
    DRASI_FEED_URL: 'http://127.0.0.1:18082',
  };
  let web;
  let closed = false;
  const streamStates = [];
  const close = async () => {
    if (web && !closed) {
      closed = true;
      await web.close();
    }
  };
  t.after(close);
  const start = async options => {
    assert.deepEqual(options, { ...env, DRASI_WEB_PORT: '0' });
    web = await serveExample({ dist, port: Number(options.DRASI_WEB_PORT) });
    assert.notEqual(web.url, occupied.url);
    return {
      web: web.url, rest: options.DRASI_SERVER_URL, feed: options.DRASI_FEED_URL,
      directory, requests: [], setStreamsAvailable: value => streamStates.push(value), close,
    };
  };
  return { env, start, directory, occupied, streamStates, closed: () => closed, web: () => web };
}

test('live runner uses an ephemeral DRASI port and the normally resolved Playwright CLI', { timeout: 10_000 }, async t => {
  const f = await fixture(t);
  const calls = [];
  const launch = (executable, args, options) => {
    calls.push({ executable, args, options });
    const child = new EventEmitter();
    queueMicrotask(() => {
      void (async () => {
        assert.equal(executable, process.execPath);
        assert.equal(options.cwd, exampleRoot);
        if (calls.length === 1) {
          assert.deepEqual(args, ['--import', 'tsx', '--test', 'test/template-adapter.test.ts']);
          assert.deepEqual(JSON.parse(options.env.P7_TEMPLATE_ENDPOINTS), {
            rest: f.env.DRASI_SERVER_URL, feed: f.env.DRASI_FEED_URL,
          });
        } else {
          const cli = createRequire(new URL('../package.json', import.meta.url)).resolve('@playwright/test/cli');
          assert.deepEqual(args, [cli, 'test', '--project=chromium']);
          assert.equal(options.env.P7_WEB_URL, f.web().url);
          const endpoints = JSON.parse(options.env.P7_LIVE_ENDPOINTS);
          assert.equal(endpoints.rest, f.env.DRASI_SERVER_URL);
          assert.equal(endpoints.feed, f.env.DRASI_FEED_URL);
          assert.equal((await fetch(`${endpoints.control}/offline`, { method: 'POST' })).status, 200);
          assert.equal((await fetch(`${endpoints.control}/online`, { method: 'POST' })).status, 200);
          assert.equal((await fetch(`${endpoints.control}/offline`)).status, 404);
          const actualCli = spawnSync(executable, [cli, '--version'], {
            cwd: exampleRoot, env: options.env, encoding: 'utf8', timeout: 5000,
          });
          assert.equal(actualCli.status, 0, actualCli.stderr);
          assert.match(actualCli.stdout, /Version 1\.56\.1/);
        }
      })().then(() => child.emit('exit', 0), error => child.emit('error', error));
    });
    return child;
  };
  const listeners = ['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal));
  await runLive({ env: f.env, args: ['--project=chromium'], start: f.start, launch });
  assert.equal(calls.length, 2);
  assert.deepEqual(f.streamStates, [false, true]);
  assert.equal(f.closed(), true);
  assert.deepEqual(JSON.parse(await readFile(join(f.directory, 'browser-reads.json'), 'utf8')), []);
  assert.deepEqual(['SIGINT', 'SIGTERM'].map(signal => process.listenerCount(signal)), listeners);
  assert.equal((await fetch(f.occupied.url)).status, 200);
  await assert.rejects(fetch(f.web().url), TypeError);
});

for (const failingStep of [1, 2]) {
  test(`live runner stops after child ${failingStep} fails and releases its web service`, async t => {
    const f = await fixture(t);
    let calls = 0;
    const launch = () => {
      const child = new EventEmitter();
      const code = ++calls === failingStep ? 1 : 0;
      queueMicrotask(() => child.emit('exit', code));
      return child;
    };
    await assert.rejects(runLive({ env: f.env, args: [], start: f.start, launch }),
      failingStep === 1 ? /Documented template contract failed/ : /Real-example browser gate failed/);
    assert.equal(calls, failingStep);
    assert.equal(f.closed(), true);
    assert.equal((await fetch(f.occupied.url)).status, 200);
  });
}
