# Testing and compatibility

[Package overview](../../README.md)

<a id="verified-compatibility"></a>

The [repository compatibility matrix](https://github.com/drasi-project/drasi-ui/blob/main/docs/compatibility.md)
records exact versions, evidence and unresolved human gates. A historical pass in
Drasi Server is not qualification of these new multi-package artifacts.

## Package-owned checks

Unit tests cover Server read validation, generic transport, bounded overlap/retry,
raw identity and sparse deletes, projection failures, scoped errors, committed
React callbacks, StrictMode, cancellation, table composition, sorting, modal focus,
themes and reduced motion. The non-Server fixture implements `QueryClient`
without Server DTOs or a concrete client superclass.

Coverage includes every core/React product source file and preserves floors of
**90% statements, lines and functions, and 85% branches** for core and each owning
React subtree. Type-only barrels contribute no executable statements; no product
source is excluded to reach a floor.

Source-free npm consumers install the complete exact tarball set, including normal
script-enabled and scripts-disabled installation. React 18.3.1 and React 19.3.1
exercise ESM/CJS, strict NodeNext and bundler declarations, SSR/global traps,
literal documented recipes, real Vite builds, and Next App Router. A separate
pnpm consumer exercises ordinary installation. No source alias, peer override,
directory-link workaround or install-time library rebuild is allowed.

The single developer guide adds a fresh source-free app built from its literal
manifest, configuration, HTML, and modules, extracted from the separate
learning bundle. Its first screen runs unchanged; advanced lesson fixtures import
those same modules rather than parallel implementations. The guide's
application-owned client is exercised over a deterministic test transport
and a browser SSE gateway, including sparse deletes, local/shared recovery,
projection failure, disposal, and replacement. The gateway is a test fixture,
not a Drasi runtime or new backend compatibility evidence.
A separate source-free Next app builds and prerenders the literal App Router
chapter. The original 17 portable recipes retain their strict compiler options;
the book's source modules use their documented bundler/no-emit
configuration in addition to those checks. No package source is resolved.

Core-only and native Vue consumers must not resolve React, React DOM, React
declarations or Radix. Vue uses the same contract fixture and core query algorithms
with native reactivity and disposal; shared CSS styles Vue-rendered markup.

The portable browser suite retains provider-free keyboard/AX/axe, nested modal,
focus/return/dismissal, zoom, host CSS, themes, RTL, native animation, clock replay
and SSR/hydration assertions. Library defaults require zero automated violations.
Trading's application-specific contrast exceptions and original financial images
remain downstream.

## Running the gates

Use the root lock and explicit builds described in the
[contribution guide](https://github.com/drasi-project/drasi-ui/blob/main/CONTRIBUTING.md).
Run `npm run build`, `npm run lint`, `npm run typecheck`,
`npm run test:coverage`, then the exact-candidate package, consumer and browser
commands. The package build never needs Rust, Python, a Server checkout or plugins.
The optional real-backend example requires separately prepared running resources.

Artifact accounting includes all packages, entries, shared/lazy chunks, ESM/CJS,
both declarations, maps, CSS, emitted consumer assets and installed dependency
graphs. Splitting an archive is not evidence of a bundle-size reduction.
The 2% unexplained-growth policy is retained; extraction-specific wrappers and
the extra canonical stylesheet must be accounted for explicitly.

## Historical evidence and human acceptance

[The pinned original test guide](https://github.com/drasi-project/drasi-server/blob/964016ddb7f2b45ad023b314c23ea140ed7703ef/dev-tools/react/docs/testing.md)
retains the full engine/ABI history, recorded wire fixtures, regression provenance
and downstream financial/CRUD qualification. New source links point to this
repository; immutable historical links are not relabeled as current evidence.

Human keyboard/screen-reader acceptance remains a separate publication gate.
Automation does not stand in for a named reviewer, supported AT/browser versions,
recorded findings and explicit acceptance of the candidate artifacts.
