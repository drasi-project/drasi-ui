# Modal reference

[Learn with the React developer guide](../../docs/developer-guide/README.md). This is the co-located lookup reference; edit this file, not its generated package copy.

#### Modal

`Modal` is a controlled, provider-free dialog primitive exported by
`/components` and root. Import `styles.css`; no Drasi connection, table,
Tailwind setup or domain-specific header/footer is required.

| `ModalProps` prop | Default / contract |
| --- | --- |
| `open: boolean` | Required controlled visibility. The owner closes by setting `false` or unmounting. |
| `onClose: () => void` | Required close request for a topmost Escape/outside dismissal. No event or boolean argument. Update `open`; ignoring the request leaves the modal open. Programmatic prop changes do not request another close. |
| `title: string` | Required meaningful, nonempty accessible name, rendered as a visually hidden title connected by `aria-labelledby`. Empty/whitespace or non-string runtime values throw `TypeError`, even when closed. Render a visible heading in children when appropriate. |
| `description?: string` | Optional short, visually hidden description connected by `aria-describedby`. Omit for complex structured content rather than flattening it into one announcement. |
| `children: ReactNode` | Required app-owned content. Include a **visible, keyboard-operable close/cancel control** wired to the same owner. No close button is inserted for you. |
| `initialFocusRef?: RefObject<HTMLElement>` | Valid focusable descendant to focus on opening; otherwise the dialog content itself receives focus. A target outside the content is not used. |
| `returnFocusRef?: RefObject<HTMLElement>` | Preferred focus target after closing, subject to validity and any surviving top modal. |
| `fallbackFocusRef?: RefObject<HTMLElement>` | App-owned fallback when the explicit return target and focused opening control are unavailable. |
| `themeRef?: RefObject<HTMLElement>` | Explicit theme source; defaults to a hidden inline anchor at the modal's React position. Does not change the portal destination. |
| `className?: string` | Replaces the optional default `drasi-modal-surface` decoration. Structural `drasi-modal-content` remains. |
| `style?: CSSProperties` | Inline content styles. No default inline content override. |
| `overlayClassName?: string` | Replaces the default centered/dimmed `drasi-modal-overlay` decoration. Structural `drasi-modal-layer` remains. |
| `overlayStyle?: CSSProperties` | Inline overlay styles, applied after the copied theme. |
| `closeOnEscape?: boolean` | `true`; Escape requests closing only the top layer. Setting `false` does not dismiss a lower modal instead. |
| `closeOnOutsideClick?: boolean` | `true`; a primary pointer press outside the content requests closing. The pointer's default focus movement is prevented even when dismissal is disabled, retaining focus while a controlled close is pending or declined. Background controls remain shielded. |

SSR and initial hydration render exactly one hidden inline theme anchor,
preserved when the client layer loads. The public wrapper imports only React;
the primitive and portal-theme layout effects stay in the client-only layer.
After browser mount, that layer loads lazily; mounting a closed Modal also
warms it. Only a ready, open layer acquires focus/scroll ownership. Closing or
unmounting during loading cannot open a late overlay. Loading failures
propagate to the owner's React error boundary rather than silently acting like
a working dialog.

The body portal has `role="dialog"` and `aria-modal="true"`. Pinned Radix
Dialog **1.1.15** owns focus containment, the Tab/Shift+Tab loop, topmost
dismissal, outside-pointer shielding, background `aria-hidden` management and
reference-counted scroll locking across independent/nested instances. Do not
add a competing document-level Escape handler, body-overflow toggle or global
focus manager around it.

Focus visibility is a separate, bounded scroll operation. When a non-root
focused target is physically inside the dialog content, the client layer uses
`scroll-into-view-if-needed` **3.1.0** with the owning overlay as its boundary,
nearest block/inline alignment and `scrollMode: 'if-needed'`. Movement is
**instant**, including with default animations enabled; it does not animate
focus into view or wait for transition events. Root-content focus and events
from a nested portal outside that content are excluded. Background scrolling
must remain unchanged.

The maintained helper handles scroll geometry, including transformed
containers, instead of adding a custom focus or rectangle-calculation
algorithm. Radix still owns focus movement, containment, restoration,
dismissal and locks. The dependency cost is two additional locked runtime
packages: the helper and `compute-scroll-into-view` **3.1.1**, both using public
npm SHA512 artifacts. Their imports stay behind the client-only modal boundary,
outside the `/client` and `/react` runtime/type graphs. Size evidence must
include every emitted entry/shared/
lazy chunk, not just the public wrapper; final byte measurements are separate
from this dependency inventory.

On close, focus restoration prefers a valid explicit `returnFocusRef`, then
the element focused at opening, then `fallbackFocusRef`, then surviving top
dialog content, then the document body. If another modal survives, targets
outside that modal are not eligible. Disconnected, disabled, hidden, inert
or otherwise unfocusable targets are not focused. Cleanup can restore focus
on the primitive's deferred zero-delay task, not necessarily synchronously
inside the owner's state update.

Styling overrides are **not an accessibility opt-out**. Preserve modal
positioning/stacking, content scrolling on small viewports, labels, focus
visibility and usable close controls. The default surface is 32rem wide,
bounded by the viewport; content height is bounded by
`calc(100dvh - 2rem)` and scrolls when necessary.

#### Scoped themes and portals

`Modal` copies resolved `--drasi-*` values, including arbitrary locally
defined prefixed tokens, and the source's font family, font size, font weight,
line height and direction to its body portal. Known tokens absent at the source, including
the overlay token, are reset in the portal so their usage fallbacks apply.
The default source is its hidden inline anchor; `themeRef` selects another
element. Ancestor attribute changes
(including class/style), resize and preferred-color-scheme changes trigger a
re-read. Arbitrary CSSOM edits or stylesheet replacement without one of those
signals are **not automatically watched**: reopen the modal or change a theme
source/ancestor attribute. This is theme propagation, not a global theme store.

Typography copied from computed styles is not a reconstruction of the
ancestor's CSS inheritance rules. In particular, a computed `24px` line height
does not retain the proportional behavior of an original unitless `1.5` when
descendant font sizes change. Set `--drasi-line-height: 1.5` on the theme source
for that behavior. Trading sets this token explicitly on its own `body`;
modal content uses the token when present and otherwise inherits, while tables
retain their `1.5` fallback.

`--drasi-color-code` is a legacy token copied for Trading's app-owned code
viewer, not a generic component requirement. Its styles and dark palette live
in the Trading app, not in the package. Custom colors/content still require
contrast and focus-visibility review.

This example needs no provider. Its modal uses the same scoped values as the
table even though the dialog is portaled to `body`.

```tsx
// @drasi-docs: scoped-modal.tsx
import { useRef, useState, type CSSProperties } from 'react';
import { DataTable, Modal, type ColumnDef } from '@drasi/react/components';
import '@drasi/react/styles.css';

interface Delivery { id: string; parcels: number }
type ScopedStyle = CSSProperties & Partial<Record<`--drasi-${string}`, string | number>>;
const theme: ScopedStyle = {
  fontFamily: 'system-ui, sans-serif',
  '--drasi-color-surface': '#f8fafc',
  '--drasi-color-dialog': '#f8fafc',
  '--drasi-color-text': '#0f172a',
  '--drasi-color-muted': '#334155',
  '--drasi-color-border': '#94a3b8',
  '--drasi-color-primary': '#075985',
  '--drasi-color-focus': '#075985',
  '--drasi-table-height': '20rem',
};
const columns: readonly ColumnDef<Delivery>[] = [
  { key: 'id', label: 'Delivery' }, { key: 'parcels', label: 'Parcels' },
];
const rows: readonly Delivery[] = [{ id: 'north', parcels: 12 }];

export function DeliveryPanel() {
  const [open, setOpen] = useState(false);
  const scope = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const close = () => setOpen(false);
  return <section ref={scope} style={theme}>
    <h2 ref={heading} tabIndex={-1}>Dispatch desk</h2>
    <DataTable<Delivery>
      rows={rows} columns={columns} rowKey={row => row.id} title="Deliveries"
    />
    <button ref={trigger} type="button" onClick={() => setOpen(true)}>Delivery details</button>
    <Modal
      open={open} onClose={close} title="Delivery details"
      description="Review the current dispatch count."
      initialFocusRef={closeButton} returnFocusRef={trigger}
      fallbackFocusRef={heading} themeRef={scope}
    >
      <h2>Delivery details</h2>
      <p>North route: {rows[0].parcels} parcels.</p>
      <button ref={closeButton} type="button" onClick={close}>Close details</button>
    </Modal>
  </section>;
}
```
