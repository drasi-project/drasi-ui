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
| Frameworks | Vite 7.3.7 and Next 16.4.2 App Router, actual builds and SSR/hydration |
| Declarations | TypeScript 5.9.3 for core/React 18 and 6.0.3 for the React 19/Next consumer; strict NodeNext ESM/CJS and bundler, `skipLibCheck: false` |
| Maintainer toolchain | Node 24.19.0, npm 11.17.0; release operations use npm 11.21.0 |
| Browser automation | Playwright 1.56.1 Chromium, Firefox and WebKit; pinned Linux image in CI |

The local core/React build, strict source types and 568 unit tests pass with all
original coverage floors preserved. Both React versions pass the actual
source-free runtime/SSR and declaration fixtures, all 17 installed documentation
recipes, Vite builds, and the Next App Router build. Native Vue passes the same
shared non-Server scenarios without React/Radix. The three-engine browser matrix
passes 340 cases, with another 12 canonical showcase cases. Required CI results
at the final PR head, not historical assertions in a guide, determine readiness.

One optional example test requires an explicitly configured real SSE/template
backend and is not run by server-free qualification. Its absence is not a new
live-runtime claim; recorded adapter fixtures and the separate operator-owned
live gate retain their stated scope.

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
Those Next fixture pins are not minimum requirements for every library consumer:
core and React 18 continue to be checked with TypeScript 5.9.3, and the browser
packages do not inherit the fixture's Node declaration version as an engine constraint.

Are the Types Wrong uses its exports-aware `node16` profile, which covers
NodeNext CJS/ESM and bundler resolution. Legacy TypeScript `node10` resolution is
not advertised. CSS is checked as a real asset, not a Node-executable JavaScript
entrypoint. Publint warnings/errors remain blocking; its specific informational
`USE_ENGINES_NODE` suggestion is retained in reports rather than imposing a
maintainer Node version on browser/CSS installations.

## Performance and ownership limits

The inherited Vite 5.4.19 development graph had reported file-serving/path
advisories and a vulnerable esbuild development-server version. The four private
consumer/example workspaces now use Vite 7.3.7 with its supported esbuild 0.28.1
instead; public package dependencies and React peer ranges are unchanged.
Runtime dependency licenses are Apache-2.0, MIT and tslib's permissive 0BSD;
their installed license files are retained. Both production and development
advisory reports for the isolated consumers are blocking qualification checks,
not hidden exceptions. The explicit esbuild pin prevents npm from retaining an
older, still-range-compatible development-server dependency.

Each query observer owns its raw rows, projection and snapshot work. Hoist one
hook to share a query across presentations; providers do not cache queries.
Reconciliation bounds pending changes, not the result-set size. The retained
regressions include sustained 1,000-update disposal behavior, but there is no
virtualization, pagination or unlimited-result promise.

Complete package and consumer graph metrics include core/styles/React together,
both JavaScript/declaration formats, shared/lazy chunks, source maps, duplicate
compatibility CSS bytes and installed dependencies. The 2% unexplained-growth
policy is not replaced by comparing only the smaller React archive.

The [package baseline](../tests/contracts/artifact-baseline.json) retains the
untouched import and adds fixed, explained multi-package wrapper/declaration/CSS
costs. The canonical example's
[untouched paired control](../examples/react/test/extraction-metrics.json) was
calibrated with the same official lock and original Vite 5.4.19 on both sides:
the extraction added 930 raw JS bytes / 1,199 gzip bytes in total and
1,337 / 1,363 bytes to headless use, while removing Server code from the
provider-free showcase. The initial Vite 7.3.5 security update remained below
those existing caps (236,518 total JS bytes / 79,592 gzip bytes); it does not
increase them. Original P7 limits and fixed extraction deltas remain, with no
CSS allowance or blanket baseline refresh.

Human review must cover actual keyboard/screen-reader usage, announcements,
table sorting, modal nesting/focus/return/dismissal, zoom, themes, reduced motion,
host styling and RTL. Automated DOM ARIA, browser-native AX and axe outputs do
not close that gate.
