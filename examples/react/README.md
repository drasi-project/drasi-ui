# Canonical React examples

**Learning the controls? Start with the single
[React developer guide](../../packages/react/docs/developer-guide/README.md).**
It builds this cold-storage domain progressively, beginning with a complete
provider-free screen. This README is the workspace's run reference,
not another tutorial to piece together with package docs.

This is the single moved example workspace, consuming built public package
exports. It contains a provider-free simulated showcase and three optional
live-data presentations. The example-owned launcher downloads a verified released
Server and signed plugins, and initializes local resources. The public controls
remain read-only; no Server source checkout or Rust build is needed.

## Run only the simulated showcase

From the repository root:

```sh
npm ci --ignore-scripts &&
npm run build &&
npm run build -w drasi-react-cold-storage-example &&
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

On macOS Apple Silicon or Linux x64/glibc, after building the packages:

```sh
npm run build -w drasi-react-cold-storage-example &&
npm run start:live -w drasi-react-cold-storage-example
```

The launcher verifies Server **0.2.4**, HTTP source **0.2.13**, scriptfile bootstrap
**0.2.15**, and SSE reaction **0.3.8**, including release hashes, signed plugin
installation, and loaded plugin metadata. `config/runtime-pins.json` records
both supported platform sets. `config/server.yaml` contains concrete
8080/8081/8082 ports; `config/readings.jsonl` initializes four probes. The queries
are `north-room`, `south-room`, and the threshold-membership query `warm-probes`.
All three belong to reaction `cold-chain-events`.

The web service is at `http://127.0.0.1:5373`. Ctrl+C stops its owned web and
backend processes. Each launch reinitializes the four probes and retains its
own logs. Occupied ports fail explicitly. To start only the backend, run
`node examples/react/scripts/backend.mjs` from the repository root.

You can instead attach to an explicitly prepared local backend:

```sh
export DRASI_SERVER_URL=http://127.0.0.1:8080
export DRASI_SSE_URL=http://127.0.0.1:8081
export DRASI_FEED_URL=http://127.0.0.1:8082
npm run start:live -w drasi-react-cold-storage-example
```

The local example web service validates existing resources and proxies reads to
those explicit loopback services. Stopping it leaves externally supplied services
alone. An optional `DRASI_RUNTIME_PROVENANCE` can point at the launcher's generated
evidence; no learner authors a provenance file.
The live test runner always requests an isolated web port with
`DRASI_WEB_PORT=0`; it preserves explicitly supplied backend URLs and resolves the
Playwright CLI through Node so both hoisted workspace and standalone installs work.

| Page | Composition |
| --- | --- |
| `/` | A hoisted query hook with provider-free `DataTable` |
| `/query-table.html` | `QueryTable` with explicit state/retry slots |
| `/hooks.html` | Headless hooks and semantic cards, with zero package CSS |
| `/showcase.html` | Labeled simulation, no backend |

The live pages use the real resources initialized by the launcher; the showcase
is separate. Run `npm run test:live -w drasi-react-cold-storage-example` for the
real browser/template gate, or `node examples/react/test/backend-contract.mjs`
for released-backend curl/read/wire qualification. Recorded wire contracts retain their original
[source provenance](../../docs/provenance.md).

## Change sample readings and retain diagnostics

Use `npm run feed -w drasi-react-cold-storage-example -- http://127.0.0.1:8082 warm`
and the other named feed scenarios in `scripts/feed.mjs`. Feeding sample data is
an application action, not a library administrative API.

The book includes equivalent plain curl POSTs. `warm` updates `probe-1001`;
`delete` removes `probe-2001`; `restore` inserts all four initial identities.
`north-spare` / `probe-1002` starts at 6 C; `south-spare` / `probe-2002` at 9 C.
The proxy propagates upstream failure and applies a five-second SSE idle timeout
against the configured one-second heartbeat, without altering client retry policy.

For the book's authenticated stream, `node examples/react/scripts/auth-gateway.mjs`
starts a local token exercise gateway on 8083. It forwards the real backend and
keeps its tokens only in memory; it is not a production identity provider.

Live diagnostics are retained under this workspace's `.runtime/live-*` directory.
After stopping a run, `npm run clean:run -w drasi-react-cold-storage-example --
/absolute/path/to/the/completed/run` removes only that exact owned run after
checking its cleanup marker.

The example's node and browser tests, complete entry/shared/lazy asset accounting,
and headless zero-CSS check remain package-owned. Historical original metrics
are preserved separately; unexplained growth is limited to 2%. Financial
calculations, Trading-specific images and downstream CRUD gates remain in Server.
