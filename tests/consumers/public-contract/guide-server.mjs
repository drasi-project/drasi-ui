// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const initial = {
  'north-room': [{ probeId: 'probe-1001', room: 'North', temperatureC: 3 }],
  'south-room': [{ probeId: 'probe-2001', room: 'South', temperatureC: 5 }],
};
const queryIds = Object.keys(initial);

/** Test-only, cookie-isolated gateway; not a Drasi runtime or protocol claim. */
export function createGuideFixture() {
  const sessions = new Map();
  function session(request, response) {
    let id = /(?:^|; )drasi-guide-test=([a-f0-9-]+)/.exec(request.headers.cookie ?? '')?.[1];
    if (!id || !sessions.has(id)) {
      id = randomUUID();
      sessions.set(id, { rows: structuredClone(initial), streams: new Set(), opens: 0, reads: {}, failures: {} });
      response.setHeader('Set-Cookie', `drasi-guide-test=${id}; Path=/; HttpOnly; SameSite=Strict`);
    }
    return sessions.get(id);
  }
  const json = (response, value, status = 200) =>
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
      .end(JSON.stringify(value));
  function emit(state, payload) {
    for (const stream of state.streams) stream.write(`data: ${JSON.stringify(payload)}\n\n`);
  }
  return {
    async handle(request, response) {
      const state = session(request, response);
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (url.pathname === '/cold-storage/events' && request.method === 'GET') {
        response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' });
        response.write(': deterministic test gateway\n\n');
        state.opens += 1;
        state.streams.add(response);
        response.on('close', () => state.streams.delete(response));
        return true;
      }
      if (url.pathname.startsWith('/cold-storage/queries/') && request.method === 'GET') {
        const queryId = url.pathname.slice('/cold-storage/queries/'.length);
        if (!queryIds.includes(queryId)) { json(response, { error: 'Unknown fixture query' }, 404); return true; }
        state.reads[queryId] = (state.reads[queryId] ?? 0) + 1;
        const failure = state.failures[queryId];
        json(response, failure ? { error: 'Intentional fixture read failure' } : { rows: state.rows[queryId] }, failure ?? 200);
        return true;
      }
      if (url.pathname === '/__guide/stats' && request.method === 'GET') {
        json(response, { opens: state.opens, streams: state.streams.size, reads: state.reads });
        return true;
      }
      if (url.pathname === '/__guide/action' && request.method === 'POST') {
        let body = '';
        for await (const chunk of request) {
          body += chunk;
          assert(body.length < 4096, 'Fixture request too large');
        }
        const { action, queryId = 'north-room' } = JSON.parse(body);
        assert(queryIds.includes(queryId), 'Unknown fixture query');
        if (action === 'warm') {
          const before = state.rows[queryId][0] ?? initial[queryId][0];
          const after = { ...before, temperatureC: 8 };
          state.rows[queryId] = [after];
          emit(state, { queryId, op: 'update', before, after });
        } else if (action === 'delete') {
          const before = { probeId: initial[queryId][0].probeId };
          state.rows[queryId] = [];
          emit(state, { queryId, op: 'delete', before });
        } else if (action === 'restore') {
          state.rows[queryId] = structuredClone(initial[queryId]);
          emit(state, { queryId, op: 'upsert', after: state.rows[queryId][0] });
        } else if (action === 'fail-query') state.failures[queryId] = 401;
        else if (action === 'repair-query') delete state.failures[queryId];
        else if (action === 'fail-stream') emit(state, { invalid: 'intentional unscoped protocol failure' });
        else { json(response, { error: 'Unknown fixture action' }, 400); return true; }
        json(response, { applied: action });
        return true;
      }
      return false;
    },
    close() {
      for (const state of sessions.values()) for (const stream of state.streams) stream.end();
      sessions.clear();
    },
  };
}
