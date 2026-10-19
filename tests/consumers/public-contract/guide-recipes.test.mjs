// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
// Runs beside code bundled literally from the installed book, using its installed public packages.
import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { projectQueryRows } from '@drasi/ui-core';
import { createWarmTracker, withWarmAlerts } from './compiled/threshold-alerts.mjs';
import { createReadingOptions } from './compiled/reading-model.mjs';
import { createFetchEventSource, openAuthenticatedStream } from './compiled/fetch-event-source.mjs';
import { createSessionAuth } from './compiled/session-auth.mjs';

const row = (temperatureC, probeId = 'probe-1001') => ({ probeId, room: 'North', temperatureC });
const snapshot = rows => ({ kind: 'snapshot', queryId: 'warm-probes', receivedAt: 0, rows });
const delta = (...changes) => ({ kind: 'delta', queryId: 'warm-probes', receivedAt: 1, changes });
const upsert = temperature => ({ kind: 'upsert', after: row(temperature) });
const leave = { kind: 'delete', before: { probeId: 'probe-1001' } };
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
  assert.deepEqual(tracker.accept(snapshot([])), []);
  assert.equal(tracker.accept(delta(upsert(8))).length, 1);
  tracker.state({ ...live, status: 'resynchronizing', stale: true });
  assert.deepEqual(tracker.accept(delta(leave, upsert(8))), []);
  assert.deepEqual(tracker.accept(snapshot([])), []);
  tracker.state(live);
  assert.equal(tracker.accept(delta(upsert(8))).length, 1);
  assert.deepEqual(tracker.accept(snapshot([row(9)])), []);
});

test('same-value changes and updates within the warm set do not duplicate notifications', () => {
  const tracker = createWarmTracker();
  tracker.accept(snapshot([]));
  tracker.state(live);
  assert.equal(tracker.accept(delta(upsert(8))).length, 1);
  assert.deepEqual(tracker.accept(delta(upsert(8), upsert(9))), []);
  assert.deepEqual(tracker.accept(delta(leave)), []);
  assert.equal(tracker.accept(delta(upsert(8))).length, 1);
});

test('sparse deletes clear identity, warm reinsertions enter again, and every change in a batch is examined', () => {
  const tracker = createWarmTracker();
  tracker.accept(snapshot([]));
  tracker.state(live);
  assert.equal(tracker.accept(delta(upsert(8))).length, 1);
  assert.deepEqual(tracker.accept(delta({ kind: 'delete', before: { probeId: 'probe-1001' } })), []);
  assert.equal(tracker.accept(delta(upsert(8))).length, 1);
  assert.equal(tracker.accept(delta(leave, upsert(8), leave, upsert(8))).length, 2);
  assert.equal(tracker.accept(delta({
    kind: 'update', before: { probeId: 'probe-1001' }, after: row(9, 'probe-1002'),
  })).length, 1);
});

test('membership covers both rooms and follows the query rather than a duplicate temperature rule', () => {
  const tracker = createWarmTracker();
  tracker.accept(snapshot([{ ...row(9, 'probe-2002'), room: 'South' }]));
  tracker.state(live);
  assert.equal(tracker.accept(delta(upsert(8)))[0].room, 'North');
  const south = { ...row(8, 'probe-2001'), room: 'South' };
  assert.equal(tracker.accept(delta({ kind: 'upsert', after: south }))[0].room, 'South');
  assert.deepEqual(tracker.accept(delta({ kind: 'upsert', after: { ...south, temperatureC: 9 } })), []);
  assert.deepEqual(tracker.accept(delta({ kind: 'delete', before: { probeId: south.probeId } })), []);
  assert.equal(tracker.accept(delta({ kind: 'upsert', after: south })).length, 1);
  assert.equal(tracker.accept(delta({ kind: 'upsert', after: row(2, 'new-query-member') })).length, 1);
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
      onState?.({ ...live, status: 'initial-loading' });
      onResult(snapshot([]));
      onState?.(live);
      return Object.assign(() => { stops += 1; }, {
        retry: () => { retries += 1; }, getState: () => live,
      });
    },
  };
  const wrapped = withWarmAlerts(client, value => notifications.push(value));
  const first = wrapped.subscribe('warm-probes', () => { delivered += 1; });
  first();
  const second = wrapped.subscribe('warm-probes', () => { delivered += 1; });
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
  second.retry();
  callbacks[1].onResult(delta(leave, upsert(8)));
  assert.equal(retries, 1);
  assert.equal(notifications.length, 1);
  const north = wrapped.subscribe('north-room', () => {});
  callbacks[2].onResult(delta(upsert(8)));
  assert.equal(notifications.length, 1, 'Only the single Warm subscription owns notifications');
  north();
});

function authFixture() {
  const owner = new AbortController();
  let issued = 0, calls = 0, reads = 0, cancelled = 0;
  let sessionStatus = 200, resourceStatus = 200, available = true, validToken = '', held = false;
  const releases = [];
  const fetcher = async (input, init) => {
    const request = new Request(input, init);
    request.signal.throwIfAborted();
    if (request.url === 'https://lesson.test/lesson-session') {
      calls += 1;
      if (held) await new Promise((accept, reject) => {
        const abort = () => { cancelled += 1; reject(request.signal.reason); };
        request.signal.addEventListener('abort', abort, { once: true });
        releases.push(() => { request.signal.removeEventListener('abort', abort); accept(); });
      });
      request.signal.throwIfAborted();
      if (!available) throw new TypeError('Synthetic transport failure');
      if (sessionStatus !== 200) return new Response('{}', { status: sessionStatus });
      validToken = `synthetic-${++issued}`;
      return Response.json({ accessToken: validToken, expiresAt: Date.now() + 30_000 });
    }
    reads += 1;
    const accepted = request.headers.get('Authorization') === `Bearer ${validToken}`;
    return new Response('{}', { status: resourceStatus !== 200 ? resourceStatus : accepted ? 200 : 401 });
  };
  const auth = createSessionAuth('https://lesson.test/lesson-session', 'https://lesson.test/secured', owner.signal, fetcher);
  return {
    auth, owner, releases,
    get calls() { return calls; }, get issued() { return issued; },
    get reads() { return reads; }, get cancelled() { return cancelled; },
    hold() { held = true; }, resume() { held = false; releases.splice(0).forEach(release => release()); },
    restart() { validToken = ''; },
    session(status) { sessionStatus = status; }, resource(status) { resourceStatus = status; },
    network(value) { available = value; },
    read: (signal = new AbortController().signal) => auth.fetch('https://lesson.test/secured/results', { signal }),
  };
}

test('session cache shares concurrent refresh and refreshes early rather than per resource', async () => {
  const fixture = authFixture();
  fixture.hold();
  const calls = Array.from({ length: 17 }, () => fixture.read());
  await eventually(() => fixture.calls === 1);
  fixture.resume();
  assert((await Promise.all(calls)).every(response => response.ok));
  assert.equal(fixture.issued, 1);
  await fixture.read();
  assert.equal(fixture.calls, 1);
  fixture.owner.abort();
});

test('expiry and its five-second early-refresh margin share one new token', async context => {
  let clock = Date.now();
  context.mock.method(Date, 'now', () => clock);
  const fixture = authFixture();
  await fixture.read();
  clock += 24_999;
  await fixture.read();
  assert.equal(fixture.issued, 1);
  clock += 2;
  await Promise.all([fixture.read(), fixture.read()]);
  assert.equal(fixture.issued, 2);
  clock += 30_001;
  await fixture.read();
  assert.equal(fixture.issued, 3);
  fixture.owner.abort();
});

test('one cancelled waiter cannot cancel shared refresh; the last cancelled waiter can', async () => {
  const fixture = authFixture();
  fixture.hold();
  const first = new AbortController(), second = new AbortController();
  const a = fixture.auth.getAccessToken(first.signal), b = fixture.auth.getAccessToken(second.signal);
  first.abort();
  await assert.rejects(a, { name: 'AbortError' });
  assert.equal(fixture.cancelled, 0);
  fixture.resume();
  assert.equal(await b, 'synthetic-1');
  fixture.auth.invalidate();
  fixture.hold();
  const last = new AbortController();
  const c = fixture.auth.getAccessToken(last.signal);
  last.abort();
  await assert.rejects(c, { name: 'AbortError' });
  await eventually(() => fixture.cancelled === 1);
  fixture.resume();
  await fixture.read();
  assert.equal(fixture.issued, 2);
  fixture.owner.abort();
});

test('stopped scopes, logout and pre-aborted calls cannot retain or issue credentials', async () => {
  const fixture = authFixture();
  await assert.rejects(fixture.auth.getAccessToken(AbortSignal.abort()), { name: 'AbortError' });
  assert.equal(fixture.calls, 0);
  fixture.hold();
  const pending = fixture.read();
  fixture.owner.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  fixture.resume();
  await assert.rejects(fixture.read(), { name: 'AbortError' });
  assert.equal(fixture.issued, 0);
  const newScope = authFixture();
  assert.equal((await newScope.read()).status, 200);
  newScope.auth.invalidate();
  await newScope.read();
  assert.equal(newScope.issued, 2);
  newScope.owner.abort();
});

test('a gateway losing still-valid cached tokens causes one shared refresh, not permanent 401', async () => {
  const fixture = authFixture();
  await fixture.read();
  fixture.restart();
  assert((await Promise.all(Array.from({ length: 17 }, () => fixture.read()))).every(response => response.ok));
  assert.equal(fixture.issued, 2);
  assert.equal(fixture.calls, 2, 'Late old-token 401s must not discard the replacement');
  fixture.owner.abort();
});

for (const [status, code] of [[401, 'UNAUTHENTICATED'], [403, 'FORBIDDEN'],
  [503, 'SERVER_UNAVAILABLE'], [408, 'SERVER_UNAVAILABLE'], [429, 'SERVER_UNAVAILABLE'],
  [404, 'INCOMPATIBLE_RESOURCE']]) {
  test(`token endpoint ${status} is ${code}, never a protected-resource refresh loop`, async () => {
    const fixture = authFixture();
    fixture.session(status);
    await assert.rejects(fixture.read(), error => error.code === code && error.status === status);
    assert.equal(fixture.calls, 1);
    assert.equal(fixture.reads, 0);
    fixture.session(200);
    assert.equal((await fixture.read()).status, 200);
    fixture.owner.abort();
  });
}

test('token service network outage is retryable and a later core-owned attempt recovers', async () => {
  const fixture = authFixture();
  fixture.network(false);
  await assert.rejects(fixture.read(), error => error.code === 'SERVER_UNAVAILABLE');
  fixture.network(true);
  assert.equal((await fixture.read()).status, 200);
  fixture.owner.abort();
});

for (const status of [401, 403]) {
  test(`genuine protected ${status} stays denied with bounded request/refresh counts`, async () => {
    const fixture = authFixture();
    fixture.resource(status);
    assert.equal((await fixture.read()).status, status);
    assert.equal(fixture.calls, status === 401 ? 2 : 1);
    assert.equal(fixture.reads, status === 401 ? 2 : 1);
    fixture.owner.abort();
  });
}

test('stream-only authorization denial is surfaced to core REST revalidation as terminal', async () => {
  const fixture = authFixture();
  fixture.resource(403);
  assert.equal((await fixture.auth.fetch('https://lesson.test/secured/events',
    { headers: { Accept: 'text/event-stream' } })).status, 403);
  await assert.rejects(fixture.read(), error => error.code === 'FORBIDDEN');
  assert.equal(fixture.calls, 1);
  assert.equal(fixture.reads, 1);
  fixture.owner.abort();
});

test('session adapter refuses off-scope URLs and writes before acquiring a token', async () => {
  const fixture = authFixture();
  for (const [url, options] of [
    ['https://another.test/secured/results', {}], ['https://lesson.test/secured-other/results', {}],
    ['https://lesson.test/secured/results', { method: 'POST' }],
  ]) await assert.rejects(fixture.auth.fetch(url, options), error => error.code === 'INVALID_CONFIGURATION');
  assert.equal(fixture.calls, 0);
  fixture.owner.abort();
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
  const source = createFetchEventSource()('https://example.test/events', {
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
