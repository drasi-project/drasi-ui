# Future management console and host contract

Reserve `apps/console` for a private React 19 management application and
`packages/management-client` for a separate framework-neutral observe/manage
API client. Neither is implemented or published by the initial controls release.
The existing Server UI and its build/serving behavior remain downstream.

The console must accept a runtime-configurable API URL and discover a versioned
API and supported capabilities. Authentication and authorization must distinguish
read from write permissions. Plugin installation, configuration persistence and
solution catalogs are optional host capabilities, not universal prerequisites.
An open socket does not make raw `drasi-lib` a manageable host.

Administrative mutations never enter the data-only `QueryClient` interface.
Monaco, graph editors, routing and administration dependencies belong to the
application or management client, not ordinary controls. A future Rust management
adapter belongs in the runtime/host repository, not this TypeScript workspace.

Deployment may be an independent static site/container or pinned built assets
embedded by Server/another compatible host. That later work must explicitly
resolve same-origin and `/ui/` assumptions; this extraction changes neither.
React 19 qualification is an initial requirement so the future console can
consume the same control package without reorganizing these boundaries.
