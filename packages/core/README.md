# @drasi/ui-core

Framework-neutral data contracts, independent per-subscriber query state,
bounded snapshot/stream reconciliation, typed errors and pure table/animation
bookkeeping. No React, Vue, Radix, renderer types, DOM ownership or management
mutations are included in the generic dependency graph.

The [co-located client/result reference](https://github.com/drasi-project/drasi-ui/blob/main/packages/core/src/client/README.md)
specifies the structural contracts and helper options. The
[Server adapter reference](https://github.com/drasi-project/drasi-ui/blob/main/packages/core/src/adapters/drasi-server/README.md)
separately owns Server reads, DTOs, and wire conventions. React developers
should learn through the single
[React developer guide](https://github.com/drasi-project/drasi-ui/blob/main/packages/react/docs/developer-guide/README.md),
which also ships offline copies of these references in the React package.

**Initial beta preparation, not a publication claim.** The selected npm name
still requires package-specific ownership verification before release.

## Data-only clients

Implement the structural `QueryClient` contract: `subscribe`,
`getConnectionStatus` and `onConnectionStatusChange`. A subscription delivers
normalized snapshots/deltas, publishes its current `QuerySubscriptionState`,
and returns a callable stop handle with query-local `retry` and `getState`.
The connection owner starts, retries and disposes its own transport. Bindings
stop only their subscriptions.

`observeQuery` accumulates raw rows independently for one observer.
`projectQueryRows` validates/rekeys retained raw rows before projection.
`queryView` derives loading/empty/stale/error state using the binding's last
committed good view. A binding must not publish speculative callbacks or commit
failed projections. There is no shared query cache.

Raw `getKey` is required and must handle sparse deletes. A projection may omit
identity fields or return null to hide a row; hidden raw rows remain available
for updates, deletes and option changes. `postProcess` derives a view, not the raw
set. Failures are typed and scoped; old data stays visibly stale rather than
silently pretending to be live.

For an explicit SSE transport, `SSEClient` requires a `ResultAdapter`.
`readAdaptedResults` validates custom adapter output. `subscribeToQuery` can
combine any structural `QueryStream` with an application-supplied cancellable
snapshot reader. Overlapping snapshots are rejected and retried within bounds;
there is no atomic handoff, ordering cursor or exactly-once guarantee.

## Optional Drasi Server integration

```ts
import { DrasiClient, sse034ResultAdapter } from '@drasi/ui-core/adapters/drasi-server';
```

Only this entrypoint includes Server REST DTOs, instance-scoped resource/URL
validation, query definitions, Server UI links and Server wire defaults.
`DrasiClient` implements `QueryClient` and performs reads only. All resources
must already exist. `DrasiSSEClient` preserves the explicit Server wire-default
convenience; use `SSEClient` for a non-Server wire contract.

Imports and construction perform no network requests. Connect explicitly, inject
appropriate authenticated transports, and disconnect during owner cleanup.
Native EventSource cannot silently honor arbitrary headers or `credentials: omit`.

ESM and CommonJS have separate declarations and source maps. Public types use
standard browser networking types where applicable; no renderer is needed to
install or type-check core. The source repository's
[architecture and compatibility documentation](https://github.com/drasi-project/drasi-ui/tree/main/docs)
defines the complete support and migration contract.
