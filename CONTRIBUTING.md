# Contributing

Use npm workspaces, the single root lockfile and the pinned Node 24.19.0 /
npm 11.17.0 maintainer toolchain. Do not add package-source aliases, copy another
project's `node_modules`, change registries, disable integrity/TLS checks or use
peer-resolution overrides.

```sh
npm ci
npm run build
npm run lint
npm run typecheck
npm run test:coverage
```

Core/styles build before React. Unit aliases instrument source behind its public
exports; they are not consumer compatibility evidence. Standalone consumers
install actual archives outside the checkout:

```sh
npm run pack:candidates
npm run check:packages
npm run test:contracts
npm run test:pnpm
npm run test:browser
```

Packing refuses to overwrite a candidate directory. Use a fresh named
`DRASI_CANDIDATES=.artifacts/candidates-review` directory for another attempt.
Never test one artifact and silently rebuild a different one for publication.
The package proof inventories every file, both JavaScript/declaration formats,
source maps, CSS and external dependency graphs. Consumer proofs retain effective
locks, versions and source-free paths.

Before the sibling packages exist in a registry, the pnpm consumer explicitly
redirects only the exact `@drasi/ui-core@<candidate-version>` transitive dependency
to that same verified `.tgz`. pnpm otherwise tries the registry rather than
reusing the root tarball. This archive-only resolution is recorded in its proof;
it changes neither package bytes, source imports nor peer ranges. Ordinary
registry consumption after publication needs no such test-only resolution.

The optional dependency-cache workflows use only the official npm registry and
produce auditable lock/cache artifacts. Offline restoration must match the
recorded manifest/lock identities and retain npm integrity validation. Normal
contributors use `npm ci`; the cache is not a registry mirror or a replacement
for installation.

## Changes and review

Keep code with its owner: core for shared non-rendering contracts/algorithms,
React for scheduling/renderers/accessibility, styles for canonical CSS, and
optional adapters for Server details. Examples, fixtures and future applications
stay private. New Vue/console work follows the reserved architecture contracts.

Add a package-specific changeset with `npm run changeset`. Core changes require
compatible React dependency updates. Changed embedded styles require explicit
styles and React changesets even if the dependency is used only during build.
Versioning uses Changesets, not hand-maintained permanent lockstep versions.
The initial beta versions are release-preparation proposals; maintainers review
and apply the release plan before qualifying a publishable set.

Preserve 90% statements/lines/functions and 85% branches in all owning product
subtrees. Keep concurrency, sparse-delete, stale/retry, independent subscriber,
disposal, browser/AX and exact public-contract assertions. Explain measured
wrapper/CSS changes instead of raising every size budget.

Pull requests require review, code-owner review, passing required checks and
resolved conversations. Do not bypass branch protection. Ordinary changes do
not authorize staging, publishing, npm access changes or merging.

Report vulnerabilities privately as described in [SECURITY](SECURITY.md).
For behavior bugs, use the issue templates and include exact package versions,
browser/runtime, an isolated reproduction and redacted diagnostics.
