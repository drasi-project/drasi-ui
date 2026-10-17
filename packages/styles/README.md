# @drasi/ui-styles

The canonical Drasi control stylesheet: scoped `.drasi-*` classes, `--drasi-*`
custom properties, light/dark themes and reduced-motion rules.

**Initial beta preparation, not a publication claim.**

```ts
import '@drasi/ui-styles/styles.css';
```

Import once when React and native Vue markup share a page. React-only applications
may keep `@drasi/react/styles.css`; its generated contents must be byte-for-byte
identical to this package's stylesheet. Do not import both unless your bundler
deduplicates identical CSS.

Apply `data-drasi-theme="light"` or `data-drasi-theme="dark"` to a containing
element, or override scoped `--drasi-*` tokens. The library does not install a
global reset, font, Tailwind dependency or source-scanning configuration.
React portals copy resolved scoped theme values through their own binding.
Other renderers own their native portal/focus behavior.

Classes, tokens and motion behavior are public compatibility surfaces.
Canonical edits belong in `packages/styles/src/styles.css`; generated files
must not be hand-edited. A change to embedded CSS requires both styles and React
changesets, rebuilt artifacts, and comparison of the exact tarballs.
