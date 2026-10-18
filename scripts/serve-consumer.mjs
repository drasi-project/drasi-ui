import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { json } from './packages.mjs';
import { createGuideFixture } from '../tests/consumers/public-contract/guide-server.mjs';

const kind = process.argv[2];
const ports = { react18: 15273, react19: 15274, vue: 15275, guide: 15277 };
assert(Object.hasOwn(ports, kind), 'Select a qualified static consumer');
const consumers = await json('.artifacts/consumers.json');
const app = consumers.consumers[kind].directory;
const dist = await realpath(join(app, 'dist'));
const components = kind === 'vue' || kind === 'guide' ? null : await realpath(join(app, 'components-dist'));
const guide = kind === 'guide' ? createGuideFixture() : null;
const guideDist = guide ? await realpath(join(app, 'fixture-dist')) : null;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = createServer((request, response) => {
  void handle(request, response).catch(error => {
    console.error('Consumer fixture request failed:', error);
    if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'text/plain' });
    response.end('Consumer fixture failed; see the server log.');
  });
});
async function handle(request, response) {
  if (guide && await guide.handle(request, response)) return;
  if (request.method !== 'GET') { response.writeHead(405).end(); return; }
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (url.pathname === '/favicon.ico') { response.writeHead(204).end(); return; }
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); }
  catch { response.writeHead(400).end('Invalid path'); return; }
  if (pathname.includes('\0') || pathname.includes('\\')) { response.writeHead(400).end('Invalid path'); return; }
  const fixture = pathname === '/__components' || pathname.startsWith('/__components/');
  const guideAsset = pathname.startsWith('/fixture/');
  const root = guideAsset ? guideDist : fixture ? components : dist;
  if (!root) { response.writeHead(404).end(); return; }
  const relative = guideAsset ? pathname.slice('/fixture'.length) : fixture ? pathname.slice('/__components'.length) : pathname;
  const file = resolve(root, `.${relative === '' || relative === '/' ? '/index.html' : relative}`);
  const extension = Object.keys(types).find(extension => file.endsWith(extension));
  if (!file.startsWith(`${root}${sep}`) || !extension) { response.writeHead(404).end('Asset not found'); return; }
  let bytes;
  try { bytes = await readFile(file); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    response.writeHead(404).end('Asset not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': types[extension], 'X-Content-Type-Options': 'nosniff' }).end(bytes);
}
server.listen(ports[kind], '127.0.0.1', () => console.log(`${kind} ready on http://127.0.0.1:${ports[kind]}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  guide?.close();
  server.close();
  server.closeAllConnections();
});
