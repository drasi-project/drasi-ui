// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import assert from 'node:assert/strict';

/** Parse the literal public recipes; never evaluate arbitrary documentation as shell. */
export function extractInstallRecipes(markdown) {
  const expected = {
    react: ['npm', 'install', '@drasi/react', '@drasi/ui-core'],
    core: ['npm', 'install', '@drasi/ui-core', '@drasi/ui-styles'],
  };
  const recipes = new Map();
  for (const match of markdown.matchAll(/^```sh\r?\n# @drasi-install: ([a-z-]+)\r?\n([\s\S]*?)^```[ \t]*$/gm)) {
    const [, name, code] = match;
    assert(Object.hasOwn(expected, name), `Unknown install recipe ${name}`);
    assert(!recipes.has(name), `Duplicate install recipe ${name}`);
    const args = code.trim().split(/\s+/);
    assert.deepEqual(args, expected[name], `Unsupported or unsafe public install command in ${name}`);
    recipes.set(name, { name, args: args.slice(1), code });
  }
  assert.deepEqual([...recipes.keys()].sort(), Object.keys(expected).sort(), 'Both public install recipes are required');
  return recipes;
}
