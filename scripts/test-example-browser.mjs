import { json } from './packages.mjs';
import { run } from './consumer-install.mjs';

const { directory } = (await json('.artifacts/consumers.json')).consumers.examples;
console.log(run('npm', ['run', 'test:browser'], directory));
