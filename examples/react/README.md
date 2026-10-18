# Canonical React examples

**Learning the controls? Start with the single
[React developer guide](../../packages/react/docs/developer-guide/README.md).**
It builds this cold-storage domain progressively, beginning with a complete
provider-free screen. This README is the workspace's run/operator reference,
not another tutorial to piece together with package docs.

This is the single moved example workspace, consuming built public package
exports. It contains a provider-free simulated showcase and three optional
live-data presentations. It does not build a Server, install plugins, provision
resources, or require a Server source checkout.

## Run only the simulated showcase

From the repository root:

```sh
npm ci
npm run build
npm run build -w drasi-react-cold-storage-example
npm start -w drasi-react-cold-storage-example
```

Open `http://127.0.0.1:15373/showcase.html`. The page is explicitly simulated:
loading, empty, error, stale, live, sorting, themes and modal composition do not
make API calls. The build consumes dist exports, never package-source aliases.
The packed-consumer gate repeats this from an isolated source-free installation.

Successful CI retains a relocatable `react-showcase` static artifact made from
that tested consumer. Its entry document explicitly selects showcase-only
navigation: its only link stays on the simulation within its deployment
directory. Backend-only pages and links are not exported. The full local/live
workspace retains all four directory-relative
example links, including when hosted below a path prefix.

After this PR is merged, a maintainer can enable GitHub
Pages with Actions as its source and manually run `Static showcase` on protected
main with the matching successful CI run ID. That workflow deploys the tested
artifact without rebuilding it. No hosted site or Pages account setting has
been enabled by this implementation.

## Run the real example

An operator must first run an approved released Server/SSE/feed installation
using the example's `config/server.yaml` and `config/readings.jsonl` as deployment
inputs. Supply existing instance `cold-chain`, queries `north-room` and
`south-room`, and SSE reaction `cold-chain-events` at `/events`. Release/plugin
selection, binary/signature verification, port binding and provisioning belong to
the operator, not the control library.

Provide an operator-owned JSON file with `serverVersion`, `sseVersion` and a
64-character lowercase `binarySha256` from that verified installation.
The example records this supplied evidence; it does not remotely attest a binary
or turn metadata into a new compatibility claim.

```sh
export DRASI_SERVER_URL=http://127.0.0.1:8080
export DRASI_SSE_URL=http://127.0.0.1:8081
export DRASI_FEED_URL=http://127.0.0.1:8082
export DRASI_RUNTIME_PROVENANCE=/absolute/path/to/released-runtime-provenance.json
npm run start:live -w drasi-react-cold-storage-example
```

The local example web service validates existing resources and proxies reads to
those explicit loopback services. Stopping it does not stop or delete the
operator's backend. An absent or invalid configuration fails explicitly rather
than compiling sibling source or silently substituting a different runtime.
The live test runner always requests an isolated web port with
`DRASI_WEB_PORT=0`; it preserves the operator's backend URLs and resolves the
Playwright CLI through Node so both hoisted workspace and standalone installs work.

| Page | Composition |
| --- | --- |
| `/` | A hoisted query hook with provider-free `DataTable` |
| `/query-table.html` | `QueryTable` with explicit state/retry slots |
| `/hooks.html` | Headless hooks and semantic cards, with zero package CSS |
| `/showcase.html` | Labeled simulation, no backend |

The live pages require real pre-created resources; the showcase is not protocol
or consistency proof. Use the same environment for `npm run test:live -w
drasi-react-cold-storage-example`. Recorded wire contracts retain their original
[source provenance](../../docs/provenance.md).

## Change sample readings and retain diagnostics

Use `npm run feed -w drasi-react-cold-storage-example -- "$DRASI_FEED_URL" warm`
and the other named feed scenarios in `scripts/feed.mjs`. Feeding sample data is
an application action, not a library administrative API.

Live diagnostics are retained under this workspace's `.runtime/live-*` directory.
After stopping a run, `npm run clean:run -w drasi-react-cold-storage-example --
/absolute/path/to/the/completed/run` removes only that exact owned run after
checking its cleanup marker.

The example's node and browser tests, complete entry/shared/lazy asset accounting,
and headless zero-CSS check remain package-owned. Historical original metrics
are preserved separately; unexplained growth is limited to 2%. Financial
calculations, Trading-specific images and downstream CRUD gates remain in Server.
