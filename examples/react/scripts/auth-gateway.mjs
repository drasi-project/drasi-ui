// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import { lessonArguments, lessonUrls, portHelp, saveLessonPorts } from './lesson-config.mjs';

assert.equal(typeof import.meta.main, 'boolean', 'Use a supported launcher toolchain: Node 22.20.0 or 24.19.0');

/** Local lesson only: exercise real bearer-authenticated reads, not a production identity service. */
export async function serveAuthGateway({
  rest = 'http://127.0.0.1:8080', events = 'http://127.0.0.1:8081', port = 8083,
  streamIdleTimeoutMs = 5000,
  tokenLifetimeMs = 30_000,
} = {}) {
  assert(Number.isSafeInteger(port) && port >= 0 && port <= 65535, 'Invalid gateway port');
  assert(Number.isSafeInteger(tokenLifetimeMs) && tokenLifetimeMs > 0, 'Invalid token lifetime');
  for (const target of [rest, events]) {
    assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(target), 'Auth lesson targets must be explicit loopback services');
  }
  const tokens = new Map(), connections = new Map();
  const stats = { sessionRequests: 0, issued: 0, acceptedReads: 0, acceptedStreams: 0, rejected: 0, cancelledStreams: 0 };
  let sessionStatus = 200, resourceStatus = 200, closed = false;
  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const path = new URL(request.url, 'http://127.0.0.1').pathname;
    if (request.method !== 'GET') {
      response.writeHead(405, { Allow: 'GET' }).end('This lesson gateway accepts reads only.');
      return;
    }
    if (path === '/lesson-session') {
      stats.sessionRequests += 1;
      if (sessionStatus !== 200) {
        response.writeHead(sessionStatus, { 'Content-Type': 'application/json' }).end('{"error":"Session unavailable"}');
        return;
      }
      for (const [token, expires] of tokens) if (expires <= Date.now()) tokens.delete(token);
      const token = randomBytes(32).toString('base64url');
      const expiresAt = Date.now() + tokenLifetimeMs;
      tokens.set(token, expiresAt);
      stats.issued += 1;
      response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ accessToken: token, expiresAt }));
      return;
    }
    const token = request.headers.authorization?.replace(/^Bearer /, '');
    if (resourceStatus !== 200 || !token || (tokens.get(token) ?? 0) <= Date.now()) {
      stats.rejected += 1;
      response.writeHead(resourceStatus === 200 ? 401 : resourceStatus,
        { 'Content-Type': 'application/json' }).end('{"error":"Access denied"}');
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
    setAccepting(value) {
      sessionStatus = value ? 200 : 401;
      resourceStatus = value ? 200 : 401;
      tokens.clear();
      if (!value) closeStreams();
    },
    setSessionStatus(status) {
      assert([200, 401, 403, 503].includes(status), 'Unsupported lesson session status');
      sessionStatus = status;
      tokens.clear();
      closeStreams();
    },
    setResourceStatus(status) {
      assert([200, 401, 403].includes(status), 'Unsupported lesson resource status');
      resourceStatus = status;
      closeStreams();
    },
    async close() {
      if (closed) return;
      closed = true;
      for (const [response, { upstream }] of connections) { upstream.destroy(); response.end(); }
      connections.clear();
      tokens.clear();
      server.closeAllConnections();
      await new Promise((accept, reject) => server.close(error => error ? reject(error) : accept()));
    },
  };
}

if (import.meta.main) {
  const options = lessonArguments(process.argv.slice(2));
  if (options.help) console.log(`Usage: node auth-gateway.mjs ${portHelp}\n` +
    'Uses lesson-ports.json (gateway default 8083). Explicit port flags update the shared app configuration.');
  else {
    const urls = lessonUrls(options.ports);
    const gateway = await serveAuthGateway({ rest: urls.rest, events: urls.sse, port: options.ports.authPort });
    if (options.changed) saveLessonPorts(options.ports);
    console.log(`Local authentication exercise: ${gateway.url}. Backend: ${urls.rest}, stream: ${urls.sse}/events.\n` +
      'Short-lived in-memory lesson tokens; Ctrl+C stops only this gateway.');
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
      void gateway.close().catch(error => { console.error(error); process.exitCode = 1; });
    });
  }
}
