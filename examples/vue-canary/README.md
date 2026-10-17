# Native Vue canary

This private Vue 3 application exercises the same non-Server `QueryClient`
fixture as the React consumers. It uses native refs, computed values, watchers,
rendered semantic markup and scope disposal; it never mounts React.

From the repository root, restore the root lock with `npm ci`, then run
`npm run build` and `npm run build -w drasi-native-vue-canary`.
Root build copies the shared contract fixture into the ignored `.generated`
directory; it does not copy query algorithms or package source.

The required source-free gate packs core/styles, installs them in a fresh
consumer outside the checkout, checks that React/React DOM/React declarations/
Radix cannot be resolved, and runs the shared snapshot/update/sparse-delete/
projection-error/stale/retry/empty/scope-replacement/disposal scenarios.
The same CSS styles Vue-rendered table markup, with core sorting and animation
bookkeeping.

The workspace itself is not the no-React installation proof: development tools
are hoisted at the root. The isolated packed consumer supplies that proof.
This is not `@drasi/vue`, a complete control port, or human accessibility acceptance.
