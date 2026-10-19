# Drasi UI

Framework-neutral live-query foundations, shared styles and native UI bindings.
Applications own their data sources, authentication, provisioning and business
logic. A Drasi Server connection is an explicit optional integration, not a
requirement for displaying rows or subscribing to an application-owned client.

**Start here: [The React developer guide](docs/react/developer-guide/README.md).**
Build a complete cold-storage screen, change your first reading without a backend,
then connect the same row model to live queries, shared views, review dialogs,
themes, and your application's connection lifecycle. The guide explains the
backend/browser boundary before asking you to configure a connection.

**Packages are not published to npm yet.** The guide starts with an executable
source/tarball installation, not an unavailable registry command. No Server
checkout or Rust build is needed for its first lesson.

## Start with rows you own

The [first working screen](docs/react/developer-guide/README.md#1-run-your-first-screen)
uses `DataTable` with supplied rows: no provider, query, network request,
Tailwind configuration, or package-source scanning. Follow the same book into
live data when you have an existing query to connect.

The [reference index](packages/react/docs/reference/README.md) is for lookup,
not a second tutorial path. Detailed DataTable, QueryTable, and Modal references
live beside their implementations; checked copies ship with the guide in the
React package, including working offline links.

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
