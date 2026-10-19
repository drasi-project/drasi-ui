// Copyright 2026 The Drasi Authors. Licensed under the Apache License, Version 2.0.
// Retains the installed declaration/runtime/documentation checks extracted from Trading.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkBoundary, filesUnder, inside, moduleReferences } from './artifact-graphs.mjs';
import { extractDocumentationExamples } from './readme-examples.mjs';
import { loadDocumentation } from './documents.mjs';
import { extractInstallRecipes } from './install-recipes.mjs';
import { checkInstalledDocumentationLinks } from './documentation-links.mjs';
import { extractGuide } from './developer-guide.mjs';

const fixtures = fileURLToPath(new URL('.', import.meta.url));
const json = async file => JSON.parse(await readFile(file, 'utf8'));
const save = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n');
function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd, stdio: 'inherit', timeout: 300_000,
    env: { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' },
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} ${args.join(' ')} failed`);
}

export async function assertFrameworkIsolation(directory, allowVue = false) {
  const require = createRequire(join(directory, 'package.json'));
  const forbidden = ['react', 'react-dom', '@types/react', '@types/react-dom', '@radix-ui/react-dialog',
    ...(allowVue ? [] : ['vue', '@vue/runtime-dom', '@vue/runtime-core'])];
  for (const name of forbidden) {
    for (const search of require.resolve.paths(name) ?? []) {
      assert(!existsSync(join(search, name)), `Isolated consumer can reach ${name}: ${search}`);
    }
    assert.throws(() => require.resolve(name), error => error.code === 'MODULE_NOT_FOUND');
  }
  for (const file of await filesUnder(join(directory, 'node_modules'))) {
    if (!file.endsWith('/package.json')) continue;
    const manifest = await json(file);
    assert(!forbidden.includes(manifest.name) && !manifest.name?.startsWith('@radix-ui/'),
      `Hidden renderer dependency: ${manifest.name}`);
  }
}

async function installedPackages(directory) {
  const result = [];
  for (const name of ['@drasi/ui-core', '@drasi/react']) {
    const location = join(directory, 'node_modules', name);
    if (!existsSync(location)) continue;
    result.push({ name, root: await realpath(location), manifest: await json(join(location, 'package.json')) });
  }
  return result;
}

async function compile({ directory, output, label, files, mode, boundary, application = false }) {
  const ts = createRequire(join(directory, 'package.json'))('typescript');
  const packages = await installedPackages(directory);
  const options = {
    noEmit: true, strict: true, skipLibCheck: false, noUncheckedSideEffectImports: true,
    types: application ? ['vite/client'] : [],
    target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    module: mode === 'bundler' ? ts.ModuleKind.ESNext : ts.ModuleKind.NodeNext,
    moduleResolution: mode === 'bundler' ? ts.ModuleResolutionKind.Bundler : ts.ModuleResolutionKind.NodeNext,
    traceResolution: true,
  };
  const retained = join(output, label, mode);
  await mkdir(retained, { recursive: true });
  const expected = [];
  const inputs = [];
  for (const file of files) {
    const body = await readFile(file);
    await writeFile(join(retained, basename(file)), body);
    inputs.push({ file: basename(file), sha256: createHash('sha256').update(body).digest('hex') });
    const source = ts.createSourceFile(file, body.toString(), ts.ScriptTarget.Latest, true);
    for (const specifier of moduleReferences(ts, source)) {
      const owner = packages.find(pkg => specifier === pkg.name || specifier.startsWith(`${pkg.name}/`));
      if (!owner) continue;
      const subpath = specifier === owner.name ? '.' : `.${specifier.slice(owner.name.length)}`;
      const entry = owner.manifest.exports[subpath];
      if (entry && typeof entry === 'object') expected.push({ ...owner, entry });
    }
  }
  await save(join(retained, 'compiler-options.json'), options);
  const trace = [];
  const host = ts.createCompilerHost(options);
  host.getCurrentDirectory = () => directory;
  host.trace = message => trace.push(message);
  const program = ts.createProgram(files, options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  await writeFile(join(retained, 'resolution.log'), trace.join('\n'));
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: path => path, getCurrentDirectory: () => directory, getNewLine: () => '\n',
  }));
  if (mode !== 'bundler') {
    for (const file of files) assert.equal(program.getSourceFile(file)?.impliedNodeFormat,
      mode === 'cjs' ? ts.ModuleKind.CommonJS : ts.ModuleKind.ESNext, `Wrong NodeNext mode for ${file}`);
  }
  const loaded = [];
  for (const source of program.getSourceFiles()) {
    const file = await realpath(source.fileName);
    assert(inside(directory, file), `TypeScript escaped the installed consumer: ${file}`);
    loaded.push(file);
    if (boundary === 'client' || boundary === 'server-client') {
      assert(!/\/node_modules\/(?:@types\/)?react(?:-dom)?(?:\/|$)/.test(file), `Core types reached React: ${file}`);
    }
    if (packages.some(pkg => inside(pkg.root, file))) {
      assert(/\.d\.(?:ts|mts|cts)$/.test(file), `Compiler reached implementation source: ${file}`);
      checkBoundary(ts, source, boundary);
    }
  }
  const condition = mode === 'cjs' ? 'require' : 'import';
  for (const { root, entry } of expected) {
    const right = await realpath(resolve(root, entry[condition].types));
    const wrong = await realpath(resolve(root, entry[condition === 'require' ? 'import' : 'require'].types));
    assert(loaded.includes(right), `Missing ${condition} declaration: ${right}`);
    assert(!loaded.includes(wrong), `Loaded the opposite declaration condition: ${wrong}`);
  }
  return { compiler: ts.version, condition, inputs, files: loaded.map(file => relative(directory, file)).sort() };
}

async function compileFixture(directory, output, name, boundary) {
  const result = {};
  for (const mode of ['esm', 'cjs', 'bundler']) {
    const extension = { esm: 'mts', cjs: 'cts', bundler: 'ts' }[mode];
    const file = join(directory, `contract-${name}-${mode}.${extension}`);
    await copyFile(join(fixtures, `${name}.fixture.txt`), file);
    const text = await readFile(file, 'utf8');
    assert(text.includes('@ts-expect-error'), `Missing negative assertions: ${name}`);
    result[mode] = {
      ...await compile({ directory, output, label: name, files: [file], mode, boundary }),
      expectedErrors: (text.match(/@ts-expect-error/g) ?? []).length,
    };
  }
  return result;
}

async function compileDocuments(directory, output, examples, label, boundary, application = false) {
  const result = {};
  for (const mode of application ? ['bundler'] : ['esm', 'cjs', 'bundler']) {
    const folder = join(directory, `contract-${label}-${mode}`);
    await mkdir(folder);
    await save(join(folder, 'package.json'), { private: true, type: mode === 'cjs' ? 'commonjs' : 'module' });
    const files = [];
    for (const example of examples) {
      // Application source uses bundler resolution; portable recipes and package
      // declarations retain their independent NodeNext ESM/CJS checks.
      const file = join(folder, example.name);
      await writeFile(file, example.code);
      files.push(file);
    }
    result[mode] = await compile({ directory, output, label, files, mode, boundary, application });
  }
  return result;
}

export async function checkPackedPublicContract({ coreOnly, app, output, includeCore = true, learningBook }) {
  await mkdir(output, { recursive: true });
  const proof = { node: process.version, types: {}, documentation: {} };
  const require = createRequire(join(app, 'package.json'));
  proof.react = require('react/package.json').version;
  assert(['18.3.1', '19.3.1'].includes(proof.react), 'Unqualified React runtime');
  assert.equal(require('react-dom/package.json').version, proof.react);
  for (const [directory, kinds] of [
    ...(includeCore ? [[coreOnly, ['client']]] : []),
    [app, ['react', 'components', 'root']],
  ]) {
    const runner = join(directory, 'contract-runtime.mjs');
    await copyFile(join(fixtures, 'runtime.mjs'), runner);
    for (const kind of kinds) for (const mode of ['esm', 'cjs']) {
      run(process.execPath, ['--enable-source-maps', runner, kind, mode], directory);
    }
  }
  if (includeCore) {
    await assertFrameworkIsolation(coreOnly);
    proof.types.core = await compileFixture(coreOnly, output, 'core', 'client');
    proof.types.client = await compileFixture(coreOnly, output, 'client', 'server-client');
  }
  proof.types.hooks = await compileFixture(app, output, 'hooks', 'server-react');
  proof.types.components = await compileFixture(app, output, 'components', 'package');
  const runner = join(app, 'contract-dce.mjs');
  await copyFile(join(fixtures, 'dce.mjs'), runner);
  run(process.execPath, [runner], app);
  const packageRoot = join(app, 'node_modules/@drasi/react');
  const documents = await loadDocumentation(packageRoot);
  const examples = extractDocumentationExamples(documents);
  proof.documentation.installationRecipes = [...extractInstallRecipes(Object.values(documents).join('\n')).values()];
  proof.documentation.links = await checkInstalledDocumentationLinks(packageRoot, documents);
  proof.documentation.files = Object.fromEntries(Object.entries(documents).map(([file, body]) =>
    [file, createHash('sha256').update(body).digest('hex')]));
  proof.documentation.all = await compileDocuments(app, output,
    examples, 'documentation', 'package');
  proof.documentation.headless = await compileDocuments(app, output,
    examples.filter(example => example.name === 'reduced-motion.tsx'), 'headless', 'react');
  if (includeCore) proof.documentation.core = await compileDocuments(coreOnly, output,
    examples.filter(example => ['client.ts', 'auth.ts'].includes(example.name)), 'core-docs', 'server-client');
  if (includeCore) proof.documentation.applicationClient = await compileDocuments(coreOnly, output,
    extractGuide(learningBook).examples.filter(example => example.name === 'application-client.ts'), 'application-client', 'client');
  await save(join(output, 'proof.json'), proof);
  console.log(`Installed public contracts and ${examples.length} literal recipes passed on React ${proof.react}.`);
  return proof;
}
