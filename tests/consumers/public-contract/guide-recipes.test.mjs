// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
// Runs beside code bundled literally from the installed book, using its installed public packages.
import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { projectQueryRows } from '@drasi/ui-core';
import { createWarmTracker, withWarmAlerts } from './compiled/threshold-alerts.mjs';
import { createReadingOptions } from './compiled/reading-model.mjs';
import { openAuthenticatedStream } from './compiled/fetch-event-source.mjs';

const row = (temperatureC, probeId = 'probe-1001') => ({ probeId, room: 'North', temperatureC });
const snapshot = rows => ({ kind: 'snapshot', queryId: 'north-room', receivedAt: 0, rows });
const delta = (...changes) => ({ kind: 'delta', queryId: 'north-room', receivedAt: 1, changes });
const upsert = temperature => ({ kind: 'upsert', after: row(temperature) });
const live = { status: 'live', stale: false, error: null, errorScope: null };
async function eventually(check) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (check()) return;
    await delay(5);
  }
  assert(check(), 'Literal recipe did not reach the expected state');
}

test('initial and resync snapshots are quiet, even if React would batch state notifications', () => {
  const tracker = createWarmTracker();
  assert.deepEqual(tracker.accept(snapshot([row(9)])), []);
  tracker.state(live);
  assert.deepEqual(tracker.accept(snapshot([row(3)])), []);
  assert.equal(tracker.accept(delta(upsert(8))).length, 1);
  tracker.state({ ...live, status: 'resynchronizing', stale: true });
  assert.deepEqual(tracker.accept(delta(upsert(3), upsert(8))), []);
  assert.deepEqual(tracker.accept(snapshot([row(3)])), []);
  tracker.state(live);
  assert.equal(tracker.accept(delta(upsert(8))).length, 1);
  assert.deepEqual(tracker.accept(snapshot([row(9)])), []);
});

test('same-value changes and updates within the warm set do not duplicate notifications', () => {
  const tracker = createWarmTracker();
  tracker.accept(snapshot([row(3)]));
  tracker.state(live);
  assert.equal(tracker.accept(delta(upsert(8))).length, 1);
  assert.deepEqual(tracker.accept(delta(upsert(8), upsert(9))), []);
  assert.deepEqual(tracker.accept(delta(upsert(4))), []);
  assert.equal(tracker.accept(delta(upsert(8))).length, 1);
});

test('sparse deletes clear identity, warm reinsertions enter again, and every change in a batch is examined', () => {
  const tracker = createWarmTracker();
  tracker.accept(snapshot([row(3)]));
  tracker.state(live);
  assert.equal(tracker.accept(delta(upsert(8))).length, 1);
  assert.deepEqual(tracker.accept(delta({ kind: 'delete', before: { probeId: 'probe-1001' } })), []);
  assert.equal(tracker.accept(delta(upsert(8))).length, 1);
  assert.equal(tracker.accept(delta(upsert(4), upsert(8), upsert(4), upsert(8))).length, 2);
  assert.equal(tracker.accept(delta({
    kind: 'update', before: { probeId: 'probe-1001' }, after: row(9, 'probe-1002'),
  })).length, 1);
});

test('the decorator preserves subscription scope and suppresses callbacks from a stopped StrictMode-shaped setup', () => {
  const callbacks = [], notifications = [];
  let stops = 0, retries = 0, delivered = 0;
  const client = {
    instanceId: 'cold-chain',
    getConnectionStatus: () => ({ connected: true }),
    onConnectionStatusChange: callback => { callback({ connected: true }); return () => {}; },
    subscribe(queryId, onResult, onError, onState) {
      callbacks.push({ queryId, onResult, onError, onState });
      onState({ ...live, status: 'initial-loading' });
      onResult(snapshot([row(3)]));
      onState(live);
      return Object.assign(() => { stops += 1; }, {
        retry: () => { retries += 1; }, getState: () => live,
      });
    },
  };
  const wrapped = withWarmAlerts(client, value => notifications.push(value));
  const first = wrapped.subscribe('north-room', () => { delivered += 1; });
  first();
  const second = wrapped.subscribe('north-room', () => { delivered += 1; });
  callbacks[0].onResult(delta(upsert(8)));
  assert.equal(delivered, 2);
  callbacks[1].onResult(delta(upsert(8)));
  callbacks[1].onResult(delta(upsert(8)));
  assert.equal(notifications.length, 1);
  second.retry();
  assert.equal(retries, 1);
  assert.deepEqual(second.getState(), live);
  second();
  assert.equal(stops, 2);
});

test('developer diagnostics contain only fixed field reasons, and public errors stay sanitized', () => {
  const reasons = [];
  const options = createReadingOptions(issue => reasons.push(issue));
  const invalid = [
    [{ probeId: '', privatePayload: 'do not log this' }, 'INVALID_ROW_KEY', 'probeId: expected a nonempty string'],
    [{ ...row(3), room: 'sensitive-input' }, 'RESULT_PROCESSING_FAILED', 'room: expected North or South'],
    [{ ...row(Infinity), secret: 'private' }, 'RESULT_PROCESSING_FAILED', 'temperatureC: expected a finite number'],
  ];
  for (const [input, code, reason] of invalid) {
    const result = projectQueryRows([input], options);
    assert.equal(result.error.code, code);
    assert.equal(reasons.at(-1), reason);
    assert(!result.error.message.includes(reason));
  }
  assert.deepEqual(reasons, invalid.map(([, , reason]) => reason));
});

function mockStream(context, { type = 'text/event-stream', status = 200 } = {}) {
  let pending, request, cancelled = 0;
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    request = { url, options };
    const body = new ReadableStream({
      start(controller) {
        pending = controller;
        options.signal.addEventListener('abort', () => {
          cancelled += 1;
          controller.error(new DOMException('Closed test transport', 'AbortError'));
        }, { once: true });
      },
    });
    return new Response(body, { status, headers: { 'Content-Type': type } });
  });
  const signal = new AbortController();
  const source = openAuthenticatedStream('https://example.test/events', {
    headers: new Headers({ Authorization: 'Bearer lesson-test-token' }),
    credentials: 'omit', signal: signal.signal,
  });
  let opens = 0, errors = 0;
  const messages = [];
  source.onopen = () => { opens += 1; };
  source.onerror = () => { errors += 1; };
  source.onmessage = event => messages.push(['message', event.data]);
  source.addEventListener('query-result', event => messages.push(['query-result', event.data]));
  return {
    source, signal, messages,
    get opens() { return opens; }, get errors() { return errors; },
    get cancelled() { return cancelled; }, get request() { return request; },
    bytes: bytes => pending.enqueue(bytes),
    text: text => pending.enqueue(new TextEncoder().encode(text)),
    end: () => pending.close(),
  };
}

test('fetch SSE applies headers, credentials and cancellation; parses chunked lines and only subscribed event names', async context => {
  const fixture = mockStream(context);
  context.after(() => fixture.source.close());
  await eventually(() => fixture.opens === 1);
  assert.equal(fixture.request.options.headers.get('Authorization'), 'Bearer lesson-test-token');
  assert.equal(fixture.request.options.headers.get('Accept'), 'text/event-stream');
  assert.equal(fixture.request.options.credentials, 'omit');
  assert.equal(fixture.request.options.redirect, 'error');
  fixture.text(': comment\r');
  fixture.text('\ndata: first\r\ndata: second\r\n\r\n');
  fixture.text('event: update\ndata: ignored\n\n');
  const payload = new TextEncoder().encode('event: query-result\rdata: caf\u00e9\r\r\n');
  const split = payload.findIndex(byte => byte === 0xc3) + 1;
  fixture.bytes(payload.slice(0, split));
  fixture.bytes(payload.slice(split));
  await eventually(() => fixture.messages.length === 2);
  assert.deepEqual(fixture.messages, [['message', 'first\nsecond'], ['query-result', 'caf\u00e9']]);
  fixture.signal.abort();
  await eventually(() => fixture.cancelled === 1);
  assert.equal(fixture.errors, 0);
  assert.equal(fixture.request.options.signal.aborted, true);
});

test('normal stream EOF reports one error and never starts an independent retry loop', async context => {
  const fixture = mockStream(context);
  await eventually(() => fixture.opens === 1);
  fixture.end();
  await eventually(() => fixture.errors === 1);
  await delay(20);
  assert.equal(fixture.opens, 1);
  assert.equal(fixture.errors, 1);
});

test('a CR-only blank line at EOF dispatches the complete event before reporting closure', async context => {
  const fixture = mockStream(context);
  await eventually(() => fixture.opens === 1);
  fixture.text('data: complete\r\r');
  fixture.end();
  await eventually(() => fixture.errors === 1);
  assert.deepEqual(fixture.messages, [['message', 'complete']]);
});

for (const response of [{ status: 401 }, { type: 'application/json' }]) {
  test(`invalid SSE response ${JSON.stringify(response)} reaches the owner error path`, async context => {
    const fixture = mockStream(context, response);
    await eventually(() => fixture.errors === 1);
    assert.equal(fixture.opens, 0);
  });
}

test('one oversized event fails even when its delimiter arrives in the same chunk', async context => {
  const fixture = mockStream(context);
  await eventually(() => fixture.opens === 1);
  fixture.text(`data: ${'x'.repeat(1_048_577)}\n\n`);
  await eventually(() => fixture.errors === 1);
  assert.deepEqual(fixture.messages, []);
});

test('pre-aborted factory does not issue an HTTP request', async context => {
  const fetcher = context.mock.method(globalThis, 'fetch', () => { throw new Error('Unexpected request'); });
  const signal = AbortSignal.abort();
  const source = openAuthenticatedStream('https://example.test/events', {
    headers: new Headers(), credentials: 'omit', signal,
  });
  await delay(0);
  assert.equal(fetcher.mock.callCount(), 0);
  source.close();
});
