# Installation and live quickstart

[Package overview](../README.md)

## Installation and entrypoints

After the first approved release, install into an existing supported React app:

```sh
npm install @drasi/react
```

For a renderer-free data client, install `@drasi/ui-core` instead. No React
package, React declarations, Radix, Server checkout, Rust or plugins are needed.

```sh
# @drasi-install: core
npm install @drasi/ui-core @drasi/ui-styles
```

There is no package `prepare`, `prepack` or `postinstall` rebuild. Keep a single
React/React DOM identity and commit the application's lockfile.
The current repository is release preparation, not evidence that registry names
are already available. Source-free tarball instructions belong to the
[contribution guide](https://github.com/drasi-project/drasi-ui/blob/main/CONTRIBUTING.md),
not normal onboarding.

| Import | Contents and dependencies |
| --- | --- |
| `@drasi/ui-core` | Structural `QueryClient`, normalized results, errors, state, explicit `SSEClient`, reconciliation and pure table algorithms. No React/Vue runtime or declarations. |
| `@drasi/react/client` | Data-only compatibility re-export of core. Install core directly when React must not be installed. |
| `@drasi/ui-core/adapters/drasi-server` | `DrasiClient`, Server-default `DrasiSSEClient`, Server DTOs, wire adapters and read-only resource validation. |
| `@drasi/react/react` | `DrasiClientProvider`, data/status hooks, sort/motion hooks and their named types. No Server, components, Radix, React DOM or CSS. |
| `@drasi/react/adapters/drasi-server` | Optional `DrasiProvider`, `DrasiServerClientProvider`, Server inspection helpers and re-exported generic hooks. |
| `@drasi/react/components` | Provider-free `DataTable` and `Modal`, live `QueryTable`, pure `queryTableState`, optional icons and typed column/action/state/slot/props contracts, including `ModalProps` and `TableHeight`. The client-only modal layer uses pinned Radix Dialog **1.1.15** and `scroll-into-view-if-needed` **3.1.0**, including their portal/geometry dependencies. No tutorial/fullscreen implementation or implicit CSS. `SortConfig` is also re-exported here. |
| `@drasi/react` | Generic core/binding/component convenience exports, never the Server adapters. This is **not** a React-free import. |
| `@drasi/react/styles.css` | Explicit package-owned stylesheet, never imported by the JS modules. |

All JS entrypoints ship real ESM/CommonJS exports and conditional `.d.ts`
and `.d.cts` declarations. Import these paths, not `src`, `dist` or hashed
shared chunks. Core is independently installable.

Build output compacts whitespace only: syntax/identifiers are not minified,
debug/component names are preserved, and source maps retain source content.
Declarations, documentation, CSS and license notices remain in the package.

React and React DOM are required peers of the React package. The matrix targets
**18.3.1** and **19.3.1**; consult the repository compatibility evidence before
claiming another configuration.
The headless `/react` graph does not import React DOM or Radix. The
`/components` and root graphs include the dialog primitive; use the narrower
entrypoints for headless consumers. No React copy is bundled or hidden in
another dependency. Core and styles have no renderer peers.

The exported props/options and hook declarations include JSDoc for editor
hover/completion. Import named types such as `ModalProps`, `TableHeight`,
`DataTableProps` and `UseRowAnimationOptions` from their public entrypoints;
do not depend on a private helper or hashed declaration filename.

Import the component stylesheet once when using presentation:

```ts
import '@drasi/react/styles.css';
```

## Quickstart

This is the optional **Drasi Server** quickstart. Generic data clients use
`DrasiClientProvider` instead. Provision resources separately. This example requires instance `analytics`, a
running `readings` query and a running `sse` reaction `events` whose query list
includes `readings`. The SSE endpoint must be browser-reachable, including
proxy routing and CORS. Server bind addresses/ports are not client options.

```tsx
// @drasi-docs: quickstart.tsx
import { DrasiProvider } from '@drasi/react/adapters/drasi-server';
import { useDrasiConnectionStatus } from '@drasi/react/react';
import { QueryTable } from '@drasi/react/components';
import type { ReactionReference } from '@drasi/ui-core/adapters/drasi-server';
import '@drasi/react/styles.css';

const QUERY_IDS = ['readings'];
const REACTION: ReactionReference = {
  id: 'events', endpoint: 'https://events.example/changes',
};
interface Reading { id: string; value: number }

function Readings() {
  return <QueryTable<Reading>
    queryId="readings"
    rowKey={row => row.id}
    queryOptions={{
      getKey: row => {
        if (typeof row.id !== 'string' || !row.id) throw new Error('Expected a stable reading ID');
        return row.id;
      },
      transform: row => {
        if (typeof row.id !== 'string' || typeof row.value !== 'number') {
          throw new Error('Expected a Reading');
        }
        return { id: row.id, value: row.value };
      },
    }}
    columns={[
      { key: 'id', label: 'Sensor' },
      { key: 'value', label: 'Value', align: 'right', format: (_raw, row) => row.value.toFixed(2) },
    ]}
    animateOnChange="value"
  />;
}

function ConnectionBadge() {
  const status = useDrasiConnectionStatus();
  return <span>{status.error?.message ?? (status.connected ? 'Stream open' : 'Connecting')}</span>;
}

export default function App() {
  return <DrasiProvider
    serverUrl="https://drasi.example" instanceId="analytics"
    queryIds={QUERY_IDS} reaction={REACTION}
  >
    <ConnectionBadge />
    <Readings />
  </DrasiProvider>;
}
```

Initialization reads the referenced queries concurrently, waits for the bounded
batch to settle, then checks the reaction and opens **one** SSE connection.
Initialization, subscriptions, reconnect and retry perform **GETs only**.
There is no resource-management mode, implicit instance, query-language choice
or deployment reconciler. Each subscription's `getQueryResults` also validates
its query resource before fetching the snapshot. These required validation GETs
are distinct from optional, app-triggered query-definition inspection.

### Example workspace

The [canonical repository examples](https://github.com/drasi-project/drasi-ui/blob/main/examples/react/README.md)
live at `examples/react`. Their source and setup
scripts are repository-only, not included in the installed tarball:

- `/`: a live cold-storage table using existing Drasi resources.
- `/query-table.html`: the smaller live `QueryTable` composition, with query
  state/retry slots and a labelled client-only projection-error control.
- `/hooks.html`: a live custom semantic UI using only `@drasi/react/react`
  from this package, without package components or package CSS.
- `/showcase.html`: **explicitly simulated**, provider-free states, sorting,
  themes and Modal composition. It is not evidence of a live Drasi connection.

These entrypoints illustrate separate consumption styles, not new public APIs.
Their README owns startup commands and measured results. Trading remains the
app-owned provisioning, financial, tutorial-inspection and fullscreen example.
