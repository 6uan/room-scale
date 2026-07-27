# `src/domain/geometry`

All lengths are meters; the XZ plane is the floor plane.

| Module               | Holds                                                             |
| -------------------- | ----------------------------------------------------------------- |
| `plan-projection.ts` | Fitting a floor extent into a pixel viewport, and back out again. |
| `oriented-rect.ts`   | Rectangular footprints that have been turned, and what is on one. |

`unprojectPoint` is how the plan view is clicked: a canvas has no nodes to hit
test against, so a pointer position comes back through the projection into
meters and the question is asked of the floor.

Still to come: Separating Axis Theorem intersection, room-bounds containment,
and clearance-zone expansion.
