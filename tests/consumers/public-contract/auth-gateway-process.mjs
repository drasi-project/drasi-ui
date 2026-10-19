// Test-only IPC controls; never included in production archives or the learning kit.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

assert(process.send, 'This fixture requires an owning test process');
const { serveAuthGateway } = await import(pathToFileURL(join(process.argv[2], 'scripts/auth-gateway.mjs')).href);
const gateway = await serveAuthGateway(JSON.parse(process.argv[3]));
const statistics = setInterval(() => process.send?.({ stats: gateway.stats }), 25);
process.send({ ready: true, url: gateway.url, stats: gateway.stats });
process.on('message', async ({ id, operation, value }) => {
  try {
    assert(['close', 'closeStreams', 'setAccepting', 'setSessionStatus', 'setResourceStatus'].includes(operation));
    await gateway[operation](value);
    process.send({ id, stats: gateway.stats });
    if (operation === 'close') {
      clearInterval(statistics);
      process.disconnect();
    }
  } catch (error) {
    process.send({ id, error: error.message });
  }
});
process.once('disconnect', () => {
  clearInterval(statistics);
  void gateway.close().catch(error => { console.error(error); process.exitCode = 1; });
});
