import { copyFile } from 'node:fs/promises';

await copyFile(
  new URL('../packages/styles/dist/styles.css', import.meta.url),
  new URL('../packages/react/styles.css', import.meta.url),
);
