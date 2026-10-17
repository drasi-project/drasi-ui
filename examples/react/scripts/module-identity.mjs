// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
import assert from 'node:assert/strict';
import { isAbsolute, relative } from 'node:path';

export function moduleIdentity(raw, root) {
  // Rollup prefixes virtual CommonJS wrappers with NUL, even for absolute file IDs.
  const clean = raw.replace(/^\0+/, '');
  const query = clean.indexOf('?');
  const file = query < 0 ? clean : clean.slice(0, query);
  const suffix = query < 0 ? '' : clean.slice(query);
  const packageFile = /(?:node_modules\/@drasi\/(react|ui-core|ui-styles)|packages\/(react|core|styles))\/(dist\/.+)/.exec(file);
  const workspaceNames = { react: 'react', core: 'ui-core', styles: 'ui-styles' };
  const packageName = packageFile ? packageFile[1] ?? workspaceNames[packageFile[2]] : null;
  const installed = file.lastIndexOf('/node_modules/');
  const name = packageFile ? `@drasi/${packageName}/${packageFile[3]}` :
    installed >= 0 ? file.slice(installed + 1) :
    isAbsolute(file) ? relative(root, file).replaceAll('\\', '/') : `virtual:${file}`;
  return { id: name + suffix, sourceMap: packageFile && /\.[cm]?js$/.test(file) ? `${file}.map` : null };
}

export function assertExampleModule(id) {
  const file = id.split('?')[0];
  const helper = [
    'virtual:commonjsHelpers.js',
    'virtual:vite/modulepreload-polyfill.js',
    'virtual:vite/preload-helper.js',
  ].includes(file);
  const owned = /^(?:src\/|node_modules\/|@drasi\/(?:react|ui-core|ui-styles)\/dist\/)/.test(file);
  assert((helper || owned) && !file.split('/').includes('..') && !file.includes('\0') &&
    !/@drasi\/(?:react|ui-core|ui-styles)\/src(?:\/|$)/.test(file),
  `Example imports outside its source/installed artifacts: ${id}`);
}
