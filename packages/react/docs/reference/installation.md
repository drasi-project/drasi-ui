# Learning distribution and installation reference

The [React developer guide](https://github.com/drasi-project/drasi-ui/blob/main/docs/react/developer-guide/README.md)
and its backend/authentication helpers belong to the separately versioned
GitHub learning kit. Production npm archives contain compiled modules,
declarations, CSS, licenses/notices, and concise Markdown references only.
The helpers have always required explicit execution; they were never
installation hooks.

No npm package or GitHub prerelease is currently published. The source builder
installs only package-building dependencies and emits a source-identified,
self-contained learning kit. Public preview downloads require reviewed merge
and successful protected-main qualification; see the repository's
[release procedure](https://github.com/drasi-project/drasi-ui/blob/main/docs/releasing.md).
Checksums verify bytes, not the trustworthiness of a download source. Download
only from the approved repository over HTTPS and keep its files together.

## Registry installation after publication

Use these commands only once the npm packages have actually been published.
The current learning path uses the kit's local archives instead.

```sh
# @drasi-install: react
npm install @drasi/react @drasi/ui-core
```

```sh
# @drasi-install: core
npm install @drasi/ui-core @drasi/ui-styles
```

## pnpm and unpublished package sets

The generated starter includes a `pnpm-workspace.yaml` mapping **only** React's
exact unpublished core dependency to the matching local archive. With the tested
pnpm 12.14.0, run `pnpm import`, `pnpm install --frozen-lockfile --ignore-scripts`,
then `pnpm run build`. This mapping is not a React peer override:

```yaml
overrides:
  "@drasi/ui-core@0.1.0-beta.1": "file:../artifacts/drasi-ui-core-0.1.0-beta.1.tgz"
```

The generated npm lock and this mapping refer to the same checked package set.
Once the packages are published, ordinary registry installation needs no local
archive mapping. Node 22's bundled npm 10 is supported for the basic learner
path; npm 11.17.0 remains the maintainer release toolchain.
