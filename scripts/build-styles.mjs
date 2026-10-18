import { copyFile, mkdir } from 'node:fs/promises';

const base = new URL('../packages/styles/', import.meta.url);
await mkdir(new URL('dist/', base), { recursive: true });
await copyFile(new URL('src/styles.css', base), new URL('dist/styles.css', base));
for (const extension of ['d.ts', 'd.cts']) {
  await copyFile(new URL('src/styles.d.ts', base), new URL(`dist/styles.${extension}`, base));
}
