# Drasi UI

Framework-neutral live-query foundations, shared styles and native UI bindings.
Applications own their data sources, authentication, provisioning and business
logic. A Drasi Server connection is an explicit optional integration, not a
requirement for displaying rows or subscribing to an application-owned client.

**Release preparation:** this repository does not yet claim an npm publication.
The `@drasi` namespace has been selected; package availability, ownership and
trusted-publisher configuration still require authenticated verification.
The installation below is the intended onboarding once the first release is
approved. Contributors can qualify the same artifacts using
[the source-free tarball workflow](CONTRIBUTING.md).

## Start with rows you own

In an existing supported React application:

```sh
npm install @drasi/react
```

```tsx
import { DataTable } from '@drasi/react/components';
import '@drasi/react/styles.css';

export function Readings() {
  return <DataTable
    title="Sensor readings"
    rows={[{ station: 'North', temperature: 21 }]}
    columns={[{ key: 'station', label: 'Station' }, { key: 'temperature', label: 'Temperature' }]}
    rowKey={row => row.station}
  />;
}
```

No provider, backend, Tailwind configuration or source scanning is needed.
[React documentation](packages/react/README.md) covers typed columns, headless
query state, shared presentations, modals, themes and optional Server connectivity.

## Repository catalog

| Location | Responsibility | Status |
| --- | --- | --- |
| [`packages/core`](packages/core/README.md) | `@drasi/ui-core`: data-only contracts, state, transport and pure table algorithms | Initial beta preparation |
| [`packages/styles`](packages/styles/README.md) | `@drasi/ui-styles`: canonical scoped CSS, tokens and motion | Initial beta preparation |
| [`packages/react`](packages/react/README.md) | `@drasi/react`: React bindings and accessible controls | Initial beta preparation |
| [`examples/react`](examples/react/README.md) | Canonical React examples and server-free showcase | Private, runnable source |
| [`examples/vue-canary`](examples/vue-canary/README.md) | Native Vue 3 proof using packed core/styles without React | Private conformance consumer, not a Vue library release |
| `packages/vue` | Future native Vue controls/composables | Reserved in the [Vue contract](docs/architecture/vue.md); no package yet |
| `packages/management-client`, `apps/console` | Future administrative client and management application | Reserved in the [console contract](docs/architecture/console.md); no application yet |

Mixed-framework applications can import `@drasi/ui-styles/styles.css` once.
`@drasi/react/styles.css` is generated from those exact canonical bytes, not a
second stylesheet implementation.

## Ownership and guarantees

[Architecture](docs/architecture/boundaries.md),
[API migration](docs/migration.md),
[compatibility and evidence](docs/compatibility.md),
[release gates](docs/releasing.md),
[contribution](CONTRIBUTING.md) and [security](SECURITY.md) describe the supported
boundaries. Human screen-reader acceptance is still required; automated checks
are not a WCAG claim.

The [source provenance](docs/provenance.md) identifies the history-preserving
import from Drasi Server. Financial/provisioning behavior and Trading-specific
images remain downstream. This repository does not contain the Server UI or a
new management backend.

Apache-2.0, with the retained [LICENSE](LICENSE) and [NOTICE](NOTICE).
