# React binding and hook reference

[Learn with the React developer guide](../../docs/developer-guide/README.md). This is the co-located lookup reference; edit this file, not its generated package copy.

### Hooks, raw identity and derived views

| Hook | Named result |
| --- | --- |
| `useDrasiClient()` | `DrasiContextValue`: `{ client, initialized, error, retry }`. |
| `useDrasiQuery<T extends object = ResultRow>(queryId, options)` | `UseDrasiQueryResult<T>`: `{ data: T[] \| null, status, stale, loading, error, errorScope, lastUpdate: Date \| null, retry }`. **Options are required.** |
| `useDrasiConnectionStatus()` | `ConnectionStatus`: `connected`, optional `reconnecting`, `DrasiError`, `lastConnected`. A socket opening does not prove query synchronization. |
| `useRowAnimation(options)` | `UseRowAnimationResult`; exported `AnimationDirection` and `UseRowAnimationOptions`. |
| `useTableSort(options?)` | `UseTableSortResult`: `{ sort, setSort, toggleSort }`; provider-free, with `UseTableSortOptions` and `SortConfig`. See [sorting](../components/DataTable.md#sorting). |
| `useReducedMotion()` | Live boolean for `prefers-reduced-motion: reduce`; `false` during SSR or without `matchMedia`. Provider-free; see [reduced motion](#reduced-motion). |

The three generic Drasi hooks require a `DrasiClientProvider` binding
(also supplied by the optional `DrasiProvider`);
calling them outside either throws an ordinary provider-usage `Error`.
Sorting, animation and motion hooks do not require a provider.
Server-only definition/UI inspection requires the separate
[Server binding](../adapters/drasi-server/README.md#inspection-and-app-owned-server-clients).

`DrasiContextValue` has four required fields: `client: QueryClient | null`,
`initialized: boolean`, `error: DrasiError | null`, and `retry: () => void`.
The initial provider state has no initialized client; invalid configuration may
leave `client` null. `error` describes shared initialization/connection failure,
not an individual query's projection failure. The controlled binding's `value`
must supply all four fields; its React children are application-owned.

`ConnectionStatus` starts with `connected: false`. `connected: boolean` means
the stream is open; optional `reconnecting: boolean` means the shared
connection is recovering, and optional `error: DrasiError` carries its failure.
Optional `lastConnected: Date` is the local time of a successful open, not a
server cursor; it need not remain present in a later disconnected status.

All Drasi provider/query hooks preserve `DrasiError` objects, not just messages.
`UseDrasiQueryOptions<T extends object = ResultRow>` requires both:

- `getKey: RowKey`, where `RowKey = (raw: Readonly<ResultRow>) => string`.
  Return a **nonempty stable domain identity** from the raw row, including
  sparse deletes and both sides of updates. Identity is extracted **before**
  transformation. There is no `id`, `symbol`, serialization or table-key fallback.
  Invalid/throwing key extraction is visible as `INVALID_ROW_KEY`, not a skip.
- `transform: (raw: Readonly<ResultRow>) => T | null`. Validate unknown fields
  to produce a typed object; use `row => row` for raw reads. **Deletes never run
  through this transform.** Returning `null` hides an identity from the derived
  view but retains its raw row for later updates and option changes.

Optional `postProcess: (rows: T[]) => T[]` is a pure derived sort/filter; it
does not remove or mutate the accumulated raw state. All three options reproject
retained rows reactively without a new socket or subscription. Keep callbacks
pure and do not mutate their read-only raw input.

Active stream batches use the **latest committed `getKey`**, never a callback
from a suspended or abandoned render. During a `startTransition` that suspends,
the current view and its subscription keep their committed identity policy.
A successful option commit publishes that key before consumer layout effects
can deliver events; committed transforms and post-processing still reproject
retained rows without reconnecting. This commit-only publication performs no
browser-global detection or server-rendering layout effect.

```ts
// @drasi-docs: query-options.ts
import { useDrasiQuery, type UseDrasiQueryOptions } from '@drasi/react/react';
import type { RowKey } from '@drasi/ui-core';

interface Reading { device: string; value: number }
const readingKey: RowKey = raw => {
  if (typeof raw.device !== 'string' || !raw.device) throw new Error('Expected a stable device ID');
  return raw.device;
};

export const readingOptions: UseDrasiQueryOptions<Reading> = {
  getKey: readingKey,
  transform: row => {
    if (typeof row.device !== 'string' || typeof row.value !== 'number') {
      throw new Error('Expected a Reading');
    }
    return { device: row.device, value: row.value };
  },
  postProcess: rows => [...rows].sort((a, b) => b.value - a.value),
};

export const rawReadingOptions: UseDrasiQueryOptions = {
  getKey: readingKey,
  transform: row => row,
};

export function useReadings() {
  return useDrasiQuery<Reading>('readings', readingOptions);
}
```

A generic alone is not validation and cannot replace `transform`. Transform
or post-processing failures become `RESULT_PROCESSING_FAILED`; existing
`DrasiError` instances retain their identity. Invalid keys are not hidden by
a transform returning `null`.

This deterministic reducer example projects away the raw `deviceId` field and
then removes that row using a **sparse identity-only delete**. The transform
requires a value on current rows, not on delete records. For a table, use
`queryOptions={readingViewOptions}` and the separate
`rowKey={readingViewKey}`; a render key cannot repair a missing raw key.

```ts
// @drasi-docs: raw-identity.ts
import { accumulateResult, type QueryResult, type ResultRow, type RowKey } from '@drasi/ui-core';
import type { UseDrasiQueryOptions } from '@drasi/react/react';

interface ReadingView { renderId: string; value: number }
const rawKey: RowKey = raw => {
  if (typeof raw.deviceId !== 'string' || !raw.deviceId) {
    throw new Error('Expected a stable device ID');
  }
  return raw.deviceId;
};

export const readingViewOptions: UseDrasiQueryOptions<ReadingView> = {
  getKey: rawKey,
  transform: raw => {
    const deviceId = rawKey(raw);
    if (typeof raw.value !== 'number' || !Number.isFinite(raw.value)) {
      throw new Error('Expected a finite reading');
    }
    return { renderId: `sensor:${deviceId}`, value: raw.value };
  },
};
export const readingViewKey = (row: ReadingView) => row.renderId;

function project(rows: readonly ResultRow[]): ReadingView[] {
  return rows.flatMap(raw => {
    const view = readingViewOptions.transform(raw);
    return view === null ? [] : [view];
  });
}

export function sparseDeleteExample() {
  const snapshot: QueryResult = {
    kind: 'snapshot', queryId: 'readings', receivedAt: 0,
    rows: [{ deviceId: 'freezer-1', value: -18 }],
  };
  const deletion: QueryResult = {
    kind: 'delta', queryId: 'readings', receivedAt: 1,
    changes: [{ kind: 'delete', before: { deviceId: 'freezer-1' } }],
  };
  const rawRows = accumulateResult([], snapshot, rawKey);
  const beforeDelete = project(rawRows);
  const afterDelete = project(accumulateResult(rawRows, deletion, rawKey));
  return { beforeDelete, afterDelete };
}
```

`beforeDelete` contains `{ renderId: 'sensor:freezer-1', value: -18 }`;
`afterDelete` is empty. Neither the raw reducer nor the hook transforms the
delete's `before` row. The example's receipt values are display metadata, not
the reason the delete applies.

`QueryStatus` describes the query, not merely the shared socket:

| `status` | Meaning |
| --- | --- |
| `initial-loading` | No accepted baseline yet. |
| `live` | A best-effort baseline was accepted and subsequent changes are being applied; **not** proof of gap-free synchronization. |
| `empty` | That baseline's current projected view is empty, possibly because transforms/filters hide rows. |
| `reconnecting` | Waiting on the shared stream; any last-good rows are stale. |
| `resynchronizing` | Reading/retrying a fresh REST baseline, including known-overlap recovery. |
| `stale-last-good-data` | A transient query refresh failure left useful last-good rows while recovery continues. |
| `terminal-error` | A permanent fault or exhausted retry budget; correction and explicit retry are needed. Last-good rows may still be available. |

`errorScope: QueryErrorScope | null` is `'query'`, `'connection'` or `null`.
`stale`, `data` and `lastUpdate` let a UI retain and label useful last-good data
during recovery or failure. `lastUpdate` is display metadata, not a server
watermark. `loading` is not a complete synchronization state: inspect `status`
and `stale`. Specifically, `loading` is true only with no data, no error and
no terminal state; `stale` is true when retained data exists outside `live` or
`empty`. `data: null` means no usable view yet, while `[]` is an accepted empty
view. `lastUpdate: Date | null` records the last accepted result's local receipt
time. Query-local `retry: () => void` returns immediately; watch the state for
its result, not a returned promise.

Per-query processing and subscription REST failures are isolated
while the shared transport remains healthy. In the Server integration this is
**not whole-connection fault isolation**: initial validation and shared
reconnection revalidate **all configured query references** and the reaction. A reference
failure during that shared validation can block the shared connection and
affect every subscription. Malformed unidentifiable/protocol failures can also
terminate the shared stream.

### Subscriber state and computation cost

One provider multiplexes **one SSE connection**, not one shared query cache.
Each `useDrasiQuery` call independently fetches its baseline, reconciles
overlap/recovery, accumulates raw rows and derives its view. Two hooks or two
`QueryTable`s with the same query ID still mean two subscriptions with their
own REST reads, state, memory and projection work.

Accepted updates rekey/project the retained set; a small delta does not imply
that only one row is transformed or rendered. Sparse delete payloads are
handled by raw identity, never passed to `transform`; remaining current rows
can still be reprojected. A `null` transform hides a row but retains its raw
identity/data. `postProcess` is a derived view, not a raw-state eviction policy:
filtering or slicing visible rows does not bound retained memory.

Keep `getKey`, `transform` and `postProcess` pure. Keep their references stable
when their semantics have not changed, with correct closure dependencies;
do not hide changing semantics behind stale callbacks. Committed callback
changes reproject retained rows without resubscription, while abandoned renders
cannot replace the active ingestion key. The raw `getKey` and transformed
table `rowKey` remain separate contracts.

For shared data, [hoist one query hook](../components/QueryTable.md#app-owned-composition) and pass its
result to multiple presentations rather than mounting extra `QueryTable`s.
Share both animation direction and revision maps when using `useRowAnimation`.
This reduces duplicate subscriber work without introducing a cache API.

For larger or faster feeds, use supported operator-owned query features
such as `WHERE`, selective `RETURN` projections and supported aggregations
(for example `sum`/`count`) to reduce upstream result volume where appropriate.
Measure representative snapshot row counts, visible versus filtered rows,
update burst size/rate, memory, snapshot/retry frequency, and projection,
React render and layout time on your actual target devices. Browser performance
tools and React profiling can separate transformation cost from rendering;
avoid logging row contents or credentials while measuring.

There is no built-in virtualization or large/high-rate throughput guarantee.
`maxPendingChanges` bounds observed overlap during a pending snapshot, **not**
result-set rows or memory for accepted data. These choices do not strengthen
the [best-effort snapshot/live contract](../../../core/src/client/README.md#snapshotstream-consistency-and-limits):
there is no shared REST/SSE cursor, and delayed older events can still require
an explicit refresh. Measure against your application's latency/memory needs,
not an invented universal row limit or benchmark.

#### Hooks-only UI and scoped retry

This is a live query consumer, not a presentation mock. It uses the same
`readings` / `events` resources as the quickstart, but only `/react` imports
from this package and native semantic markup: no `QueryTable`, `DataTable`,
`Modal` or package stylesheet. The app owns layout, formatting and notices.
It distinguishes a query-local refresh (also useful for the delayed-event
limit below) from shared connection recovery, and keeps available stale rows.

```tsx
// @drasi-docs: hooks-only.tsx
import { DrasiProvider } from '@drasi/react/adapters/drasi-server';
import { useDrasiClient, useDrasiConnectionStatus, useDrasiQuery, type UseDrasiQueryOptions } from '@drasi/react/react';

interface Reading { id: string; value: number }
const options: UseDrasiQueryOptions<Reading> = {
  getKey: raw => {
    if (typeof raw.id !== 'string' || !raw.id) throw new Error('Expected a stable reading ID');
    return raw.id;
  },
  transform: raw => {
    if (typeof raw.id !== 'string' || typeof raw.value !== 'number' || !Number.isFinite(raw.value)) {
      throw new Error('Expected a Reading');
    }
    return { id: raw.id, value: raw.value };
  },
};

function ReadingList() {
  const query = useDrasiQuery('readings', options);
  const connection = useDrasiConnectionStatus();
  const { initialized, retry: retryConnection } = useDrasiClient();
  const sharedFailure = query.errorScope === 'connection';
  return <section aria-label="Reading monitor">
    <h2>Reading monitor</h2>
    <p role="status">
      Stream: {connection.connected ? 'open' : 'not open'}. Query: {query.status}.
    </p>
    {query.error && <div role="alert">
      <p>{query.error.code}: {query.error.message}</p>
      <button type="button" onClick={sharedFailure ? retryConnection : query.retry}>
        {sharedFailure ? 'Retry connection' : 'Retry query'}
      </button>
    </div>}
    {query.loading && <p role="status">Waiting for a baseline.</p>}
    {query.stale && <p role="status">Showing last known readings while recovery is needed.</p>}
    <button
      type="button" onClick={query.retry}
      disabled={!initialized || !connection.connected}
    >Refresh query</button>
    {query.lastUpdate && <p>
      Last received: <time dateTime={query.lastUpdate.toISOString()}>
        {query.lastUpdate.toISOString()}
      </time>
    </p>}
    {query.data !== null && <table>
      <caption>Readings</caption>
      <thead><tr><th scope="col">Sensor</th><th scope="col">Value</th></tr></thead>
      <tbody>{query.data.length === 0
        ? <tr><td colSpan={2}>No readings in this view.</td></tr>
        : query.data.map(row => <tr key={row.id}>
          <th scope="row">{row.id}</th><td>{row.value.toFixed(2)}</td>
        </tr>)}</tbody>
    </table>}
  </section>;
}

export function HooksOnlyApp({ serverUrl, instanceId, endpoint }: {
  serverUrl: string; instanceId: string; endpoint: string;
}) {
  return <DrasiProvider
    serverUrl={serverUrl} instanceId={instanceId}
    queryIds={['readings']} reaction={{ id: 'events', endpoint }}
  >
    <ReadingList />
  </DrasiProvider>;
}
```

Do not refresh the whole provider after every query failure. Conversely,
query-local retry cannot open a failed shared socket. Custom live cell
announcement policy, styling and keyboard scrolling remain application work;
the headless hooks do not silently add them.

#### Reduced motion

`useReducedMotion(): boolean` is exported by `/react` and root, with no
component, Radix, React DOM or CSS dependency in the hook entrypoint. It
subscribes to live `prefers-reduced-motion: reduce` changes. SSR and hosts
without `matchMedia` report `false`; that SSR value is not a claim about the
user's eventual preference.

`useRowAnimation` automatically clears active timers, directions and restart
tokens when reduced motion becomes active and keeps tracking the latest row baseline. DataTable
also suppresses controlled `rowAnimations` and passes `null` animation to
custom row renderers in this mode. The stylesheet disables package animations,
transitions and smooth scrolling under the same media query. Rows, sorting,
errors and live state updates never wait for a transition-end event.

Custom application motion remains the application's responsibility. Trading
keeps its default **350ms** FLIP expansion/collapse; reduced motion completes
it immediately without animation frames or transition timers, including when
the preference changes mid-transition. This does not delay query data updates.

The following headless recipe imports no package UI or stylesheet:

```tsx
// @drasi-docs: reduced-motion.tsx
import { useReducedMotion, useRowAnimation } from '@drasi/react/react';

interface Delivery { id: string; parcels: number }
const rowKey = (row: Delivery) => row.id;
const getValue = (row: Delivery) => row.parcels;

export function DeliveryCounts({ rows }: { rows: readonly Delivery[] }) {
  const reducedMotion = useReducedMotion();
  const { animations } = useRowAnimation({ data: rows, rowKey, getValue });
  return <ul>{rows.map(row => <li
    key={row.id}
    style={{
      transition: reducedMotion ? 'none' : 'background-color 150ms',
      backgroundColor: reducedMotion || !animations.has(row.id) ? 'transparent' : '#e0f2fe',
    }}
  >{row.id}: {row.parcels} parcels</li>)}</ul>;
}
```

## App-owned binding recipe

```tsx
// @drasi-docs: controlled.tsx
import type { ReactNode } from 'react';
import { DrasiClientProvider, type DrasiContextValue } from '@drasi/react/react';

export function AppOwnedBinding({ value, children }: {
  value: DrasiContextValue;
  children: ReactNode;
}) {
  return <DrasiClientProvider value={value}>{children}</DrasiClientProvider>;
}
```
