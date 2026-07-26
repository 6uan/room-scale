# ADR 0003: Separate furniture products from scene instances

- Status: Accepted
- Date: 2026-07-26

## Context

Two different kinds of fact are attached to a piece of furniture.

Facts about the _thing you can buy_: dimensions, price in cents, retailer,
product URL, whether it has been ordered. These come from the world, are the
same wherever the item stands, and are shared by every copy of it.

Facts about _this copy, in this layout_: position, rotation, which layout it
belongs to, whether it is currently selected.

The demo living room already needs both: two olive accent pillows are one
product placed twice, and the same sectional appears in several saved layouts
being compared. Flattening these into one record forces a choice between
duplicating the price — and then having to edit it in four places when it goes
on sale — or losing the ability to place the same product twice.

## Decision

**A furniture product and a placed instance are separate entities. An instance
references a product by id.**

```
FurnitureProduct       id, name, retailer, productUrl, priceCents,
                       purchaseStatus, footprint { widthM, depthM }, heightM

FurnitureInstance      id, productId, layoutId,
                       position { x, z }, rotationY
```

- Products are owned by the project and shared across all of its layouts.
- Instances are owned by a layout. Copying a layout copies instances only.
- The shopping checklist and the total cost are computed from products,
  deduplicated by product id, with a quantity derived from instance count.
- Geometry only ever needs a footprint plus a transform, so validation takes
  the joined pair and returns issues keyed by instance id.
- Deleting a product that still has instances is refused, not cascaded.

## Consequences

Positive:

- Price and purchase status have exactly one home. Marking the sectional
  "ordered" is one write regardless of how many layouts contain it.
- Comparing layouts is meaningful: two layouts differ in placement while
  agreeing on what the furniture is and what it costs.
- Cost totals cannot drift from placement, because they are derived rather than
  stored.

Negative:

- Almost every read is a join. Rendering, validation, and export all need to
  resolve `productId`, and a missing product is a state the code must handle
  rather than assume away. Zod parsing on load plus a referential-integrity
  check makes this loud instead of silent.
- More moving parts than a single record: two stores, two id spaces, and a
  deletion rule to explain in the interface.
- Per-instance overrides — a shortened custom shelf, a second sectional in a
  different fabric — do not fit. The intended answer is a separate product, and
  if that proves wrong the model will need a variant concept and a new ADR.
