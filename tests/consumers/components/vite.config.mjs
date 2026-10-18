// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/__components/',
  publicDir: false,
  resolve: { dedupe: ['react', 'react-dom'] },
  esbuild: { jsx: 'automatic' },
  define: { 'process.env.NODE_ENV': JSON.stringify('development') },
  css: { postcss: { plugins: [] } },
  build: {
    outDir: fileURLToPath(new URL('../components-dist/', import.meta.url)),
    emptyOutDir: true,
    minify: false,
  },
});
