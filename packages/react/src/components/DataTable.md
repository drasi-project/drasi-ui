# DataTable reference

[Learn with the React developer guide](../../docs/developer-guide/README.md). This is the co-located lookup reference; edit this file, not its generated package copy.

#### Provider-free DataTable

`DataTable<T extends object, E extends Error = Error>` renders supplied rows.
It does not read resources, subscribe, inspect definitions, require a Drasi
provider or own an overlay. Non-Drasi data and ordinary application errors are
supported. `DataTableProps` defaults `T` to `Record<string, unknown>`.

See the [first provider-free table](../../docs/developer-guide/README.md#1-run-your-first-screen) for a complete copyable example.

All presentation props are optional except the first three:

| `DataTableProps<T, E>` prop | Default / callback contract |
| --- | --- |
| `rows: readonly T[] \| null` | Required. `null` means no accepted baseline; `[]` is an accepted empty view. Supplied arrays are never sorted in place or otherwise mutated. |
| `columns: readonly ColumnDef<T>[]` | Required ordered column definitions, never mutated. |
| `rowKey: (row: T) => string` | Required stable render/animation identity. Use domain keys, not array positions. This is not raw query accumulation identity. |
| `state?: DataTableState<E>` | `{}`; presentation-only loading/error/stale/retry state, described below. |
| `sort`, `defaultSort`, `onSortChange` | Same contract as `useTableSort`; initially unsorted unless a sort is provided. See [sorting](#sorting). |
| `title?: string` | No title by default. |
| `ariaLabel?: string` | Accessible name on `<table>`; defaults to `title`. Supply a meaningful name when there is no visible title. |
| `headerActions?: ReactNode` | Content beside the title on the left. |
| `headerControls?: ReactNode` | Content on the right; no built-in code-view/fullscreen controls. |
| `headerSlot?: ReactNode` | Content below the header, above the table. |
| `renderHeader?: (context: DataTableHeaderContext<T, E>) => ReactNode` | Replaces the header. Call `context.defaultRender()` to wrap/augment the default title/actions/controls; return `null` to omit it. |
| `actions?: readonly RowAction<T>[]` | No actions by default. Nonempty actions add one trailing column. |
| `actionsWidth?: string` | Optional CSS width of the actions heading. |
| `animateOnChange?: keyof T` | Disabled by default. Track the named row property; numbers animate up/down and changed strings animate `change`. Reduced motion suppresses these animations. |
| `rowAnimations?: ReadonlyMap<string, AnimationDirection>` | Optional owner-supplied animation state keyed by `rowKey`; takes precedence over `animateOnChange`, including an empty map. Reduced motion also suppresses this controlled map's presentation. |
| `rowAnimationRevisions?: ReadonlyMap<string, number>` | Optional restart tokens for controlled `rowAnimations`. Pass `useRowAnimation().revisions` to restart repeated same-direction decoration. Changed tokens are compared with `Object.is`, including skipped/batched revisions; they never replace `rowKey`. Without tokens, controlled decoration restarts only when its direction changes or is cleared and reapplied. |
| `renderRow?: (row, columns, animation, defaultRender) => ReactNode` | Replaces one row's rendering. `row` is `T`, `columns` is readonly, and `animation` is `'up' \| 'down' \| 'change' \| null`. Return a `<tr>` or a fragment of table rows, or call `defaultRender()` for the built-in `<tr>`. A parent fragment already owns the stable `rowKey`; wrappers need not invent an index key. |
| `emptyMessage?: string` | `"No data available"`; `renderEmpty` takes precedence. |
| `renderLoading`, `renderEmpty`, `renderError`, `renderStale` | Optional state slots; details below. A slot returning `null` suppresses its default rather than falling back. |
| `className?: string`, `style?: CSSProperties` | Additional card class and inline styles. |
| `containerRef?: Ref<HTMLDivElement>` | Ref to the card for app-owned layout/composition. |
| `tableClassName?: string` | Additional class on the named, focusable **scroll-container** region, not on `<table>`. Preserve scrolling and focus visibility when overriding it. |
| `headerClassName?: string` | Additional `<thead>` class; individual headings use `ColumnDef.headerClassName`. |
| `titleClassName?: string` | Additional normal-header title class. |
| `headerSlotClassName?: string` | Additional wrapper class for `headerSlot`. |
| `rowClassName?: string \| ((row: T, index: number) => string)` | Additional class on the default row; `index` is its position in the sorted view. |
| `height?: TableHeight` | Finite nonnegative pixel number, explicit CSS length/percentage, `'0'`, `'auto'` or custom-property reference. Overrides `style.height`. Omitted: respect `style.height`, then inherited `--drasi-table-height`, then `400px`. See [table sizing](#table-sizing). |

`DataTableState<E>` has no connection/query semantics:

| Field | Default / meaning |
| --- | --- |
| `loading?: boolean` | Not loading unless true. |
| `error?: E \| null` | No error unless supplied. Any `Error` subtype is supported, not only `DrasiError`. |
| `stale?: boolean` | Marks supplied data as last-known rather than current. |
| `retry?: () => void` | App-chosen recovery; omitted means no default retry button. |
| `retryLabel?: string` | `"Retry"` on the default error button. |
| `staleMessage?: string` | `"Showing last known data."` for the default stale notice. |

Notice precedence is **error > stale > loading**; lower-priority slots do not
run. An error's default notice also says "Showing last known data." when stale.
When `rows === null` and error or loading is set, the component shows a state
card with the optional title and selected notice, not a table or normal
header/header slot. Supplied rows, including `[]`, always retain the table.
Without that state-card condition, `null` and `[]` use the empty cell; neither
is silently converted into invented data.

`DataTableRenderContext<T, E>` contains
`{ rows: readonly T[] | null, state: DataTableState<E>, sort: SortConfig | null,
setSort: (next: SortConfig | null) => void }`. `rows` is the **sorted view**.
Loading, empty and stale slots receive that context. `renderError` receives
`DataTableErrorContext<T, E>` with an additional **guaranteed `error: E`**.
`renderHeader` receives `DataTableHeaderContext<T, E>` with `defaultRender`.
`renderEmpty` runs **inside one spanning `<td>`**: return cell content, not a
`<tr>` or another `<td>`. These presentation callbacks never receive a client.

#### Columns and actions

`ColumnDef<T>` supports computed string keys, so its raw cell argument is
`unknown`, not an asserted property type. Use the typed row or narrow the value.

| Column field | Default / meaning |
| --- | --- |
| `key: keyof T \| string`, `label: string` | Required property/computed key and heading text. |
| `format?: (value: unknown, row: T) => ReactNode` | Default: nullish values render `"-"`, otherwise `String(value)`. Computed labels do not create a sortable row property. |
| `sortable?: boolean` | `true`; `false` disables that heading's sort interaction. |
| `align?: 'left' \| 'center' \| 'right'` | Explicit alignment applies to header and body. Omitted: header left, body inherits host alignment. |
| `className?: string \| ((value: unknown, row: T) => string)` | Additional cell class. |
| `headerClassName?: string` | Additional heading class. |
| `width?: string` | Optional CSS width of the heading. |

`RowAction<T>` requires `icon: ReactNode`, `label: string` and
`onClick: (row: T) => void`. The label supplies the button's accessible name
and title. Optional `disabled(row)` and `loading(row)` return booleans and
default to false; either disables the button and prevents its click callback.
Loading sets `aria-busy="true"` and shows the spinner instead of the icon.
The action column has a visually hidden **Actions** heading. Optional `className`
and `hoverClassName` customize the button; the hover class applies only when
enabled and not loading.

The owner below supplies data, pending-action state and recovery; no Drasi
provider or resource mutation is involved. Dispatch is an application
callback, not a package API. State slots preserve their roles and last-good
notice, the custom header keeps the default controls, and `renderEmpty`
returns **cell content**.

```tsx
// @drasi-docs: actions-slots.tsx
import {
  DataTable, type ColumnDef, type DataTableState, type RowAction,
} from '@drasi/react/components';
import '@drasi/react/styles.css';

interface Delivery { id: string; parcels: number; locked: boolean }
const columns: readonly ColumnDef<Delivery>[] = [
  { key: 'id', label: 'Delivery' },
  { key: 'parcels', label: 'Parcels', align: 'right' },
];

export function DeliveryActions({ rows, state = {}, pendingId, onDispatch }: {
  rows: readonly Delivery[] | null;
  state?: DataTableState;
  pendingId?: string;
  onDispatch: (row: Delivery) => void;
}) {
  const actions: readonly RowAction<Delivery>[] = [{
    icon: <span aria-hidden="true">↗</span>,
    label: 'Dispatch delivery',
    onClick: onDispatch,
    disabled: row => row.locked,
    loading: row => row.id === pendingId,
  }];
  return <DataTable<Delivery>
    rows={rows} columns={columns} rowKey={row => row.id} title="Dispatch queue"
    state={state} actions={actions} actionsWidth="6rem"
    headerSlot={<p>Locked deliveries cannot be dispatched.</p>}
    renderHeader={({ defaultRender, setSort }) => <>
      {defaultRender()}
      <button type="button" onClick={() => setSort(null)}>Input order</button>
    </>}
    renderLoading={() => <p role="status">Loading deliveries.</p>}
    renderEmpty={() => <span>No deliveries in this view.</span>}
    renderError={({ error, state: current }) => <div role="alert">
      <p>{error.message}</p>
      {current.stale && <p>Showing last known deliveries.</p>}
      {current.retry && <button type="button" onClick={current.retry}>
        {current.retryLabel ?? 'Retry'}
      </button>}
    </div>}
    renderStale={({ rows: visible, state: current }) => <p role="status">
      {current.staleMessage ?? 'Showing last known deliveries.'}
      {' '}{visible?.length ?? 0} deliveries.
    </p>}
  />;
}
```

The owner catches asynchronous action failures and updates `pendingId` and
`state`; `onClick` is a void callback, not an awaited mutation or automatic
loading controller. Supplying `state.retry` chooses application recovery.
For live query state use the [scoped QueryTable slots](QueryTable.md#live-querytable-and-scoped-state-slots)
or `queryTableState`, rather than treating every error as shared recovery.

#### Sorting

`useTableSort(options?: UseTableSortOptions)` is a provider-free headless
controller exported by `/react`. Both `DataTable` and Trading's two table
presentations use this same controller. `SortConfig` is
`{ column: string, direction: 'asc' | 'desc' }`, exported by **both** `/react`
and `/components`.

| Option/result | Contract |
| --- | --- |
| `sort?: SortConfig \| null` | Defined, including `null`, means controlled. `undefined` means uncontrolled. Controlled owners must apply requested changes. |
| `defaultSort?: SortConfig \| null` | `null`; read once on mount for stored uncontrolled state, ignored for the displayed sort while controlled. Later prop changes do not reset that stored value. |
| `onSortChange?: (next: SortConfig \| null) => void` | One notification per `setSort`/`toggleSort` call or sortable-header user action, even under StrictMode. Runs outside the state updater; prop changes do not notify. |
| Returned `sort` | Effective `SortConfig \| null`. Controlled state takes precedence. Returning to uncontrolled restores its stored state; controlled changes do not overwrite it. |
| Returned `setSort(next)` | Requests a config or `null`. Explicit `null` clears sorting to input order. |
| Returned `toggleSort(column)` | New column starts ascending; active column toggles ascending/descending. It does **not** cycle automatically through a third, unsorted state. |

The hook controls state, not row comparison. Ascending `DataTable` ordering is:
JavaScript numbers numerically (including infinities, with NaN after other
numbers), then other non-nullish values by `String(value)`, then null/undefined.
Numeric strings are not coerced. Text uses the shared fixed
`Intl.Collator('en-US', { sensitivity: 'variant', numeric: false })` policy,
not the environment's default locale. Descending reverses this ordering,
including putting nullish values first. Equal keys, -0/0, NaNs and nullish ties
preserve input order. Readonly rows are copied; `sort={null}` restores input order.

SSR and hydration must use the same rows, sort state, string representations
and compatible Intl data. The fixed English policy preserves Trading name
collation across differing default locales; it is not a claim of identical
Unicode ordering across arbitrary ICU versions. Hidden fields remain sortable;
formatted/computed display text is not a comparator. No comparator API is added.

Each sortable column has a native `<button type="button">` inside
`<th scope="col">`. Its accessible name is the column label; decorative sort
icons are hidden from assistive technology. The active header, not its button,
has `aria-sort="ascending"` or `"descending"`; unsorted headers omit it.
The `<th>` itself is not interactive or separately focusable. Tab reaches the
button, and native Enter/Space activation makes one sort request per action.
`sortable: false` renders plain heading text with no sort button.

Every rendered table also has a native keyboard scroll stop: its viewport is
`role="region"` with `tabIndex={0}`, named
`${ariaLabel ?? title ?? 'Data'} table viewport`. Tab can focus the viewport;
native Arrow/PageUp/PageDown scrolling works when its content overflows,
without requiring a sortable column or row-action button. This does not turn
rows/cells into interactive controls or add custom key handlers. Sorting and
enabled action buttons keep their own native focus stops. The viewport's
focus-visible outline uses `--drasi-color-focus`.

Default loading/stale notices use `role="status"` and default errors use
`role="alert"`. Individual live cell changes are **not** automatically announced
as a live region. Applications own any additional announcement policy and the
semantics/focus behavior of replacement headers, rows and state slots.

Uncontrolled sorting with an explicit reset action:

```tsx
// @drasi-docs: sort-uncontrolled.tsx
import { DataTable } from '@drasi/react/components';
import type { SortConfig } from '@drasi/react/react';
import '@drasi/react/styles.css';

interface Job { id: string; priority: number }
export function JobQueue({ rows, onSortChange }: {
  rows: readonly Job[];
  onSortChange?: (next: SortConfig | null) => void;
}) {
  return <DataTable<Job>
    rows={rows} rowKey={row => row.id} title="Job queue"
    columns={[{ key: 'id', label: 'Job' }, { key: 'priority', label: 'Priority' }]}
    defaultSort={{ column: 'priority', direction: 'desc' }}
    onSortChange={onSortChange}
    renderHeader={({ defaultRender, setSort }) => <>
      {defaultRender()}
      <button type="button" onClick={() => setSort(null)}>Input order</button>
    </>}
  />;
}
```

Controlled sorting; the owner stores requests, including explicit `null`:

```tsx
// @drasi-docs: sort-controlled.tsx
import { useState } from 'react';
import { DataTable } from '@drasi/react/components';
import type { SortConfig } from '@drasi/react/react';
import '@drasi/react/styles.css';

interface Job { id: string; priority: number }
export function ControlledJobs({ rows }: { rows: readonly Job[] }) {
  const [sort, setSort] = useState<SortConfig | null>(null);
  return <DataTable<Job>
    rows={rows} rowKey={row => row.id} title="Jobs"
    columns={[{ key: 'id', label: 'Job' }, { key: 'priority', label: 'Priority' }]}
    sort={sort} onSortChange={setSort}
    headerControls={<button type="button" onClick={() => setSort(null)}>Input order</button>}
  />;
}
```

```tsx
// @drasi-docs: data-table.tsx
import { DataTable, type ColumnDef } from '@drasi/react/components';
import '@drasi/react/styles.css';

interface Delivery { id: string; destination: string; parcels: number }
const rows: readonly Delivery[] = [
  { id: 'north', destination: 'Warehouse A', parcels: 12 },
  { id: 'south', destination: 'Warehouse B', parcels: 3 },
];
const columns: readonly ColumnDef<Delivery>[] = [
  { key: 'destination', label: 'Destination', align: 'left' },
  { key: 'parcels', label: 'Parcels', align: 'right' },
  {
    key: 'summary', label: 'Summary', sortable: false,
    format: (_value, row) => `${row.parcels} parcels to ${row.destination}`,
  },
];
export default function Deliveries() {
  return <DataTable<Delivery>
    title="Deliveries" rows={rows} columns={columns} rowKey={row => row.id}
  />;
}
```

This needs no provider, query, network request, Tailwind configuration or package
source. Import styles explicitly. Mixed-framework applications can instead import
`@drasi/ui-styles/styles.css` once; the React compatibility entry is generated
from those exact canonical bytes.

#### Table sizing

`TableHeight` is exported by `/components` and root. Accepted values are:

- A **finite, nonnegative number**, in pixels, including `0`.
- A nonnegative explicit length/percentage string using `px`, `rem`, `em`,
  `ch`, `ex`, `lh`, `rlh`, `vw`, `vh`, `vmin`, `vmax`, `svw`, `svh`, `lvw`,
  `lvh`, `dvw`, `dvh`, `cm`, `mm`, `in`, `pt`, `pc` or `%`.
- Unitless `'0'`, or `'auto'`.
- `var(--name)`, optionally with one literal nonnegative length, `'0'` or
  `'auto'` fallback, for example `var(--drasi-panel-height, 20rem)`.

Percentages require a sized parent. Use a custom property for `calc()` or
`clamp()` expressions; they are not direct `height` prop values. The property
name must start with `--` followed by a letter or underscore, then letters,
digits, underscores or hyphens. Invalid runtime values throw `TypeError`,
including negative/nonfinite numbers, unsupported expressions and class names.
TypeScript rejects arbitrary/class strings, but its number/template types
cannot express every runtime constraint; validate untrusted JavaScript input.

Validation checks prop syntax and numeric bounds, not the computed CSS
cascade. Define referenced custom properties with usable size values or supply
a literal fallback, such as `var(--drasi-panel-height, 20rem)`. SSR cannot
evaluate inherited custom properties. The omitted prop's 400px default is not
an implicit fallback for an explicit unresolved `var(--name)`.

An explicit `height` wins over `style.height`. Without it, inline
`style.height` wins over the inherited `--drasi-table-height` token, whose
stylesheet fallback is **400px**. This applies to DataTable state cards and
QueryTable as well as tables with rows. Class-based layout belongs in
`className`, not `height`.
CSS border/padding minima still apply; `0` is not a visibility or collapse
flag. Provide enough space for headers and controls in the chosen layout.

```tsx
// @drasi-docs: table-sizing.tsx
import type { CSSProperties } from 'react';
import { DataTable, type ColumnDef, type TableHeight } from '@drasi/react/components';
import '@drasi/react/styles.css';

interface Job { id: string; priority: number }
const rows: readonly Job[] = [{ id: 'dispatch', priority: 1 }];
const columns: readonly ColumnDef<Job>[] = [
  { key: 'id', label: 'Job' }, { key: 'priority', label: 'Priority' },
];
const responsiveHeight: TableHeight = 'var(--drasi-panel-height, 20rem)';
const layout: CSSProperties & { '--drasi-panel-height': string } = {
  '--drasi-panel-height': 'clamp(18rem, 50vh, 36rem)',
};

export function SizedJobs() {
  return <section style={layout}>
    <DataTable<Job>
      rows={rows} columns={columns} rowKey={row => row.id}
      title="Fixed-size jobs" height={400}
    />
    <DataTable<Job>
      rows={rows} columns={columns} rowKey={row => row.id}
      ariaLabel="Responsive jobs" height={responsiveHeight}
    />
  </section>;
}
```
