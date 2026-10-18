// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { DrasiClient, sse034ResultAdapter } from '@drasi/ui-core/adapters/drasi-server';
import { startBackend } from '../scripts/backend.mjs';

const backend = await startBackend({
  directory: process.env.DRASI_BACKEND_CACHE ?? '.artifacts/released-backend',
  ports: { restPort: 18380, ssePort: 18381, feedPort: 18382 },
});
const controller = new AbortController();
const wire = [], changes = [], observations = [];
let streamTask;
try {
  const client = new DrasiClient({
    serverUrl: backend.rest, instanceId: 'cold-chain',
    queryIds: ['north-room', 'south-room', 'warm-probes'],
    reaction: { id: 'cold-chain-events', endpoint: `${backend.events}/events` },
  });
  await client.validateResources();
  await client.disconnect();
  for (const origin of [backend.rest, backend.feed]) {
    assert.equal((await fetch(`${origin}/health`)).status, 200);
  }
  const stream = await fetch(`${backend.events}/events`, { signal: controller.signal });
  assert.equal(stream.status, 200);
  assert.match(stream.headers.get('content-type'), /^text\/event-stream/);
  streamTask = (async () => {
    const decoder = new TextDecoder();
    let pending = '';
    for await (const chunk of stream.body) {
      pending += decoder.decode(chunk, { stream: true });
      const frames = pending.split(/\r?\n\r?\n/);
      pending = frames.pop();
      for (const frame of frames) {
        const text = frame.split(/\r?\n/).filter(line => line.startsWith('data:'))
          .map(line => line.slice(5).trimStart()).join('\n');
        if (!text) continue;
        const payload = JSON.parse(text);
        wire.push(payload);
        changes.push(...sse034ResultAdapter(payload, { receivedAt: Date.now() }));
      }
    }
  })().catch(error => { if (!controller.signal.aborted) throw error; });
  const read = async query => {
    const response = await fetch(`${backend.rest}/api/v1/instances/cold-chain/queries/${query}/results`);
    assert(response.ok);
    return (await response.json()).data;
  };
  async function post(body) {
    await promisify(execFile)('curl', ['--fail-with-body', '--silent', '--show-error',
      '-H', 'Content-Type: application/json', '-d', JSON.stringify(body),
      `${backend.feed}/sources/probe-feed/events`]);
  }
  async function expectRows(query, expected) {
    let rows;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      rows = await read(query);
      if (expected(rows)) { observations.push({ query, rows }); return; }
      await delay(50);
    }
    assert.fail(`Released query ${query} did not reach the expected result: ${JSON.stringify(rows)}`);
  }
  const update = temperatureC => ({
    operation: 'update', element: { type: 'node', id: 'north-probe', labels: ['Probe'],
      properties: { probeId: 'probe-1001', room: 'North', temperatureC } },
  });
  await post(update(8));
  await expectRows('warm-probes', rows => rows.some(row => row.probeId === 'probe-1001' && row.temperatureC === 8));
  await post(update(9));
  await expectRows('warm-probes', rows => rows.some(row => row.probeId === 'probe-1001' && row.temperatureC === 9));
  await post(update(4));
  await expectRows('warm-probes', rows => !rows.some(row => row.probeId === 'probe-1001'));
  await post({ operation: 'delete', id: 'south-probe', labels: ['Probe'] });
  await expectRows('south-room', rows => rows.length === 1 && rows[0].probeId === 'probe-2002');
  await post({ operation: 'insert', element: { type: 'node', id: 'south-probe', labels: ['Probe'],
    properties: { probeId: 'probe-2001', room: 'South', temperatureC: 5 } } });
  await expectRows('south-room', rows => rows.length === 2);
  await post({ operation: 'insert', element: { type: 'node', id: 'new-probe', labels: ['Probe'],
    properties: { probeId: 'probe-3001', room: 'North', temperatureC: 2 } } });
  await expectRows('north-room', rows => rows.length === 3);
  await post({ operation: 'delete', id: 'new-probe', labels: ['Probe'] });
  await expectRows('north-room', rows => rows.length === 2);
  for (let attempt = 0; attempt < 100 && changes.length < 9; attempt += 1) await delay(50);
  const warm = changes.filter(delta => delta.queryId === 'warm-probes').flatMap(delta => delta.changes);
  assert.deepEqual(warm.map(change => change.kind), ['upsert', 'update', 'delete']);
  assert(changes.some(delta => delta.queryId === 'south-room' &&
    delta.changes.some(change => change.kind === 'delete' && change.before.probeId === 'probe-2001')));
  const reactionPath = `${backend.rest}/api/v1/instances/cold-chain/reactions/lesson-membership`;
  const created = await fetch(`${backend.rest}/api/v1/instances/cold-chain/reactions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: 'lesson-membership', kind: 'sse', queries: ['north-room', 'south-room'],
      host: '127.0.0.1', port: 18383, ssePath: '/events', heartbeatIntervalMs: 1000, autoStart: true,
    }),
  });
  assert(created.ok, `Creating the owned membership exercise failed: HTTP ${created.status}`);
  try {
    let running = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const resource = await (await fetch(`${reactionPath}?view=full`)).json();
      if (resource.data?.status === 'Running') { running = true; break; }
      await delay(50);
    }
    assert(running, 'Owned membership reaction did not start');
    const missingMembership = new DrasiClient({
      serverUrl: backend.rest, instanceId: 'cold-chain', queryIds: ['north-room', 'south-room', 'warm-probes'],
      reaction: { id: 'lesson-membership', endpoint: 'http://127.0.0.1:18383/events' },
    });
    try {
      await assert.rejects(missingMembership.validateResources(), error => error.code === 'INCOMPATIBLE_RESOURCE');
    } finally { await missingMembership.disconnect(); }
  } finally {
    const removed = await fetch(reactionPath, { method: 'DELETE' });
    assert(removed.ok, 'Could not remove the owned membership exercise reaction');
  }
  await writeFile(join(backend.directory, 'contract.json'), JSON.stringify({
    driver: 'curl POSTs to the real released HTTP source; unmodified released SSE parsed by the public adapter',
    observations, wire, changes, reactionMembershipFailure: 'INCOMPATIBLE_RESOURCE',
  }, null, 2) + '\n');
  console.log('Released backend: health, resource reads, create/update/delete/restore, warm entry/update/exit and SSE adapter passed.');
} finally {
  controller.abort();
  await streamTask;
  await backend.close();
}
