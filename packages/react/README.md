# @drasi/react

Tables for data you own, live-query bindings, accessible dialog composition,
and scoped styles. Your application owns its data sources, authentication,
provisioning, layout, and business actions.

**Start with [The React developer guide](docs/developer-guide/README.md).**
Build one evolving cold-storage application: first a complete provider-free
screen, then live results, shared tables/cards, actions/dialogs, themes,
connection ownership, recovery, and deployment. No prior Drasi knowledge is
required.

**Not published to npm yet.** The guide's first lesson installs built local
tarballs. Registry commands are explicitly labeled for after publication.
You do not need a Server checkout or Rust build to display your own rows.

## Installation and entrypoints

Use the [complete copy/run/change lesson](docs/developer-guide/README.md#1-run-your-first-screen),
then the [public import map](docs/developer-guide/README.md#appendix-b-imports-and-reference)
when choosing a narrower entrypoint. Keep CSS explicit.

## Your first table

[Run Cold storage and change a reading](docs/developer-guide/README.md#1-run-your-first-screen).
`DataTable` needs rows, columns, and a stable render key, not a provider.

## Choose your connection and composition

Continue the same guide to [connect an existing query](docs/developer-guide/README.md#4-connect-to-an-existing-query)
or [bind an app-owned client](docs/developer-guide/README.md#8-own-a-client-without-drasi-server).
The optional Server adapter is not the generic client's superclass.

The [reference index](docs/reference/README.md) links exact props, defaults,
callbacks, state, accessibility, core, and adapter contracts. References are
authored beside the implementations and copied with checked link rewriting;
the guide and essential references work offline in this installed package.
Old guide URLs and headings remain as compatibility pointers, not parallel
tutorials.

## Examples and support

The [canonical example workspace](https://github.com/drasi-project/drasi-ui/blob/main/examples/react/README.md)
contains the cold-storage presentations and a clearly labeled server-free
showcase. Runnable private example/test sources are repository-owned, not
shipped in this tarball. The guide itself contains complete runnable code.

[Compatibility and validation](docs/reference/validation.md) records technical
qualification separately from pending human accessibility acceptance.
[Migration history](docs/reference/migration.md) preserves prior import and
behavior changes. Release/provenance work remains maintainer documentation,
not a prerequisite for learning the controls.

Apache-2.0. Retain [LICENSE](LICENSE), [NOTICE](NOTICE), and applicable dependency
notices.
