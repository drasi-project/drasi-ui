import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const releasePackages = [
  { name: '@drasi/ui-core', directory: 'packages/core', code: true },
  { name: '@drasi/ui-styles', directory: 'packages/styles', code: false },
  { name: '@drasi/react', directory: 'packages/react', code: true },
];
export const candidateDirectory = resolve(root, process.env.DRASI_CANDIDATES ?? '.artifacts/candidates');
export async function json(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}
