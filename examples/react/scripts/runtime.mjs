// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { DrasiClient } from '@drasi/ui-core/adapters/drasi-server';
import { serveExample } from './web.mjs';
import { startBackend } from './backend.mjs';

export const exampleRoot = fileURLToPath(new URL('../', import.meta.url));

async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
  if (!response.ok) throw new Error(`Example readiness request failed (${response.status})`);
  return response.json();
}

export async function waitForQueries(rest, directory, checkServer, expectedRows = { 'north-room': 1, 'south-room': 1 }) {
  const snapshots = {};
  const deadline = Date.now() + 60_000;
  let ready = false;
  while (Date.now() < deadline) {
    checkServer?.();
    try {
      let allRunning = true;
      for (const query of Object.keys(expectedRows)) {
        const body = await get(`${rest}/api/v1/instances/cold-chain/queries/${query}?view=full`);
        assert(body?.success === true && body.data !== null &&
          typeof body.data === 'object' && !Array.isArray(body.data),
        `Invalid full-view response for ${query}; see ${directory}/server.log`);
        if (['Added', 'Starting', 'Reconfiguring'].includes(body.data.status)) {
          allRunning = false;
          continue;
        }
        assert.equal(body.data.status, 'Running', `Query ${query} is not running; see ${directory}/server.log`);
      }
      if (allRunning) {
        for (const query of Object.keys(expectedRows)) {
          const body = await get(`${rest}/api/v1/instances/cold-chain/queries/${query}/results`);
          assert(body?.success === true && Array.isArray(body.data),
            `Invalid results response for ${query}; see ${directory}/server.log`);
          snapshots[query] = body;
        }
        ready = Object.entries(snapshots).every(([query, body]) => body.data.length === expectedRows[query]);
        if (ready) break;
      }
    } catch (error) {
      const unavailable = error instanceof TypeError && ['ECONNREFUSED', 'ECONNRESET', 'UND_ERR_SOCKET'].includes(error.cause?.code);
      if (!unavailable && !(error instanceof DOMException && error.name === 'TimeoutError')) throw error;
    }
    await delay(100);
  }
  assert(ready, `Pre-created queries did not become ready in 60 seconds; see ${directory}/server.log`);
  return snapshots;
}

/** Own a pinned local backend, or attach only to explicitly supplied local services. */
export async function startExample(env = process.env) {
  const supplied = ['DRASI_SERVER_URL', 'DRASI_SSE_URL', 'DRASI_FEED_URL'].some(key => env[key]);
  let backend;
  let rest = env.DRASI_SERVER_URL, events = env.DRASI_SSE_URL, feed = env.DRASI_FEED_URL;
  if (supplied) for (const [name, value] of Object.entries({ DRASI_SERVER_URL: rest, DRASI_SSE_URL: events, DRASI_FEED_URL: feed })) {
    assert(typeof value === 'string' && /^http:\/\/127\.0\.0\.1:\d+$/.test(value),
      `${name} must explicitly identify a prepared loopback service; see examples/react/README.md`);
  }
  const port = Number(env.DRASI_WEB_PORT ?? 5373);
  assert(Number.isInteger(port) && (port === 0 || (port >= 1024 && port <= 65535)), 'Invalid DRASI_WEB_PORT');
  await access(join(exampleRoot, 'dist/index.html'));
  await mkdir(join(exampleRoot, '.runtime'), { recursive: true });
  const directory = await mkdtemp(join(exampleRoot, '.runtime/live-'));
  await writeFile(join(directory, 'server.log'), 'Backend diagnostics are recorded by its launcher, or by the explicit external service owner.\n');
  let web;
  let stopped = false;
  async function close() {
    if (stopped) return;
    if (web) await web.close();
    await backend?.close();
    stopped = true;
    await writeFile(join(directory, 'cleanup.json'), JSON.stringify({
      owner: 'drasi-react-cold-storage', stopped: true, externalBackend: supplied,
      serviceUrls: { rest, feed, events, web: web?.url },
    }, null, 2) + '\n');
  }
  try {
    if (!supplied) {
      backend = await startBackend({ directory: env.DRASI_BACKEND_CACHE ?? join(exampleRoot, '.runtime/backend') });
      ({ rest, events, feed } = backend);
    }
    const provenancePath = backend?.provenance ?? env.DRASI_RUNTIME_PROVENANCE;
    const runtimeProvenance = provenancePath ? JSON.parse(await readFile(provenancePath, 'utf8')) : null;
    const validator = new DrasiClient({
      serverUrl: rest, instanceId: 'cold-chain', queryIds: ['north-room', 'south-room', 'warm-probes'],
      reaction: { id: 'cold-chain-events', endpoint: `${events}/events` },
    });
    try { await validator.validateResources(); } finally { await validator.disconnect(); }
    const snapshots = await waitForQueries(rest, directory, undefined,
      { 'north-room': 2, 'south-room': 2, 'warm-probes': 1 });
    await writeFile(join(directory, 'provenance.json'), JSON.stringify({
      kind: supplied ? 'external-runtime' : 'verified-released-runtime', node: process.version, instanceId: 'cold-chain',
      runtimeProvenance, verification: supplied ? 'Read-only DTO/readiness checks of explicitly supplied services'
        : 'Pinned release digest, signed plugin installation, loaded plugin hashes and live readiness',
      snapshots,
    }, null, 2) + '\n');
    web = await serveExample({ dist: join(exampleRoot, 'dist'), rest, events, port });
    await writeFile(join(directory, 'ready.json'), JSON.stringify({ web: web.url, rest, feed, events }, null, 2) + '\n');
    console.log(`Live example: ${web.url}\nFeed: ${feed}\nOwned diagnostics: ${directory}`);
    return {
      web: web.url, rest, feed, events, directory, close, requests: web.requests,
      setStreamsAvailable: web.setStreamsAvailable,
    };
  } catch (error) {
    await writeFile(join(directory, 'server.log'), `${error instanceof Error ? error.stack : String(error)}\n`);
    await close();
    throw error;
  }
}
