# Future native Vue controls

Reserve `packages/vue` for native composables, components, refs, slots and
Vue-native accessible overlays. No placeholder package is published now.
The private canary is a real Vue 3 consumer, not the public API or a full port.

Vue depends on core and styles, never React. Share normalized identity,
accumulation, reconciliation, projection/error state and table bookkeeping.
Keep renderer-specific callbacks and DOM ownership local: React's `ColumnDef`
returns ReactNode and is not a cross-framework column type.

Parity is behavioral, not identical signatures: raw updates and sparse deletes,
loading/empty/stale/error distinctions, query-versus-connection retry, scope
replacement, sorting states, reduced motion, disposal and tokens must run
against the shared contract scenarios. Native Vue accessibility primitives
must meet the same keyboard, automated browser and human acceptance gates
before a Vue package is released.

The packed canary installs core/styles and Vue with no React, React DOM, React
declarations or Radix. Shared CSS is applied to Vue-rendered semantic markup.
No hidden React wrapper, universal renderer abstraction or copied query state
implementation is permitted.
