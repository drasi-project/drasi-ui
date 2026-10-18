# Core client and result reference

[Learn with the React developer guide](../../../react/docs/developer-guide/README.md). This is the co-located lookup reference; edit this file, not its generated package copy.

## Structural client and stream contracts

Import these types and helpers from `@drasi/ui-core`. They do not require a
renderer or a concrete Server class. Owners start, retry, and dispose their
transports; bindings stop only their own subscriptions.

| Contract | Required members |
| --- | --- |
| `QueryConnection` | `getConnectionStatus(): ConnectionStatus`; `onConnectionStatusChange(callback: (status: ConnectionStatus) => void): () => void`, emitting current status immediately and returning listener cleanup. |
| `QueryClient extends QueryConnection` | Optional readonly diagnostic `instanceId?: string`; `subscribe(queryId: string, onResult: (result: QueryResult) => void, onError?: (error: DrasiError) => void, onStateChange?: (state: QuerySubscriptionState) => void): QuerySubscription`. |
| `QuerySubscription` | Callable `(): void` stops one subscription; `.retry(): void` refreshes only that subscription; `.getState(): QuerySubscriptionState` returns its current state. |
| `QuerySubscriptionState` | Readonly `status: Exclude<QueryStatus, 'empty'>`, `stale: boolean`, `error: DrasiError \| null`, `errorScope: 'query' \| 'connection' \| null`. Only the projected view can know whether it is empty. |
| `QueryStream extends QueryConnection` | `isConnected(): boolean`; delta-only `subscribe(queryId, onResult: (result: QueryDelta) => void, onError?): () => void`. A stream alone does not supply snapshots or query-local retry. |
| `ConnectionStatus` | Required `connected: boolean`; optional `reconnecting: boolean`, `error: DrasiError`, `lastConnected: Date`. Open-stream status is not proof of query synchronization. |

Subscription result/state/error callbacks are synchronous. Publish current
scoped subscription state, preserve known typed errors, and stop subscriptions
when the owning client is disposed. Do not return a plain cleanup function
where a `QuerySubscription` is required, or hide asynchronous callback failures.

## Generic SSEClient

`new SSEClient(options: SSEClientOptions)` requires an explicit
`resultAdapter: ResultAdapter`. There is **no Server wire default**.
The remaining optional fields are `eventSourceFactory`, `headers`,
`credentials` (default `same-origin`), `validate`, `errorDetails` (default `{}`),
and flat reconnect fields:
`maxReconnectAttempts` (10), `initialReconnectDelayMs` (1000),
`maxReconnectDelayMs` (30000), and `connectionTimeoutMs` (10000).
Retries are counted after the first attempt; zero retries is allowed.
Delays/timeouts are finite positive numbers. Retry counts are nonnegative integers.

`validate?: (signal: AbortSignal) => Promise<void>` runs before opening and
after opaque stream errors. The owner must bound and cancel it: the open
timer begins after pre-open validation. This stream class has no REST reader,
resource management, instance discovery, initialized flag, or snapshot memory.

| Method | Contract |
| --- | --- |
| `connect(queryIds: string[], endpoint: string, signal?: AbortSignal, maxInitialReconnectAttempts?: number): Promise<void>` | Replaces connection work; resolves when open. The optional safe-integer fourth argument bounds pending-opening retries only. The signal cancels pending opening, not lifetime after success. IDs are not an authorization/membership check at this layer. |
| `subscribe(queryId, onResult, onError?): () => void` | Delta-only subscriber and cleanup, not a full `QuerySubscription`. |
| `getQueryError(queryId): DrasiError \| null` | Retained query-local protocol/callback fault; a valid later batch clears it. |
| `getConnectionStatus(): ConnectionStatus` | Shallow status copy. |
| `onConnectionStatusChange(callback): () => void` | Immediate status plus transitions, with independent listener cleanup. |
| `isConnected(): boolean` | Stream-open status only. |
| `disconnect(): Promise<void>` | Aborts pending work, stops retries, closes stream, publishes disconnected status, and clears subscribers, faults, and listeners. |

The [transport/authentication reference](../adapters/drasi-server/README.md#authentication-and-injected-transports)
specifies `DrasiHeaders`, `DrasiRequestContext`, `EventSourceOptions`, the
synchronous `EventSourceFactory`, and `EventSourceLike`. Those transport
contracts are generic core types; the reference separately identifies Server
REST behavior. Native EventSource cannot honor custom headers or `omit`.
Failed native streams are closed before the library retries; injected
transports must not run a competing reconnect loop.

## subscribeToQuery

`subscribeToQuery(options: SubscriptionOptions, onResult, onError?, onStateChange?)`
returns a `QuerySubscription` and supplies the bounded snapshot/stream
reconciliation below. All option fields are required; callers own policy
validation rather than inheriting implicit Server defaults:

| Option | Type / meaning |
| --- | --- |
| `queryId` | `string`; the subscription's known identity |
| `source` | `QueryStream`; connection observation and normalized deltas |
| `snapshot` | `(signal: AbortSignal) => Promise<ResultRow[]>`; cancellable, bounded, validated snapshot reader |
| `details` | `DrasiErrorDetails`; safe diagnostic context |
| `maxRetries` | Nonnegative retry count after the first snapshot attempt |
| `retryDelay`, `maxRetryDelay` | Positive finite initial and maximum backoff milliseconds |
| `maxPendingChanges` | Positive safe integer bounding changes observed while a snapshot is pending |
| `onStop` | `() => void`; remove this subscription from owner bookkeeping |

Callback types match `QueryClient.subscribe`. Calling the handle stops pending
reads/timers and its stream/status listeners; retry is inert after stop.
It never transforms rows, owns a shared connection, or provisions resources.
The guide's [app-owned client](../../../react/docs/developer-guide/README.md#8-own-a-client-without-drasi-server)
is a complete composition using these contracts.

## Framework-neutral observation and projection

| Helper | Contract |
| --- | --- |
| `initialQueryState(error: DrasiError \| null = null): RawQueryState` | No rows/receipt; initial-loading, or terminal connection error when supplied. |
| `retainQueryBaseline(previous, next): RawQueryState` | Retains previous rows/receipt only if next rows are null. Use only within the same binding scope. |
| `observeQuery(client, queryId, getKey, changed): QueryObservation` | One raw accumulator/subscription; `changed` receives `RawQueryState`. The owner supplies the committed key callback. |
| `QueryObservation` | `getSnapshot(): RawQueryState`, `retry(): void`, `stop(): void`. Stop is idempotent. |
| `projectQueryRows<T>(rows, options, details = {}): QueryProjection<T>` | Rekeys/validates the retained raw set and applies pure transform/postProcess. Returns `{ data: T[] \| null, error: DrasiError \| null }`; failure does not commit a partial projection. |
| `queryView<T>(raw, projection, lastGood, connectionError = null): QueryView<T>` | Derives loading/live/empty/stale/error state, using a previously committed good view on projection failure. It does not commit speculative renders. |

`RawQueryState` has readonly `rows: ResultRow[] | null`,
`lastUpdate: Date | null`, and `state: QuerySubscriptionState`.
`QueryProjectionOptions<T>` requires raw `getKey: RowKey` and
`transform: (row: Readonly<ResultRow>) => T | null`, with optional
`postProcess: (rows: T[]) => T[]`. `AcceptedQueryView<T>` is readonly
`{ data: T[], lastUpdate: Date | null }`. `QueryView<T>` contains `data`,
`status: QueryStatus`, `stale`, `loading`, `error`, `errorScope`, and
`lastUpdate`; the React binding adds its scoped retry function.

### Normalized results and explicit wire adapters

`@drasi/ui-core` (also re-exported by React's `/client`) has one normalized result contract:

| Type | Shape |
| --- | --- |
| `ResultChange<T = ResultRow>` | `{ kind: 'upsert', after: T }`, `{ kind: 'update', before: T, after: T }` or `{ kind: 'delete', before: T }`. |
| `QuerySnapshot<T = ResultRow>` | `{ kind: 'snapshot', queryId, rows: readonly T[], receivedAt: number }`. |
| `QueryDelta<T = ResultRow>` | `{ kind: 'delta', queryId, changes: readonly ResultChange<T>[], receivedAt: number, sourceTimestamp?: number }`. |
| `QueryResult<T = ResultRow>` | `QuerySnapshot<T> \| QueryDelta<T>`. Narrow `kind` before reading `rows` or `changes`. |
| `ResultAdapter` | `(payload: unknown, context: ResultAdapterContext) => readonly QueryDelta[]`. |
| `ResultAdapterContext` | Extends `Readonly<DrasiErrorDetails>` with required read-only `receivedAt: number`; all error-detail fields remain optional. |

Rows crossing the wire boundary must be JSON objects; their fields remain
`unknown`. Adapters are synchronous, and even a custom adapter's normalized
output is validated at runtime. An adapter does not establish an application's
row schema. `receivedAt` and `sourceTimestamp` are display metadata only,
**never** ordering, identity, deduplication or synchronization cursors.
The stream supplies configured safe `errorDetails` in the context; the Server
adapter provides reaction and instance metadata.
New malformed/unroutable unidentified failures retain those reaction details;
identified query failures use query details instead. Existing query-scoped
`DrasiError` objects retain their identity and query. When an adapter failure
lacks a query scope, a recognized raw `queryId` or `query_id` supplies it while
preserving the error code, HTTP status and resource status. This isolates the
failure without restarting the shared stream or changing accepted wire formats.
Without a recognized identity, unscoped/reaction-scoped failures still affect
the connection and retain their existing error details.

A recognized valid query ID remains the error scope when another alias is
malformed, forbidden or conflicts with it. Such a payload still fails
`INVALID_PAYLOAD`; it does not clear healthy queries or restart their shared
stream. This is error attribution, not permission for the strict adapter to
accept `query_id`. Unidentified faults cannot be assigned to a guessed query.

Raw `_deleted` has deletion semantics **only inside the selected legacy
adapter**. In a normalized result or REST row it is an ordinary application
field. `accumulateResult(rows: readonly ResultRow[], result: QueryResult,
getKey: RowKey, details?: DrasiErrorDetails): ResultRow[]` is the exported,
framework-independent raw reducer; `details` defaults to `{}`. Snapshots
replace raw state, same-key
upserts replace idempotently, deletes remove their `before` key, and updates
remove a changed `before` key before storing `after`. Equal-valued rows with
different domain keys remain distinct. There is no serialized-value deduplication.
It returns a new array without changing the input array/rows; key failures
throw before a partial result is returned. It does not transform rows,
subscribe, validate arbitrary wire payloads or reconcile snapshot overlap.
Use the client/adapter boundary for wire validation before this raw reducer.

### Snapshot/stream consistency and limits

Subscriptions attach to the stream **before** starting REST validation/fetch.
Without a cursor shared by REST and SSE, an overlapping delta cannot be safely
ordered relative to that snapshot. If any changes arrive during the pending
read, the client **rejects the ambiguous snapshot and does not replay those
changes**, reports retryable `SNAPSHOT_OVERLAP` and visibly resynchronizes through
a bounded refresh. It never silently labels that overlapping candidate live.

Pending changes are **counted, not stored as row bodies**. Exceeding
`reconciliation.maxPendingChanges` (default **10000**) aborts the pending work
and reports retryable `RESULT_BUFFER_OVERFLOW` with resynchronizing state.
The limit bounds the overlap window, **not** the size of the query result set.
Refresh/reconnect replaces the baseline; it does not merge old results with a
guessed replay. Retries use the existing bounded policy above (ten retries
after the initial attempt by default). Continuous overlap can exhaust it and
leave `terminal-error` with stale last-good rows until explicit retry.

A read with **no known overlap** is only a **best-effort baseline**.
Undetectably delayed events and causality across the two transports remain
limits: there is no atomic, gap-free or exactly-once snapshot/live handoff.
For example, an older SSE change can arrive only after a newer REST baseline
was accepted, temporarily replacing a row with older state despite no observed
overlap. The client cannot detect that delay or automatically label it stale;
explicit query refresh reads a new baseline. This is a tested limitation, not
an out-of-order-event suppression guarantee.
Never order client/server clocks or row signatures to manufacture one.
Stronger semantics require a future **shared snapshot cursor and stream
resume/replay protocol**; this client does not invent backend support.

## Errors and recovery

`new DrasiError(code: DrasiErrorCode, details?: DrasiErrorDetails)` extends
`Error`, sets `name: 'DrasiError'`, chooses a safe message from the code, and
defaults details to `{}`. `code` and `retryable: boolean` are readonly;
retryability is computed from the code, not supplied by the caller.
`DrasiErrorDetails` contains optional `instanceId: string`,
`resourceKind: DrasiResourceKind`, `resourceId: string`,
`resourceStatus: string` and HTTP `status: number`; each is also a readonly
optional field on the error. `DrasiResourceKind` is
`'instance' | 'query' | 'reaction'`.
Render `.message`; discriminate with `instanceof DrasiError` and `.code`.
Safe messages do not include raw server details. Explicit cancellation is the
original abort reason rather than a `DrasiError`.

In the Server adapter, received HTTP status survives successful-response JSON/envelope/body failures
and timeouts after headers, including the outer deadline for injected fetches
that ignore cancellation. A failure before headers does not invent a status.
Application-owned mutation errors are a separate concern; the core client
contract does not authorize or implement those mutations.

| Code | Meaning / appropriate owner action |
| --- | --- |
| `INSTANCE_NOT_FOUND` | Explicit instance is absent. Correct configuration; not query provisioning. |
| `QUERY_NOT_FOUND`, `REACTION_NOT_FOUND` | Structured REST-confirmed absence. Only the owning app may provision allowlisted resources. |
| `RESOURCE_STOPPED` | Stopped/Added resource. Only its owner may start it. |
| `RESOURCE_STARTING` | Starting/Reconfiguring/bootstrap. Retryable, not absent; no duplicate start. |
| `RESOURCE_UNAVAILABLE` | Error/Stopping/Removed; operator attention. |
| `SERVER_UNAVAILABLE`, `STREAM_UNAVAILABLE` | Retryable service/transport failure, **never permission to create**. |
| `UNAUTHENTICATED`, `FORBIDDEN` | Fix credentials/authorization. No automatic auth/provisioning loop. |
| `INVALID_CONFIGURATION`, `INCOMPATIBLE_RESOURCE`, `INVALID_PAYLOAD` | Invalid references/options, wrong reaction contract, redirect or unsupported data. Permanent until corrected. |
| `SNAPSHOT_OVERLAP` | Retryable known snapshot/delta overlap. The ambiguous candidate is discarded; a bounded query-local baseline refresh follows. |
| `RESULT_BUFFER_OVERFLOW` | Retryable pending-change limit exceeded. Abort the pending read and resynchronize; never truncate to a live result. |
| `INVALID_ROW_KEY` | Terminal raw identity failure, including sparse deletes. Fix `getKey`/the query projection; there is no silent fallback. |
| `RESULT_PROCESSING_FAILED` | Terminal transform, post-processing or subscriber failure. Correct the callback and retry as needed. |
| `UNROUTABLE_RESULT` | Terminal missing/failed explicit legacy routing. Fix the adapter/routing policy; do not guess a query by shape. |

`retryable` means another attempt may be useful, not that retry continues
forever. REST 408/429/5xx and network/body timeouts are retryable; 401/403 and
malformed/incompatible data are permanent. Only a structured matching REST 404
establishes absence; proxy HTML/unstructured 404s do not. Native SSE errors
expose no HTTP status, even when the underlying cause is an auth failure.
