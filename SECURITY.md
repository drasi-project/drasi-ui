# Security policy

Do not report credentials, private data or exploitable details in a public issue.
Use [GitHub private vulnerability reporting](https://github.com/drasi-project/drasi-ui/security/advisories/new).
If that route is unavailable, contact the repository maintainers privately through
the Drasi project's published security contact; do not post the report publicly.

The first release is still being prepared. No released-version support promise,
human accessibility approval or npm ownership is implied by repository creation.
Maintainers must name a security responder and backup before publication.

The data client is not an authorization boundary. Operators own authentication,
instance/resource permissions, provisioning, deployment and HTTP security policy.
Use HTTPS, appropriate CSP, HSTS, `X-Content-Type-Options` and framing protection
at the application host. A component package cannot configure those headers.

Never embed credentials in bundles or log authentication headers/payloads.
Native EventSource cannot honor arbitrary headers or `credentials: omit`;
unsupported configurations fail rather than silently losing authentication.
Custom transports must propagate cancellation and preserve scoped errors.

Release jobs use GitHub-hosted OIDC, a protected `npm-release` environment,
explicit package allowlists and exact candidate integrity. No long-lived npm
write token, automatic 2FA approval or direct-publish fallback is configured.
Review [the release runbook](docs/releasing.md) before any account or release action.
