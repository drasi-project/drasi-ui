// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
// Copied beside literal installed-book modules in a source-free consumer.
import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { DrasiError, observeQuery, projectQueryRows, readAdaptedResults } from '@drasi/ui-core';
import { applicationEvents, createApplicationClient } from './compiled/application-client.mjs';
import { probeKey, readingOptions } from './compiled/reading-model.mjs';

const initial = {
  'north-room': [
    { probeId: 'probe-1001', room: 'North', temperatureC: 3 },
    { probeId: 'probe-1002', room: 'North', temperatureC: 6 },
  ],
  'south-room': [
    { probeId: 'probe-2001', room: 'South', temperatureC: 5 },
    { probeId: 'probe-2002', room: 'South', temperatureC: 9 },
  ],
};

async function eventually(check) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (check()) return;
    await delay(5);
  }
  assert(check(), 'Documented client did not reach the expected state');
}

function fixture() {
  const streams = [], reads = new Map(), snapshots = structuredClone(initial);
  let failure = null, hold = false, cancelled = 0;
  const owner = createApplicationClient('https://app.example', {
    eventSourceFactory(url, options) {
      assert.equal(url, 'https://app.example/cold-storage/events');
      assert.equal(options.credentials, 'same-origin');
      const source = {
        onopen: null, onerror: null, onmessage: null, closed: false,
        addEventListener() {},
        close() { this.closed = true; },
        emit(payload) { this.onmessage?.(new MessageEvent('message', { data: JSON.stringify(payload) })); },
      };
      streams.push(source);
      queueMicrotask(() => source.onopen?.(new Event('open')));
      return source;
    },
    async fetch(input, options) {
      const queryId = new URL(input).pathname.split('/').at(-1);
      reads.set(queryId, (reads.get(queryId) ?? 0) + 1);
      assert.equal(options.method, 'GET');
      assert.equal(options.credentials, 'same-origin');
      assert.equal(options.redirect, 'error');
      if (hold) await new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => {
          cancelled += 1;
          reject(options.signal.reason);
        }, { once: true });
      });
      if (failure === 'json') return new Response('{', { status: 200 });
      if (failure) return new Response('{}', { status: failure });
      return Response.json({ rows: snapshots[queryId] });
    },
  });
  return {
    owner, streams, reads, snapshots,
    fail: value => { failure = value; },
    hold: () => { hold = true; },
    get cancelled() { return cancelled; },
  };
}

test('the literal gateway adapter validates routing, heartbeat, and sparse-delete shapes', () => {
  const context = { receivedAt: 1 };
  assert.deepEqual(applicationEvents({ type: 'heartbeat', ts: 0 }, context), []);
  const delta = applicationEvents({
    queryId: 'north-room', op: 'delete', before: { probeId: 'probe-1001' },
  }, context);
  assert.deepEqual(readAdaptedResults(delta, context)[0].changes, [
    { kind: 'delete', before: { probeId: 'probe-1001' } },
  ]);
  for (const payload of [
    null, { type: 'heartbeat', ts: 'wrong' },
    { query_id: 'north-room', op: 'upsert', after: {} },
    { queryId: 'forbidden', op: 'delete', before: {} },
    { queryId: 'north-room', op: 'update', after: {} },
  ]) assert.throws(() => applicationEvents(payload, context), DrasiError);
});

test('the literal app client shares a stream, projects changes, refreshes locally, and disposes', async context => {
  const setup = fixture(), { owner } = setup;
  context.after(() => owner.dispose());
  await owner.connect();
  let north, south;
  const first = observeQuery(owner.client, 'north-room', probeKey, state => { north = state; });
  const second = observeQuery(owner.client, 'south-room', probeKey, state => { south = state; });
  await eventually(() => north?.state.status === 'live' && south?.state.status === 'live');
  assert.equal(setup.streams.length, 1);
  assert.deepEqual(projectQueryRows(north.rows, readingOptions).data, [
    { key: 'probe:probe-1001', room: 'North', celsius: 3 },
    { key: 'probe:probe-1002', room: 'North', celsius: 6 },
  ]);
  setup.streams[0].emit({
    queryId: 'north-room', op: 'update', before: { probeId: 'probe-1001' },
    after: { probeId: 'probe-1001', room: 'North', temperatureC: 8 },
  });
  assert.equal(projectQueryRows(north.rows, readingOptions).data[0].celsius, 8);
  setup.streams[0].emit({ queryId: 'north-room', op: 'delete', before: { probeId: 'probe-1001' } });
  assert.deepEqual(north.rows, [initial['north-room'][1]]);
  first.retry();
  await eventually(() => setup.reads.get('north-room') === 2 && north.state.status === 'live');
  assert.equal(setup.reads.get('south-room'), 1);
  assert.equal(setup.streams.length, 1);
  first.stop();
  second.stop();
  const retained = north;
  await owner.dispose();
  assert(setup.streams.every(stream => stream.closed));
  setup.streams[0].emit({ queryId: 'north-room', op: 'upsert', after: initial['north-room'][0] });
  assert.equal(north, retained, 'Late data reached a stopped observer');
});

test('the literal snapshot reader preserves permanent failure and query retry scope', async context => {
  const setup = fixture(), { owner } = setup;
  context.after(() => owner.dispose());
  await owner.connect();
  setup.fail('json');
  let state;
  const subscription = owner.client.subscribe('north-room', () => {}, () => {}, value => { state = value; });
  await eventually(() => state?.status === 'terminal-error');
  assert.equal(state.error.code, 'INVALID_PAYLOAD');
  assert.equal(state.errorScope, 'query');
  assert.equal(state.error.status, 200);
  setup.fail(401);
  subscription.retry();
  await eventually(() => state.error?.code === 'UNAUTHENTICATED');
  assert.equal(state.error.status, 401);
  setup.fail(null);
  subscription.retry();
  await eventually(() => state.status === 'live');
  assert.equal(setup.streams.length, 1);
});

test('the literal owner cancels in-flight snapshots on disposal', async () => {
  const setup = fixture(), { owner } = setup;
  await owner.connect();
  setup.hold();
  const results = [];
  owner.client.subscribe('north-room', value => results.push(value), () => {});
  await eventually(() => setup.reads.get('north-room') === 1);
  await owner.dispose();
  await eventually(() => setup.cancelled === 1);
  assert.deepEqual(results, []);
  assert(setup.streams.every(stream => stream.closed));
});
