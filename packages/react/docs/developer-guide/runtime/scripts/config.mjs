// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import assert from 'node:assert/strict';

export function verifyRuntimeVersion(output, expected) {
  const lines = output.trim().split(/\r?\n/);
  assert.equal(lines[0], `drasi-server ${expected.server}`,
    'Native binary does not match the pinned server version; download the documented release');
  assert.deepEqual(lines.filter(line => line.startsWith('plugin-sdk:')), [`plugin-sdk: ${expected.sdk}`],
    'Native binary does not match the pinned host SDK version; download the documented release');
}

export function renderServerConfig(template, { restPort, feedPort, ssePort }) {
  for (const [name, port] of Object.entries({
    8080: restPort, 8082: feedPort, 8081: ssePort,
  })) {
    assert(Number.isInteger(port) && port >= 1024 && port <= 65535, `Invalid allocated ${name}`);
    const token = `port: ${name}\n`;
    assert.equal(template.split(token).length, 2, `Expected exactly one ${name} template field`);
    // Full-view REST config preserves plugin expressions; install concrete numeric ports.
    template = template.replace(token, `port: ${port}\n`);
  }
  assert(!template.includes('${'), 'Unexpected unresolved example configuration field');
  return template;
}
