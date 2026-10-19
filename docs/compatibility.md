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

The merged extraction at `81f2493` passed the local core/React build, strict
source types and 568 unit tests with all original coverage floors preserved.
Both React versions passed the actual
source-free runtime/SSR and declaration fixtures, all 17 installed documentation
recipes, Vite builds, and the Next App Router build. Native Vue passes the same
shared non-Server scenarios without React/Radix. The three-engine browser matrix
passed 340 cases, with another 12 canonical showcase cases. Required CI results
at the final PR head, not historical assertions in a guide, determine readiness.

The server-free suite keeps one explicitly optional real SSE/template test.
The guide's separate released-backend gate now runs Server 0.2.4 with signed
HTTP 0.2.13, scriptfile 0.2.15 and SSE 0.3.8 plugins. Its owned launcher verifies
release/plugin hashes, actual loaded versions/ABI, health and snapshots.
Fresh curl exercises cover source insert/update/delete/restore and the
`warm-probes` answer's entry/update/exit. Historical fixture records remain
unchanged under their original versions.

The standalone package does not claim every browser, framework, runtime or AT.
The historical Node 22.20.0/React 18.3.1 Server evidence remains in the immutable
[source test guide](https://github.com/drasi-project/drasi-server/blob/964016ddb7f2b45ad023b314c23ea140ed7703ef/dev-tools/react/docs/testing.md).
Source-only simulations are not proof of a live Server/plugin version.

## Native backend matrix

The learning launcher uses the same Server 0.2.4, HTTP 0.2.13, scriptfile 0.2.15
and SSE 0.3.8 contracts on all four targets. These are execution results, not
claims inferred from release-asset availability:

| Target | Exercised environment | Evidence |
| --- | --- | --- |
| macOS arm64 | macOS 27.0.1, Node 24.19.0 | Local real backend, default/non-default live guide, gateway-process restart, and browser lessons |
| macOS x64 | GitHub `macos-15-intel` runner | `Backend / macOS Intel`: verified native binary/plugin loading, health, resource reads, source writes, query membership and normalized SSE |
| Linux x64 | Ubuntu 24.04, Node 22.20.0 and 24.19.0 | Node 22 compatibility and Packed consumers: backend contracts, actual live guide and canonical example |
| Linux arm64 | GitHub `ubuntu-24.04-arm` runner | `Backend / Linux arm64`: the same native loading, API, source-write, membership and SSE contract checks |

The two additional native jobs first passed at
`0c036cbcb84a394ccbb518207a1bbe9db65612d6` in
[UI CI run 39280527938](https://github.com/drasi-project/drasi-ui/actions/runs/39280527938).
That run and its artifacts retain their original source identities. Every
later candidate still needs its own complete qualification; these records do
not relabel a new learning bundle or qualify arbitrary operating-system versions.
The macOS x64/Linux arm64 signed plugin builds identify source
`294db7631f0c1b77ac18eac833c0320115b5ae3a`; the existing macOS arm64/Linux x64
builds identify `22125bf1d66062533b832a166fe4a51079a23d6e`.
The launcher retains signature, digest, file-hash and loaded ABI/version checks.
Native Windows, WSL2, musl and container routes have not been qualified here.

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

### Developer-guide artifact accounting

The learning-kit revision retains one canonical 17-chapter book outside the
production packages. The unused duplicate `cold-storage-main.tsx` checkpoint
is removed; the real `main.tsx` is extracted directly, and the authentication
recipe adds a session-scoped cache. The minimal Vite starter and optional
Next app have separate manifests/locks and compilation graphs.

Production archives accept only the original 81 non-Markdown paths, with a
narrow exception for React's published-file allowlist. Runtime, declarations,
maps, CSS and dependency invariants remain byte-checked. The active
reference-only archive bounds are recorded in `learning-distribution.json`;
the older full-book and illustrated allowances below are historical and no
longer applied to current packages. `learning-kit.json` separately inventories
the complete learning distribution and its identical three package archives.

### Historical illustrated-book accounting

The preceding usability revision expanded the book to 33 literal application modules and
17 chapters. The original 17 portable recipes and public declarations retain
strict ESM/CJS/bundler checks. The application source now uses Vite client types
and extensionless imports with strict bundler resolution, plus an actual strict
Next build of the exact enumerated files. This accurately models application
tooling without claiming that extensionless browser source is NodeNext ESM.
The new lesson scripts/configuration and actual screenshots are explicitly
classified non-Markdown assets; they are not charged to runtime, declaration,
CSS or dependency budgets. The historical Markdown-only comparison below stays
immutable, including its 81 unchanged non-Markdown hashes. At that time the
guard checked those files plus a closed list of separately accounted lesson assets.

The original documentation follow-up added a single book and generated offline reference
copies, with 17 retained recipe contracts and 16 progressive book modules.
The installed-book gate uses the book's own app manifest and code, not a
separately maintained tutorial implementation. Its additional browser fixture
is an explicitly test-only gateway, not live Drasi evidence.
The original recipes and declaration fixtures retained their strict NodeNext,
CJS, and bundler options. That book's application-source group additionally used
its documented `allowImportingTsExtensions` with `noEmit`, and a separate real
Next build/prerender checks the literal App Router chapter. No package-source
aliases, disabled peer checks, or relaxed declaration checks are used, and the
extra Next lesson is accounted separately from the existing consumer metrics.

A same-toolchain comparison against merged `81f2493` measured the qualified
documentation candidate as follows:

| Package | Before archive bytes | Documentation candidate bytes | Delta |
| --- | ---: | ---: | ---: |
| `@drasi/ui-core` | 106,092 | 106,317 | +225 |
| `@drasi/ui-styles` | 7,348 | 7,527 | +179 |
| `@drasi/react` | 128,247 | 160,626 | +32,379 |
| **All packages** | **241,687** | **274,470** | **+32,783** |

Every non-Markdown packed file was byte-identical, including manifests, both
JavaScript formats, both declarations, maps, CSS, and notices. Uncompressed
Markdown increased by 99,267 bytes across the set. A separate fixed
**32,352-byte archive-only allowance** records this intentional learning-resource
cost; the original and extraction allowances and all other metric limits stay
unchanged. Each package also has its own archive bound using its pre-documentation
size, its fixed initial allowance (**core +225, styles +179, React +31,948**),
and the normal future 2% growth margin; core or styles cannot spend the React
book's allowance. Final reader/accessibility corrections add 431 bytes above
that initial measurement, within the existing 2% margin, not an enlarged
allowance. Later editorial changes still use the retained 2% unexplained-growth
bound; this is not an auto-refreshed baseline. Exact final candidate bytes and
file inventories remain in the package/consumer proof for the reviewed head.
Previously prepared release candidates are not relabeled with this evidence;
shipped-document changes require fresh preparation after merge.

The committed [per-file comparison](../tests/contracts/developer-guide-artifacts.json)
records the exact baseline and qualified archive/Markdown hashes and all
**81 unchanged non-Markdown files**. The rebuilt baseline matched the retained
[prepare-only run](https://github.com/drasi-project/drasi-ui/actions/runs/39083451415)
byte-for-byte; its release-set SHA256 remains
`2c5d4e0f9b633c7b88abfc195d51a436cd9689c4c5a69510539b4ac6c8d8314e`.
That retained evidence was read, not altered. To reproduce a documentation-only
comparison with downloaded baseline archives and a fresh local candidate set:

```sh
node scripts/compare-documentation.mjs .artifacts/documentation-baseline .artifacts/documentation-review .artifacts/documentation-comparison.json
```

The command verifies archive identities and actual inventories, and fails if
any non-Markdown file changes. The checked-in receipt is historical evidence
for these exact bytes, not a hash pin on all future documentation edits.

The [package baseline](../tests/contracts/artifact-baseline.json) retains the
untouched import and adds fixed, explained multi-package wrapper/declaration/CSS
costs. The canonical example's
[untouched paired control](../examples/react/test/extraction-metrics.json) was
calibrated with the same official lock and original Vite 5.4.19 on both sides:
the extraction added 930 raw JS bytes / 1,199 gzip bytes in total and
1,337 / 1,363 bytes to headless use, while removing Server code from the
provider-free showcase. The initial Vite 7.3.5 security update remained below
those existing caps (236,518 total JS bytes / 79,592 gzip bytes); it does not
increase them. The final patched, relocatable showcase measures 236,646 / 79,644
bytes and also stays within the same limits. Original P7 limits and fixed extraction deltas remain, with no
CSS allowance or blanket baseline refresh.

Human review must cover actual keyboard/screen-reader usage, announcements,
table sorting, modal nesting/focus/return/dismissal, zoom, themes, reduced motion,
host styling and RTL. Automated DOM ARIA, browser-native AX and axe outputs do
not close that gate.
