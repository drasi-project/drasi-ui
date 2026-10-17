# Compatibility and evidence

This is first-release preparation, not a claim that packages are available on
npm. Namespace selection is confirmed; authenticated ownership, two maintainers,
trusted publishers, actual publication and human accessibility acceptance remain
separate gates.

| Surface | Qualification target |
| --- | --- |
| Package combination | Core, styles and React `0.1.0-beta.1`, installed as one exact candidate set |
| React / React DOM | 18.3.1 and 19.3.1; one runtime identity |
| Vue proof | Native Vue 3.5.44 with packed core/styles and no React/Radix/runtime/types |
| Frameworks | Vite 5.4.19 and Next 16.4.2 App Router, actual builds and SSR/hydration |
| Declarations | TypeScript 5.9.3 for core/React 18 and 6.0.3 for the React 19/Next consumer; strict NodeNext ESM/CJS and bundler, `skipLibCheck: false` |
| Maintainer toolchain | Node 24.19.0, npm 11.17.0; release operations use npm 11.21.0 |
| Browser automation | Playwright 1.56.1 Chromium, Firefox and WebKit; pinned Linux image in CI |

The current local core/React build, strict source types and 568 unit tests pass
with all original coverage floors preserved. Exact tarball package checks and
ESM/CJS SSR/global traps are being qualified alongside the full consumer/browser
matrix. Required CI results at the final PR head, not historical assertions in a
guide, determine technical readiness.

The standalone package does not claim every browser, framework, runtime or AT.
The historical Node 22.20.0/React 18.3.1 Server evidence remains in the immutable
[source test guide](https://github.com/drasi-project/drasi-server/blob/964016ddb7f2b45ad023b314c23ea140ed7703ef/dev-tools/react/docs/testing.md).
Source-only simulations are not proof of a live Server/plugin version.

## Deliberate tooling scope

Product code and installed consumer declarations use `skipLibCheck: false`.
The separate build-tool tsconfig skips third-party declaration checking because
pinned tsup 8.5.1 references missing internal `types.cts` and optional SWC
declarations. Its own configuration is still type-checked. This does not weaken
any shipped declaration or product coverage gate.

Next 16.4.2 references the modern `URLPatternInput`/`URLPatternOptions` web
declarations introduced in TypeScript 6. Its private consumer therefore pins
TypeScript 6.0.3 and Node 24 declarations, includes `next-env.d.ts`, and remains
fully strict. No ambient `any` shim or framework `ignoreBuildErrors` setting is used.

Are the Types Wrong uses its exports-aware `node16` profile, which covers
NodeNext CJS/ESM and bundler resolution. Legacy TypeScript `node10` resolution is
not advertised. CSS is checked as a real asset, not a Node-executable JavaScript
entrypoint. Publint warnings/errors remain blocking; its specific informational
`USE_ENGINES_NODE` suggestion is retained in reports rather than imposing a
maintainer Node version on browser/CSS installations.

## Performance and ownership limits

Each query observer owns its raw rows, projection and snapshot work. Hoist one
hook to share a query across presentations; providers do not cache queries.
Reconciliation bounds pending changes, not the result-set size. The retained
regressions include sustained 1,000-update disposal behavior, but there is no
virtualization, pagination or unlimited-result promise.

Complete package and consumer graph metrics include core/styles/React together,
both JavaScript/declaration formats, shared/lazy chunks, source maps, duplicate
compatibility CSS bytes and installed dependencies. The 2% unexplained-growth
policy is not replaced by comparing only the smaller React archive.

Human review must cover actual keyboard/screen-reader usage, announcements,
table sorting, modal nesting/focus/return/dismissal, zoom, themes, reduced motion,
host styling and RTL. Automated DOM ARIA, browser-native AX and axe outputs do
not close that gate.
