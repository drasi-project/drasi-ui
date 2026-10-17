// Copyright 2025 The Drasi Authors.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: [
      { find: '@drasi/ui-core/adapters/drasi-server', replacement: fileURLToPath(new URL('./packages/core/src/adapters/drasi-server/index.ts', import.meta.url)) },
      { find: /^@drasi\/ui-core$/, replacement: fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)) },
    ],
  },
  test: {
    include: ['tests/unit/**/*.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    environment: 'jsdom',
    clearMocks: true,
    restoreMocks: true,
    setupFiles: ['./tests/unit/setup.ts'],
    coverage: {
      provider: 'v8',
      // Legacy V8 synthetic branch ranges depend on coverage-file merge order.
      experimentalAstAwareRemapping: true,
      include: ['packages/core/src/**/*.ts', 'packages/react/src/**/*.{ts,tsx}'],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: {
        'packages/core/src/**': { statements: 90, lines: 90, functions: 90, branches: 85 },
        'packages/react/src/react/**': { statements: 90, lines: 90, functions: 90, branches: 85 },
        'packages/react/src/components/**': { statements: 90, lines: 90, functions: 90, branches: 85 },
        'packages/react/src/adapters/**': { statements: 90, lines: 90, functions: 90, branches: 85 },
      },
    },
  },
});
