# Release and partial-release recovery

**Infrastructure only: no package has been staged or published by this work.**
The namespace is `@drasi`; package availability/access, two maintainers with 2FA,
trusted publishers, human accessibility acceptance and release approvals remain
explicit prerequisites.

The only initial public packages are `@drasi/ui-core`, `@drasi/ui-styles` and
`@drasi/react`. Root, examples, test fixtures and applications remain private.
No Vue, console or management-client placeholder release is permitted.

## Identity and approval configuration

Use `.github/workflows/npm-release.yml` from protected `main`. Configure each
npm trusted publisher for organization `drasi-project`, repository `drasi-ui`,
workflow filename **`npm-release.yml`**, environment **`npm-release`**, and
**stage-only** permission. Do not enable direct `npm publish`. Dist-tag permission
is separate and is needed only for a later complete-set promotion.

The GitHub environment is restricted to protected branches and has a named
reviewer. Keep code-owner/review/admin and required-check protections intact.
Publication uses pinned Node 24.19.0 and npm **11.21.0**; preparation retains the
workspace's npm 11.17.0. No npm write secret is used.

An authorized npm owner must bootstrap package ownership. Staging a new package
creates a publicly visible `0.0.0-stage` placeholder; it is not a private
reservation. This workflow refuses absent packages, so that action needs separate
authorization. Configure new trusted publishers close to the release: npm's
current first-success expiry is two days. After verifying OIDC, owners should
require 2FA and disallow traditional publishing tokens.

Protected environment variables are human-maintained approval records, not test
outputs. Do not fill them merely because CI is green:

| Variable | Required record |
| --- | --- |
| `NPM_ACCOUNT_APPROVAL` | JSON with repository `drasi-project/drasi-ui`, workflow `npm-release.yml`, environment `npm-release`, the ordered three package names, at least two distinct `maintainers`, and `twoFactorVerified`, `ownershipVerified`, `trustedPublishersVerified` all true |
| `HUMAN_ACCESSIBILITY_ACCEPTANCE` | JSON with the SHA-256 of the exact `release-set.json` as `candidateSha256`, `decision: "accepted"`, named `reviewer`, HTTPS `reportUrl`, nonempty `screenReaders`, and ISO `completedAt` |
| `REGISTRY_ADOPTION_ACCEPTANCE` | For `latest` only: the exact candidate hash, accepted decision and HTTPS report covering downstream/non-Trading React and native Vue registry adoption |

Record actual tested browser/AT/platform versions and findings in the linked
human report. Workflow schema checks bind a record to artifacts; they cannot
establish whether a human actually performed the review.

## Prepare, then stage on next

Review the Changesets release plan, versions, dependency updates and changelogs
in a release-preparation PR. The recommended first cohort is `0.1.0-beta.1` on
`next`, with separately qualified `0.1.0` artifacts later. Pre-1.0 breaking API or
CSS changes require a minor release; compatible fixes use patches. Exact
dependencies and embedded CSS require appropriate dependent updates, not
permanent lockstep versioning.

This initial preparation already selects `0.1.0-beta.1` in the manifests.
The retained initial changeset currently plans the later `0.1.0` transition;
`changeset status` verifies that explicitly. Qualify the selected beta before
applying that stable transition. For additional beta fixes, enter Changesets
prerelease mode deliberately and review its proposed versions rather than
assuming the version command always produces another beta. Versioning itself
never publishes.

Dispatch `prepare` on protected main. It builds and packs once, validates all
three actual tarballs together, runs source/type/unit/documentation/pnpm/Vite/
Next/Vue/browser gates, and uploads `npm-candidates` with hashes and
`qualification.json`. That seal explicitly says `humanAcceptance: false`.
Retain the run ID, source SHA, artifact ID/digest and complete release-set hashes.

After human acceptance and environment approval, dispatch `stage` with that
successful prepare run ID. Staging must run at the candidate's exact source SHA
so npm's automatic provenance identifies the build source. If main moved before
the first staging attempt, prepare and requalify new candidates; do not misattest
an old build.

Each `stage` invocation submits **only the first unpublished package**, in
core/styles/React order, using the exact tarball and explicit `--tag next`.
The tag is immutable on a staged version. A successful staging job is not a live
publication or approval. Read its retained receipt and have an npm maintainer
inspect/download the staged artifact and approve it with 2FA.

Trusted-publisher tokens cannot run `stage list`, `view`, `download` or `approve`.
Those are maintainer-account operations. Never introduce a write-token fallback
to automate them.

## Resume safely

After approval makes that version public, rerun the **same original staging
workflow run** to advance to the next missing package. GitHub reruns retain the
original source SHA/ref, even if main later advances. Already published versions
must match exact integrity, contents and source/workflow provenance. Registry
signatures and Sigstore bundles are checked with `npm audit signatures`.
React cannot be staged before core and styles are publicly verified.

If submission failed after npm accepted it, inspect the receipt and staged
version with the maintainer account first. A staged version occupies the same
immutable version index as a public version; blindly rerunning cannot overwrite
it and must not be treated as recovery. Approve the original bytes, then resume.
Do not rebuild under the same version, silently substitute an archive, reject a
stage automatically or publish an unverified fallback.

Receipts/progress and exact candidate artifacts are retained for 90 days. If an
artifact expires, recover the original verified bytes from retained release
storage or stop; rebuilding is not proof of identity.

## Promote a complete stable set

Prepare **new non-prerelease artifacts**, qualify them, stage/approve them on
`next`, and complete registry adoption. `promote-latest` checks that every version
is public, identical and attested before any tag change, verifies a clean
registry dependency install and signatures, requires the separate adoption
record, and rejects beta versions. Partial tag changes are recorded and can be
resumed against the same verified set.

No merge is performed by this workflow. Rollback normally means a corrective
version or an explicitly approved dist-tag change, not overwriting versions or
routine unpublishing. Deprecation and exceptional tag rollback remain separately
authorized maintainer actions.

Official references, rechecked October 17, 2026:
[staged publishing](https://docs.npmjs.com/staged-publishing/),
[npm stage](https://docs.npmjs.com/cli/v11/commands/npm-stage/),
[trusted publishers](https://docs.npmjs.com/trusted-publishers/) and
[provenance](https://docs.npmjs.com/generating-provenance-statements/).
