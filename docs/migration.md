# Import migration from drasi-server/dev-tools/react

The source of truth is now `drasi-project/drasi-ui`. The imported library is
frozen downstream until Trading's separately owned migration is accepted.
The old package was private; Server-specific imports intentionally move before
public release rather than hiding Server connectivity behind generic aliases.

| Old surface | New surface |
| --- | --- |
| `@drasi/react/client`: normalized results, row keys, errors, transport option types, `accumulateResult` | Prefer `@drasi/ui-core`; the data-only `@drasi/react/client` alias remains |
| `DrasiClient`, `DrasiClientOptions`, `DrasiInitializeOptions` | `@drasi/ui-core/adapters/drasi-server` |
| `DrasiSSEClient`, `DrasiSSEClientOptions`, `sse034ResultAdapter`, `createLegacyResultAdapter`, `RouteUnidentified`, `LegacyResultAdapterOptions` | `@drasi/ui-core/adapters/drasi-server` |
| Server DTOs: `QueryConfig`, `QuerySource`, `QueryJoin`, `QueryJoinKey`, `QueryMiddleware`, `QueryLanguage`, `ReactionConfig`, `SseReactionConfig`, `ReactionReference`, `Component`, `ComponentStatus`, `ComponentLinks` | `@drasi/ui-core/adapters/drasi-server` |
| `DrasiProvider`, `DrasiProviderProps`, `useDrasiQueryDefinition`, `UseDrasiQueryDefinitionResult`, `useDrasiServerUiUrl` | `@drasi/react/adapters/drasi-server` |
| `DrasiClientProvider` used only for query data | Unchanged at `@drasi/react/react`; accepts structural `QueryClient` |
| `DrasiClientProvider` used with Server inspection | `DrasiServerClientProvider` at the React Server adapter; explicitly accepts `DrasiServerContextValue` |
| `useDrasiClient().client` used for Server inspection | `useDrasiServerClient().client` at the React Server adapter |
| Query/status hooks, sorting and reduced-motion/row-animation hooks | Unchanged at `@drasi/react/react`; also re-exported by the optional React adapter for convenient migration |
| `DataTable`, `QueryTable`, `Modal`, icons and renderer-specific types | Unchanged at `@drasi/react/components` and the generic root |
| `@drasi/react/styles.css` | Unchanged generated entry; alternatively import `@drasi/ui-styles/styles.css` once |

The generic root no longer exports Server APIs or DTOs. `SSEClient` is the new
generic transport name and requires an explicit wire adapter; it never silently
selects the Server protocol. Existing Server-default transport behavior is
preserved by the optional `DrasiSSEClient`.

Trading must update imports and, after an approved registry beta exists, replace
its `file:` dependency and remove library-building `predev`/`prebuild` hooks.
Financial transforms, provisioning, tutorial dialogs and original images stay
downstream. This PR does not authorize that registry migration or publication.

React 19 ref types explicitly allow null in optional focus/theme refs. Runtime
focus ownership and SSR behavior are unchanged. Client-facing exports carry
`use client`; function-valued table props must be composed inside an App Router
client component, not passed across a Server Component boundary.
