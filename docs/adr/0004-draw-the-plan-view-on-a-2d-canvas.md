# ADR 0004: Draw the plan view on a 2D canvas

- Status: Accepted
- Date: 2026-07-26

## Context

Step 3 of the roadmap needed a top-down view of the room and left the rendering
technology open, asking only that it not be an early 3D view — the 3D stack is
not due until step 6, and pulling it in sooner would make the plan view depend
on it forever.

That left two candidates for a 2D plan: SVG elements, or a `<canvas>` with a 2D
context.

(Step numbers below are the ones in force when this was decided. The roadmap was
resequenced afterwards; the reasoning is unaffected, since it turns on what the
plan view eventually has to draw rather than on when.)

SVG would have made the drawing inspectable. Walls and openings would be real
DOM nodes, assertable in Vitest and React Testing Library without a canvas mock,
focusable, and labelable. Canvas gives none of that: jsdom has no 2D context, so
in unit tests the drawing does not happen at all.

Canvas earns its place later. Step 7 adds pointer dragging, step 9 draws
per-frame validation feedback, and step 14 fills the room with furniture, each
piece with a footprint, a clearance zone, and a selection state. That is a
per-frame repaint of many shapes, which is what canvas is for and what a growing
SVG tree is not.

## Decision

**The plan view is drawn on a 2D canvas, and every calculation behind it lives
in a pure module that is tested without one.**

- `src/domain/geometry/plan-projection.ts` owns the meters-to-pixels transform:
  fitting an extent to a viewport, one uniform scale for both axes, and
  projecting floor points. It is unit tested directly.
- `src/domain/room/openings.ts` owns wall geometry — which wall a length runs
  along, where a point on a wall's inside face is, which way a wall faces. Also
  unit tested directly.
- The canvas component holds only the drawing calls. It reads its colors from
  the computed style, so one foreground color drives the whole drawing and the
  light and dark themes need no second palette.
- The canvas carries a text description of the room and its openings, and the
  numeric panel beside it stays the authoritative, editable representation.
  Nothing is knowable only by looking at the drawing.

## Consequences

Positive:

- The math is testable and stays testable, because it never touches a context.
- Dragging, per-frame validation, and a full room of furniture do not need the
  renderer to be replaced when they arrive.
- Theme support costs nothing per shape.

Negative:

- The drawing code itself — wall poché, opening symbols, dimension lines — is
  covered only by end-to-end tests in a real browser, and there only to the
  depth of "it ran and produced a sized backing store". A symbol drawn in the
  wrong place will not fail a unit test. Keeping the geometry in pure modules
  bounds how much can go wrong there, but does not eliminate it.
- Accessibility is a parallel implementation rather than a property of the
  markup. Every future feature has to add its non-canvas representation
  deliberately, and a review that forgets to will not be caught by a tool.
- A pixel is not a DOM node, so hit testing for selection in step 7 has to be
  written against the projection rather than delegated to the browser.
