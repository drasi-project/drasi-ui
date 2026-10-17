import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { json } from './packages.mjs';

const { directory } = (await json('.artifacts/consumers.json')).consumers.react19;
const child = spawn(process.execPath, [join(directory, 'node_modules/next/dist/bin/next'),
  'start', '--hostname', '127.0.0.1', '--port', '15276'], {
  cwd: directory, stdio: 'inherit', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
});
child.once('error', error => { console.error(error); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
