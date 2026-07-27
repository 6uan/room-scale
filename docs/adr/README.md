# Architecture decision records

One file per decision, numbered in the order it was made, named
`NNNN-short-title.md`.

A record is written when a decision constrains future code — a coordinate
convention, a storage boundary, a data-model split. It is not written for
reversible style choices.

Records are immutable once merged. To change a decision, add a new record and
mark the old one `Superseded by ADR-NNNN`.

| ADR                                               | Title                                      | Status   |
| ------------------------------------------------- | ------------------------------------------ | -------- |
| [0001](0001-use-meters-internally.md)             | Use meters internally                      | Accepted |
| [0002](0002-local-first-persistence.md)           | Local-first persistence                    | Accepted |
| [0003](0003-separate-products-from-instances.md)  | Separate furniture products from instances | Accepted |
| [0004](0004-draw-the-plan-view-on-a-2d-canvas.md) | Draw the plan view on a 2D canvas          | Accepted |
| [0005](0005-assisted-product-import.md)           | Assisted product import                    | Accepted |
