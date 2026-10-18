import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { candidateDirectory, root } from './packages.mjs';
import { qualifyCandidates } from './qualified-candidates.mjs';

assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
const qualification = await qualifyCandidates(candidateDirectory, join(root, '.artifacts'),
  process.env.GITHUB_SHA, process.env.GITHUB_RUN_ID);
await writeFile(join(candidateDirectory, 'qualification.json'), JSON.stringify(qualification, null, 2) + '\n');
