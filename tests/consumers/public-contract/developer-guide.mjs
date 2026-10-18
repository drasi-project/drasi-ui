// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import assert from 'node:assert/strict';
import { markdownFences, extractReadmeExamples, requiredGuideExamples } from './readme-examples.mjs';

export const guidePath = 'docs/developer-guide/README.md';
export const guideAssetLanguages = {
  'package.json': 'json',
  'tsconfig.json': 'json',
  'index.html': 'html',
  'vite.config.mjs': 'js',
  'cold-storage.css': 'css',
  'identity.test.mjs': 'js',
};

export function extractGuide(markdown) {
  const examples = extractReadmeExamples(markdown, requiredGuideExamples);
  const assets = new Map();
  for (const fence of markdownFences(markdown)) {
    if (!fence.previousLine.startsWith('<!-- @drasi-guide-file:')) continue;
    const match = /^<!-- @drasi-guide-file: ([a-z][a-z0-9.-]*) -->$/.exec(fence.previousLine);
    assert(match && Object.hasOwn(guideAssetLanguages, match[1]), `Invalid guide asset marker: ${fence.previousLine}`);
    const name = match[1];
    assert(fence.closed, `Unclosed guide asset: ${name}`);
    assert.equal(fence.language, guideAssetLanguages[name], `Wrong guide asset language: ${name}`);
    assert(!assets.has(name), `Duplicate guide asset: ${name}`);
    assets.set(name, { name, code: `${fence.lines.join('\n')}\n`, line: fence.line });
  }
  for (const name of Object.keys(guideAssetLanguages)) assert(assets.has(name), `Missing guide asset: ${name}`);
  return { examples, assets };
}
