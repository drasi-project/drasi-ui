// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

function manifestCli(manifestPath, name, bin) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.name, name, `Unexpected CLI package: ${manifestPath}`);
  const entry = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.[bin];
  assert(typeof entry === 'string' && !isAbsolute(entry), `Missing relative ${bin} JavaScript entrypoint`);
  const directory = dirname(realpathSync(manifestPath));
  const cli = realpathSync(resolve(directory, entry));
  const local = relative(directory, cli);
  assert(local !== '..' && !local.startsWith(`..${sep}`) && !isAbsolute(local), 'CLI escapes its package');
  assert(/\.[cm]?js$/.test(cli) && statSync(cli).isFile(), `Expected a JavaScript CLI: ${cli}`);
  return cli;
}

export function packageCli(name, bin, directory) {
  const require = createRequire(join(resolve(directory), 'package.json'));
  return manifestCli(require.resolve(`${name}/package.json`), name, bin);
}

export function npmCli({ env = process.env, execPath = process.execPath } = {}) {
  // npm supplies this for nested scripts; pnpm supplies a different runner.
  if (env.npm_execpath && basename(env.npm_execpath) === 'npm-cli.js') {
    const cli = realpathSync(env.npm_execpath);
    const resolved = manifestCli(resolve(dirname(cli), '..', 'package.json'), 'npm', 'npm');
    assert.equal(resolved, cli, 'npm_execpath does not match its package entrypoint');
    return cli;
  }
  const executable = realpathSync(execPath);
  const directories = [dirname(executable), resolve(dirname(executable), '..', 'lib')];
  const path = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
  for (const directory of path.split(delimiter).filter(Boolean)) {
    directories.push(directory.replace(/^"(.*)"$/, '$1'));
  }
  for (const directory of directories) {
    try { return packageCli('npm', 'npm', directory); }
    catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error;
    }
    // Unix package managers may put a symlink in bin and npm elsewhere.
    try {
      const cli = realpathSync(join(directory, 'npm'));
      if (basename(cli) === 'npm-cli.js') {
        return manifestCli(resolve(dirname(cli), '..', 'package.json'), 'npm', 'npm');
      }
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
    }
  }
  throw new Error('Cannot locate npm\'s JavaScript CLI. Use a Node installation with npm, or invoke through npm run.');
}

export function spawnNpmSync(args, options = {}) {
  assert(options.shell === undefined || options.shell === false, 'npm must run without a command shell');
  return spawnSync(process.execPath, [npmCli({ env: options.env ?? process.env }), ...args],
    { ...options, shell: false });
}
