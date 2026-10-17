import { spawnSync } from 'node:child_process';
import { copyFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const directory of ['core', 'styles', 'react']) {
  const base = new URL(`../packages/${directory}/`, import.meta.url);
  await rm(new URL('dist', base), { recursive: true, force: true });
  for (const file of ['LICENSE', 'NOTICE']) {
    await copyFile(new URL(`../${file}`, import.meta.url), new URL(file, base));
  }
  const result = spawnSync('npm', ['run', 'build', '--workspace', `packages/${directory}`], {
    cwd: root, stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
