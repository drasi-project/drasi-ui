# @drasi/react

Provider-free tables and modals, headless live-query hooks, scoped themes and
reduced motion. Your application owns data sources, authentication, provisioning,
business actions and layout.

**First-beta preparation, not an npm publication claim.** The `@drasi` scope is
selected; package ownership, human accessibility acceptance and release approvals
remain gates. The ordinary installation below applies after the first approved
release. Contributor tarball qualification is documented in the
[repository contribution guide](https://github.com/drasi-project/drasi-ui/blob/main/CONTRIBUTING.md).

## Installation and entrypoints

In an existing supported React application:

```sh
# @drasi-install: react
npm install @drasi/react
```

Use `@drasi/react/components` for controls, `@drasi/react/react` for headless
bindings, and `@drasi/ui-core` for a renderer-free client/state installation.
Server conveniences are opt-in at `@drasi/react/adapters/drasi-server`;
Server client/DTO/wire APIs live at `@drasi/ui-core/adapters/drasi-server`.
The generic root never pulls those adapters into your dependency graph.

## Your first table

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

## Choose your connection and composition

[An app-owned client](docs/connection.md#ownership-and-reconfiguration) implements
the structural `QueryClient` contract and is supplied through
`DrasiClientProvider`. No Server class or administration DTO is required.
[The optional Server quickstart](docs/getting-started.md#quickstart) uses existing
resources and performs reads only.

Hoist one `useDrasiQuery` to feed several tables/cards from one subscription.
A provider shares a connection, **not a query cache**. Raw identity precedes
projection, sparse deletes never transform, and failed projections retain
visibly stale last-good data. Snapshot/SSE handoff is best effort with bounded
recovery, not atomic or exactly once.

[The reference](docs/reference.md) covers props, actions, slots, controlled
sorting, accessible `Modal` composition, raw identity, scoped retry and themes.
[Connections](docs/connection.md) covers authentication, cleanup and hosting.
[Testing](docs/testing.md) separates technical qualification from human
screen-reader acceptance. [Migration](docs/migration.md) records changed imports
and retained behavior.

React-facing exports include client directives for Next App Router. Compose
function-valued table props inside a client component. Core is never marked
`use client`; CSS remains an explicit import.

## Examples and support

The canonical [React examples](https://github.com/drasi-project/drasi-ui/blob/main/examples/react/README.md)
include a clearly simulated, server-free showcase and optional real-backend
pages. Runnable example/test source is repository-owned, not shipped in this
tarball. The private native Vue canary is not a public Vue control library.

See the [compatibility matrix](https://github.com/drasi-project/drasi-ui/blob/main/docs/compatibility.md)
for exact qualified versions and remaining release gates. Automated accessibility
results are not human screen-reader acceptance or a blanket WCAG claim.

Apache-2.0. Retain [LICENSE](LICENSE), [NOTICE](NOTICE) and applicable dependency
notices.
