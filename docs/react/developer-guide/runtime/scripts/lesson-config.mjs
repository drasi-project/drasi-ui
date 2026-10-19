// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

export const defaultPorts = { restPort: 8080, ssePort: 8081, feedPort: 8082, authPort: 8083, vitePort: 5173 };
const flags = { 'rest-port': 'restPort', 'sse-port': 'ssePort', 'feed-port': 'feedPort',
  'auth-port': 'authPort', 'vite-port': 'vitePort' };

export function validatePorts(ports) {
  assert.deepEqual(Object.keys(ports).sort(), Object.keys(defaultPorts).sort(), 'Expected the five lesson ports');
  for (const [name, port] of Object.entries(ports)) {
    assert(Number.isInteger(port) && port >= 1024 && port <= 65535, `${name} must be an integer from 1024 to 65535`);
  }
  assert.equal(new Set(Object.values(ports)).size, 5, 'All lesson ports must be distinct');
  return ports;
}

export function readLessonPorts(directory = process.cwd()) {
  let text;
  try { text = readFileSync(resolve(directory instanceof URL ? fileURLToPath(directory) : directory, 'lesson-ports.json'), 'utf8'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { ...defaultPorts };
  }
  return validatePorts(JSON.parse(text));
}

export function lessonArguments(args, { config = false } = {}) {
  const { values, tokens } = parseArgs({
    args, strict: true, allowPositionals: false, tokens: true,
    options: { help: { type: 'boolean' }, ...(config ? { config: { type: 'string' } } : {}),
      ...Object.fromEntries(Object.keys(flags).map(name => [name, { type: 'string' }])) },
  });
  assert.equal(new Set(tokens.map(token => token.name)).size, tokens.length, 'Duplicate lesson argument');
  const ports = readLessonPorts();
  for (const [flag, name] of Object.entries(flags)) {
    if (values[flag] !== undefined) {
      assert(/^\d+$/.test(values[flag]), `Invalid --${flag}`);
      ports[name] = Number(values[flag]);
    }
  }
  validatePorts(ports);
  return { ports, config: values.config, help: values.help === true,
    changed: Object.keys(flags).some(flag => values[flag] !== undefined) };
}

export function lessonUrls(ports) {
  validatePorts(ports);
  return Object.fromEntries(Object.entries(ports).map(([name, port]) =>
    [name.replace('Port', ''), `http://127.0.0.1:${port}`]));
}

export function saveLessonPorts(ports, directory = process.cwd()) {
  const urls = lessonUrls(ports);
  writeFileSync(resolve(directory, 'lesson-ports.json'), JSON.stringify(ports, null, 2) + '\n');
  writeFileSync(resolve(directory, 'lesson-ports.sh'), Object.entries(urls)
    .map(([name, url]) => `export DRASI_${name.toUpperCase()}_URL='${url}'`).join('\n') + '\n');
  writeFileSync(resolve(directory, 'lesson-ports.ps1'), Object.entries(urls)
    .map(([name, url]) => `$env:DRASI_${name.toUpperCase()}_URL = '${url}'`).join('\n') + '\n');
}

export const portHelp = '[--rest-port 8080] [--sse-port 8081] [--feed-port 8082] [--auth-port 8083] [--vite-port 5173]';
if (import.meta.main) {
  const options = lessonArguments(process.argv.slice(2));
  if (options.help) console.log(`Usage: node lesson-config.mjs ${portHelp}\nWrites lesson-ports.json and shell URL variables in this app.`);
  else {
    saveLessonPorts(options.ports);
    console.log('Saved lesson-ports.json. Restart the backend, gateway and Vite after a port change.\n' +
      'In each curl terminal: . ./lesson-ports.sh (PowerShell: . ./lesson-ports.ps1).');
  }
}
