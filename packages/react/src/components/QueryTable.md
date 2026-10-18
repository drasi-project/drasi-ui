# QueryTable reference

[Learn with the React developer guide](../../docs/developer-guide/README.md). This is the co-located lookup reference; edit this file, not its generated package copy.

#### Live QueryTable and scoped state slots

`QueryTable<T extends object = ResultRow>` is a small composition of
`useDrasiQuery` and `DataTable<T, DrasiError>`. It requires a provider, `queryId`,
`queryOptions: UseDrasiQueryOptions<T>`, `columns` and `rowKey`. Both raw
`getKey` and validating `transform` remain **required** inside `queryOptions`.
`rowKey` is the separate **transformed** render/animation identity, never a
fallback for raw accumulation. All DataTable presentation/sort props apply
except `rows` and `state`, which the composition owns.

Its four state slots use `QueryTableRenderContext<T>`:
the DataTable context plus the full typed `query: UseDrasiQueryResult<T>` and
`retryConnection: () => void`. Inspect `query.status`, `stale`, `errorScope`,
`lastUpdate` and query-local `retry`, not just `loading`.
`QueryTableErrorContext<T>` additionally guarantees `error: DrasiError`.
`renderHeader` still uses the presentation-only `DataTableHeaderContext`;
it is not a query-state slot. All named contexts and props are exported from
`/components`.

`queryTableState(query, retryConnection)` is an exported **pure adapter** to
`DataTableState<DrasiError>`, shared by QueryTable and Trading. It copies
loading/error/stale, chooses shared retry and `"Retry connection"` only when
`errorScope === 'connection'`, otherwise query-local retry and `"Retry query"`.
Its stale message is `"Reconnecting. Showing last known data."` for
`status === 'reconnecting'`, otherwise `"Resynchronizing. Showing last known data."`.
Only exceptional states show these notices; available last-good rows remain.

This component belongs beneath the [quickstart provider](../adapters/drasi-server/README.md#quickstart). The error slot below
keeps P4 state and explicitly selects the correct recovery scope; using
`state.retry` would make the same choice.

```tsx
// @drasi-docs: query-states.tsx
import { QueryTable } from '@drasi/react/components';
import type { UseDrasiQueryOptions } from '@drasi/react/react';
import '@drasi/react/styles.css';

interface Reading { id: string; value: number }
const options: UseDrasiQueryOptions<Reading> = {
  getKey: raw => {
    if (typeof raw.id !== 'string' || !raw.id) throw new Error('Expected a stable reading ID');
    return raw.id;
  },
  transform: raw => {
    if (typeof raw.id !== 'string' || typeof raw.value !== 'number') {
      throw new Error('Expected a Reading');
    }
    return { id: raw.id, value: raw.value };
  },
};

export function ReadingsWithState() {
  return <QueryTable<Reading>
    queryId="readings" queryOptions={options} rowKey={row => row.id}
    columns={[{ key: 'id', label: 'Sensor' }, { key: 'value', label: 'Value' }]}
    renderLoading={({ query }) => <p role="status">{query.status}: waiting for a baseline</p>}
    renderEmpty={() => <span>No readings in this view.</span>}
    renderError={({ error, query, state, retryConnection }) => {
      const retry = query.errorScope === 'connection' ? retryConnection : query.retry;
      return <div role="alert">
        <p>{error.code}: {error.message}</p>
        {query.stale && <p>Showing last known data.</p>}
        <button type="button" onClick={retry}>{state.retryLabel}</button>
      </div>;
    }}
    renderStale={({ query, rows, state }) => <p role="status">
      {state.staleMessage} {rows?.length ?? 0} rows.
      {query.lastUpdate && <> Last update: {query.lastUpdate.toISOString()}</>}
    </p>}
  />;
}
```

#### App-owned composition

For multiple presentations of the same query, own **one** query subscription,
sort controller and animation tracker, then pass their state to DataTable.
`useRowAnimation<T>(options: UseRowAnimationOptions<T>): UseRowAnimationResult<T>`
is provider-free and tracks application rows, not raw query identities:

| Animation option/result | Contract |
| --- | --- |
| `rowKey: (row: T) => string` | Required stable, unique render/animation identity; must match the consuming table's `rowKey`. |
| `getValue: (row: T) => number \| string \| undefined` | Required tracked value; `undefined` supplies no comparable baseline for that row. This is not a query transform. |
| `animationDuration?: number` | **500** ms until decoration state expires after the latest change. This does not change the stylesheet's duration; supply a suitable finite nonnegative duration for your own tracker. |
| `data?: readonly T[] \| null` | Optional automatic updates after rendering. Null/undefined retains the previous baseline; an empty array clears tracking and timers. |
| `animations: Map<string, AnimationDirection>` | Current animation entries, initially empty; treat this returned state as read-only. Supply it as `rowAnimations` to share it across presentations. |
| `revisions: ReadonlyMap<string, number>` | Opaque restart tokens, including repeated changes in the same direction. Share as `rowAnimationRevisions`; not row keys or persistent counters. |
| `updateData: (data: readonly T[]) => void` | Manual tracking update for owners that do not supply `data`. It updates animation state, not query rows. |
| `AnimationDirection` | `'up' \| 'down' \| 'change' \| null`. Numeric increases/decreases select up/down; other unequal defined string/number pairs select change. Null or an absent map entry means no animation. |

The first observed value does not animate. Later changes reset that row's
timer; removed rows lose their entries/timers, and unmount clears timers.
Reduced motion cancels active entries while retaining the latest baseline.
The hook returns state, not markup or CSS; only a consuming presentation maps
directions to classes. See [reduced motion](../react/README.md#reduced-motion) for live preference
changes. Share both maps to avoid each presentation tracking its own changes.

`animations` retains the direction map; `revisions: ReadonlyMap<string, number>`
adds opaque per-row restart tokens for relevant changes, even in the same
direction. Unchanged tracked values preserve both maps.
Tokens are removed with their decoration on expiry, row removal, empty input or
reduced motion. A single per-hook scalar in React state survives that cleanup;
there is no history of deleted rows, and token values are not persistent counters
or React keys. Expiry and reactivation coalesced into one React batch therefore
still have different decoration identities. The renderer retains its last active
phase across inactive commits, even when the browser has not painted between
them, while preserving the first activation's original phase. The lifetime
restarts after the latest change; updates stopping means the decoration expires,
not an endless animation. The built-in stylesheet retains its 500ms
ease-in-out pulse and original theme colors, alternating equivalent keyframes
without replacing DOM rows, losing cell state/focus or forcing layout. The hook's
custom `animationDuration` controls state expiry, not the stylesheet duration.

```tsx
// @drasi-docs: composed-table.tsx
import { DataTable, queryTableState, type ColumnDef } from '@drasi/react/components';
import { useDrasiClient, useDrasiQuery, useRowAnimation, useTableSort, type UseDrasiQueryOptions } from '@drasi/react/react';
import type { DrasiError } from '@drasi/ui-core';
import '@drasi/react/styles.css';

interface Reading { id: string; value: number }
const rowKey = (row: Reading) => row.id;
const getValue = (row: Reading) => row.value;
const columns: readonly ColumnDef<Reading>[] = [
  { key: 'id', label: 'Sensor' }, { key: 'value', label: 'Value' },
];

export function ReadingViews({ queryId, queryOptions, showAlternate = false }: {
  queryId: string;
  queryOptions: UseDrasiQueryOptions<Reading>;
  showAlternate?: boolean;
}) {
  const query = useDrasiQuery(queryId, queryOptions);
  const { retry: retryConnection } = useDrasiClient();
  const sorting = useTableSort({ defaultSort: { column: 'value', direction: 'desc' } });
  const { animations, revisions } = useRowAnimation({ data: query.data, rowKey, getValue });
  const presentation = {
    rows: query.data, columns, rowKey,
    state: queryTableState(query, retryConnection),
    sort: sorting.sort, onSortChange: sorting.setSort,
    rowAnimations: animations, rowAnimationRevisions: revisions,
  };
  return <>
    <DataTable<Reading, DrasiError> {...presentation} title="Readings" />
    {showAlternate && <DataTable<Reading, DrasiError>
      {...presentation} title="Alternate view"
      headerControls={<button type="button" onClick={() => sorting.setSort(null)}>Input order</button>}
    />}
  </>;
}
```

Trading uses this pattern in its app-owned `TradingQueryTable` for normal and
fullscreen cards. Its `QueryInspector`/`CodeViewerDialog`, query formatting,
snippets and UI links are **not package exports**. An app may opt into
`useDrasiQueryDefinition` by mounting an inspector only after a code click
with a snippet. Trading unmounts it on close (aborting the optional GET).
For the inspector's own read failure, **Retry query definition** rekeys just
that read, not the query subscription or socket. If its non-null error is the
**same object** as `useDrasiClient().error`, the inspector instead offers
**Retry connection** through the provider's retry callback. Matching error
codes/messages alone does not select shared recovery. This is app-owned
composition, not a new package API. Async definition results update an
already-open code view and copy action.
Plain QueryTable/DataTable and closed inspectors perform no tutorial reads.
Required initialization and subscription resource-validation GETs still run
for live queries; removing tutorial coupling does not remove those checks.

Generic `CodeIcon`, `ExpandIcon` and `CollapseIcon` remain optional exports;
each accepts only optional `className?: string`, defaulting to `'drasi-icon'`.
Their SVGs are decorative (`aria-hidden`, not focusable); name the containing
button. There is no exported `IconProps` type, click handler, inspection or
fullscreen behavior attached to an icon. CSS remains namespaced,
package-owned and an **explicit** import; consumers do not need Tailwind.
P5 left CSS byte-for-byte unchanged. P6 adds the generic modal, scoped theme
fallbacks, keyboard semantics, reduced motion and explicit sizing described
below; Trading's code-viewer CSS now belongs to the app.
No pagination, selection or virtualization is provided.
