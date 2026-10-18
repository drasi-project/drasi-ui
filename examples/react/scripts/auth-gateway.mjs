// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';

assert.equal(typeof import.meta.main, 'boolean', 'Use a supported launcher toolchain: Node 22.20.0 or 24.19.0');

/** Local lesson only: exercise real bearer-authenticated reads, not a production identity service. */
export async function serveAuthGateway({
  rest = 'http://127.0.0.1:8080', events = 'http://127.0.0.1:8081', port = 8083,
  streamIdleTimeoutMs = 5000,
} = {}) {
  for (const target of [rest, events]) {
    assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(target), 'Auth lesson targets must be explicit loopback services');
  }
  const tokens = new Map(), connections = new Map();
  const stats = { issued: 0, acceptedReads: 0, acceptedStreams: 0, rejected: 0, cancelledStreams: 0 };
  let accepting = true;
  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const path = new URL(request.url, 'http://127.0.0.1').pathname;
    if (request.method !== 'GET') {
      response.writeHead(405, { Allow: 'GET' }).end('This lesson gateway accepts reads only.');
      return;
    }
    if (path === '/lesson-session' && accepting) {
      for (const [token, expires] of tokens) if (expires <= Date.now()) tokens.delete(token);
      const token = randomBytes(32).toString('base64url');
      tokens.set(token, Date.now() + 30_000);
      stats.issued += 1;
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ accessToken: token }));
      return;
    }
    const token = request.headers.authorization?.replace(/^Bearer /, '');
    if (!accepting || !token || (tokens.get(token) ?? 0) <= Date.now()) {
      stats.rejected += 1;
      response.writeHead(401, { 'Content-Type': 'application/json' }).end('{"error":"UNAUTHENTICATED"}');
      return;
    }
    const stream = path === '/secured/events';
    if (!stream && !/^\/secured\/api\/v1\/instances\/cold-chain\/(?:queries\/(?:north-room|south-room|warm-probes)(?:\/results)?|reactions\/cold-chain-events)$/.test(path)) {
      response.writeHead(404).end('Unknown lesson route.');
      return;
    }
    const target = new URL(request.url.slice('/secured'.length), stream ? events : rest);
    stats[stream ? 'acceptedStreams' : 'acceptedReads'] += 1;
    const upstream = httpRequest(target, { headers: { Accept: stream ? 'text/event-stream' : 'application/json' } }, incoming => {
      response.writeHead(incoming.statusCode ?? 502, {
        'Content-Type': incoming.headers['content-type'] ?? 'application/json',
        'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no',
      });
      response.flushHeaders();
      incoming.on('aborted', () => response.destroy());
      incoming.on('error', () => response.destroy());
      if (stream) incoming.setTimeout(streamIdleTimeoutMs, () => {
        console.warn('Authenticated lesson stream missed its one-second heartbeat.');
        incoming.destroy();
        response.destroy();
      });
      incoming.pipe(response);
    });
    connections.set(response, { upstream, stream });
    response.once('close', () => {
      if (stream) stats.cancelledStreams += 1;
      upstream.destroy();
      connections.delete(response);
    });
    upstream.once('error', error => {
      if (response.destroyed) return;
      console.warn('Authenticated lesson upstream unavailable:', error.code ?? error.name);
      if (!response.headersSent) response.writeHead(502);
      response.end('Lesson backend unavailable.');
    });
    upstream.end();
  });
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { server.off('error', reject); accept(); });
  });
  const address = server.address();
  assert(address && typeof address !== 'string');
  const closeStreams = () => {
    for (const [response, { upstream, stream }] of connections) {
      if (stream) { upstream.destroy(); response.end(); }
    }
  };
  return {
    url: `http://127.0.0.1:${address.port}`, stats, closeStreams,
    setAccepting(value) { accepting = value; tokens.clear(); if (!value) closeStreams(); },
    async close() {
      for (const [response, { upstream }] of connections) { upstream.destroy(); response.end(); }
      connections.clear();
      tokens.clear();
      server.closeAllConnections();
      await new Promise((accept, reject) => server.close(error => error ? reject(error) : accept()));
    },
  };
}

if (import.meta.main && process.argv.includes('--help')) {
  assert.deepEqual(process.argv.slice(2), ['--help'], 'Usage: node auth-gateway.mjs [--help]');
  console.log('Usage: node auth-gateway.mjs\nStarts the local authentication lesson on 8083; requires the backend on 8080/8081.');
} else if (import.meta.main) {
  assert.equal(process.argv.length, 2, 'Usage: node auth-gateway.mjs [--help]');
  const gateway = await serveAuthGateway();
  console.log(`Local authentication exercise: ${gateway.url}. Real Drasi backend required on 8080/8081.\n` +
    'The gateway issues short-lived in-memory lesson tokens. Ctrl+C stops only this gateway.');
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    void gateway.close().catch(error => { console.error(error); process.exitCode = 1; });
  });
}
