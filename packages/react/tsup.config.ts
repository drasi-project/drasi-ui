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

import { defineConfig, type Options } from 'tsup';

const shared: Options = {
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  minifyWhitespace: true,
  minifySyntax: false,
  minifyIdentifiers: false,
  treeshake: true,
  splitting: true,
  target: 'es2020',
  external: ['@drasi/ui-core', '@drasi/ui-core/adapters/drasi-server', 'react', 'react-dom', 'react/jsx-runtime', 'clsx'],
};

export default defineConfig([
{
  ...shared,
  entry: {
    index: 'src/index.ts',
    'react/index': 'src/react/index.ts',
    'components/index': 'src/components/index.ts',
    'adapters/drasi-server/index': 'src/adapters/drasi-server/index.ts',
  },
},
{
  ...shared,
  entry: { 'client/index': 'src/client/index.ts' },
},
]);
