# Package and application boundaries

Core owns data contracts, normalized results, raw identity/accumulation,
reconciliation, projection/error state and pure sorting/animation bookkeeping.
React owns commit timing, lifecycle, ReactNode renderers, refs, portals, focus
and overlay behavior. Styles owns one canonical scoped stylesheet.

Generic core and React entrypoints cannot import either optional Server adapter.
Server wire compatibility, DTOs, URL/resource validation and concrete clients
live in `@drasi/ui-core/adapters/drasi-server`. Its React provider, owned-client
binding and inspection hooks live in `@drasi/react/adapters/drasi-server`.
React production imports core through public package exports. Unit-test aliases
instrument those public entries; they are never used by packed consumers.

Each observer has independent accumulation, snapshot work and scoped retry.
A provider shares a connection, not a query cache. Hoist one hook and pass its
view to multiple presentations when that is the desired cost model.
Snapshot/SSE overlap triggers bounded visible reconciliation. A snapshot and a
delayed event have no shared authoritative cursor; there is no gap-free,
atomic or exactly-once promise.

Raw identity precedes projection, including sparse deletes and key-changing
updates. A transform-null row remains in raw state. Last-good projections are
committed by the renderer only after accepted rendering, never while publishing
speculative React options. Scope changes cannot expose a previous query's rows,
errors, retry handle or late callbacks.

Npm workspaces and one root lock determine maintainer dependencies. Core/styles
build before React; source-free consumers install the complete candidate set.
CI conservatively checks all reverse dependencies. Package-specific Changesets
and an explicit dependency gate require renderer releases when their embedded
CSS or exact core dependency changes. Console-only work will not require a
package changeset.

The initial public allowlist contains only core, styles and React. Private
examples/fixtures/apps cannot become accidental releases. See the
[Vue](vue.md) and [console](console.md) contracts for reserved future locations.
