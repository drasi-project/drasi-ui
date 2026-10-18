import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'adapters/drasi-server/index': 'src/adapters/drasi-server/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  minifyWhitespace: true,
  minifySyntax: false,
  minifyIdentifiers: false,
  clean: true,
  treeshake: true,
  splitting: true,
  target: 'es2020',
});
