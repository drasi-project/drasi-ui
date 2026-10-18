import { defineConfig } from '@playwright/test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const browsers = ['chromium', 'firefox', 'webkit'] as const;
const candidateBytes = readFileSync(resolve(process.env.DRASI_CANDIDATES ?? '.artifacts/candidates', 'release-set.json'));
const candidates = JSON.parse(candidateBytes.toString());
const consumers = JSON.parse(readFileSync('.artifacts/consumers.json', 'utf8'));
assert.deepEqual(consumers.artifacts, candidates.packages.map(({ name, sha256 }: { name: string; sha256: string }) => ({ name, sha256 })),
  'Browser consumers do not match the selected exact candidate set');
export default defineConfig({
  metadata: { candidateSetSha256: createHash('sha256').update(candidateBytes).digest('hex') },
  testDir: './tests/browser',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 2,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: '.artifacts/browser-report.json' }]],
  use: {
    viewport: { width: 1280, height: 1000 },
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    ...[18, 19].flatMap(react => browsers.map(browserName => ({
      name: `${browserName}-react${react}`,
      testIgnore: react === 19 ? 'showcase-export.spec.ts' : undefined,
      metadata: { kind: 'react', react },
      use: { browserName, baseURL: `http://127.0.0.1:${react === 18 ? 15273 : 15274}` },
    }))),
    ...browsers.map(browserName => ({
      name: `${browserName}-vue`,
      testMatch: 'framework-contract.spec.ts',
      metadata: { kind: 'vue' },
      use: { browserName, baseURL: 'http://127.0.0.1:15275' },
    })),
    {
      name: 'chromium-next',
      testMatch: 'framework-contract.spec.ts',
      metadata: { kind: 'next' },
      use: { browserName: 'chromium', baseURL: 'http://127.0.0.1:15276' },
    },
  ],
  webServer: [
    ...(['react18', 'react19', 'vue'] as const).map((kind, index) => ({
      command: `node scripts/serve-consumer.mjs ${kind}`,
      url: `http://127.0.0.1:${15273 + index}`,
      reuseExistingServer: false,
      timeout: 30_000,
    })),
    {
      command: 'node scripts/serve-next.mjs',
      url: 'http://127.0.0.1:15276',
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
