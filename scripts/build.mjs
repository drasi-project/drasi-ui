import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
for (const directory of ['core', 'styles', 'react']) {
  const base = new URL(`../packages/${directory}/`, import.meta.url);
  await rm(new URL('dist', base), { recursive: true, force: true });
  for (const file of ['LICENSE', 'NOTICE']) {
    await copyFile(new URL(`../${file}`, import.meta.url), new URL(file, base));
  }
  for (const directory of ['examples/vue-canary', 'tests/consumers/react-18', 'tests/consumers/react-19']) {
    const generated = new URL(`../${directory}/.generated/`, import.meta.url);
    await mkdir(generated, { recursive: true });
    await copyFile(new URL('../tests/contracts/host.ts', import.meta.url), new URL('host.ts', generated));
    if (directory.startsWith('tests/')) {
      await copyFile(new URL('../tests/contracts/react-app.tsx', import.meta.url), new URL('react-app.tsx', generated));
    }
  }
  const result = spawnSync('npm', ['run', 'build', '--workspace', `packages/${directory}`], {
    cwd: root, stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
