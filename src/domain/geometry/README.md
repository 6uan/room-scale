# `src/domain/geometry`

All lengths are meters; the XZ plane is the floor plane.

| Module               | Holds                                                             |
| -------------------- | ----------------------------------------------------------------- |
| `plan-projection.ts` | Fitting a floor extent into a pixel viewport, and back out again. |
| `oriented-rect.ts`   | Rectangular footprints that have been turned, and what is on one. |
| `sat.ts`             | Whether two footprints intersect, and by how much.                |
| `bounds.ts`          | How far a footprint reaches past the edges of the floor.          |

`unprojectPoint` is how the plan view is clicked: a canvas has no nodes to hit
test against, so a pointer position comes back through the projection into
meters and the question is asked of the floor.

`sat.ts` is the Separating Axis Theorem rather than a bounding-box comparison,
because a sofa turned 45° has a box far larger than the sofa and would be
reported as hitting things it clears. `bounds.ts` needs no such thing: the floor
is axis-aligned, so the corners answer directly.

Contact within `CONTACT_TOLERANCE_METERS` — a millimeter — is treated as
touching rather than overlapping. Pieces flush against each other are a
legitimate arrangement, and retail dimensions are not precise enough to argue
about less.

Still to come: detecting furniture that blocks a door or its swing.
