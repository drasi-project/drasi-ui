# React controls

Start with the [React developer guide](../../docs/developer-guide/README.md)
for the complete learning path. These sidecar references live beside the
implementation they describe:

| Implementation | Reference |
| --- | --- |
| [DataTable.tsx](DataTable.tsx) | [DataTable props, columns/actions, slots, sorting, and sizing](DataTable.md) |
| [QueryTable.tsx](QueryTable.tsx) | [QueryTable state and shared composition](QueryTable.md) |
| [Modal.tsx](Modal.tsx) / [ModalLayer.tsx](ModalLayer.tsx) | [Modal props, focus, portals, and accessibility](Modal.md) |

Edit the sidecars, then run `npm run docs:sync`. Generated copies in
`packages/react/docs/reference` keep the same contracts reachable from an
installed package without shipping implementation/test source.

See also [hooks](../react/README.md), [Server provider](../adapters/drasi-server/README.md),
and the [complete reference index](../../docs/reference/README.md).
