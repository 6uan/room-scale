# Roadmap

This is the build order for RoomScale. It is a **sequence, not a backlog**:
steps are done one at a time, in this order, and a step is not started until
the one before it is finished and its checks pass.

The order is deliberate. The geometry has to be right before anything is drawn,
and the generic system has to work before it is dressed in a real apartment.
Work that jumps ahead — a 3D view before the room model, a demo before
validation — will be asked to wait.

Status: **step 3 is next.**

---

### 1. Read the product specification and propose the smallest implementation for Milestone 0 ✅

Done. `AGENTS.md` is the specification. The proposal was scaffold plus
toolchain, with no planner code.

### 2. Create the repository foundation without adding 3D functionality ✅

Done. Next.js with TypeScript strict mode, ESLint and Prettier, Vitest and
React Testing Library, Playwright, scripts for every check, GitHub Actions
running them, the module structure under `src/`, a landing page, project
documentation, and ADRs 0001–0003.

Three.js, React Three Fiber, Drei, Zustand, Dexie, and Zod are deliberately not
installed. They arrive at the step that needs them.

### 3. Implement a rectangular room using meters internally ◀ next

A `Room` with width, depth, and height in meters, plus its openings — doors,
windows, and open passages — positioned on a wall. Editable through numeric
inputs and rendered in a top-down plan view.

Done when: a room can be described, edited, and seen in plan, with every stored
length in meters and every displayed length converted at the edge.

Open question to settle when we start: the plan view here is 2D. Confirm it is
plain SVG or Canvas rather than an early 3D view, so step 2's "no 3D" holds
until step 6.

### 4. Add tests for all unit conversions before implementing furniture

A gate, not a feature. Every conversion in `src/domain/units` must be tested
before any furniture code is written.

`length.ts` and `money.ts` are already covered — 11 tests, including exact
inch-to-meter values, sign handling, and integer-cent parsing. Any conversion
added for the room in step 3 must be tested here before step 5 begins.

### 5. Implement furniture products and scene instances as separate entities

`FurnitureProduct` (dimensions, price in cents, retailer, URL, purchase status)
and `FurnitureInstance` (product reference, position, rotation), as decided in
[ADR 0003](docs/adr/0003-separate-products-from-instances.md). Zod schemas,
in-memory state only — persistence is step 11.

Done when: one product can be placed twice, and editing its price changes both
placements.

### 6. Add dimensionally accurate placeholder objects

Furniture rendered at its true footprint and height. Boxes, not models — a
sectional is a correctly sized box before it is anything prettier.

This is where the 3D dependencies land, if we choose to render in 3D at this
step. The plan view must stay fully capable either way.

### 7. Implement selection, movement, and rotation

Select an instance, move it, rotate it around Y. Pointer dragging _and_ numeric
entry _and_ keyboard, from the start — the canvas is never the only way in.

### 8. Extract all geometry calculations into framework-independent modules

Everything positional moves into `src/domain/geometry`: no React, no Three.js,
no browser APIs. The ESLint boundary rule on `src/domain` already fails the
build if that slips.

Note: steps 3–7 should write their math this way to begin with. This step is
the audit that proves it — if it turns into a large refactor, the earlier steps
were done wrong.

### 9. Add collision and room-boundary validation with tests

Separating Axis Theorem intersection for rotated rectangles. Detect furniture
overlap, wall intersection, and furniture outside the room. Exhaustive unit
tests including touching edges, shared corners, and rotated cases.

### 10. Add protected walkway zones

User-drawn routes that must stay clear, each with a minimum and a preferred
width. Detect anything intersecting them, and report by how much a route is
narrowed — a shortfall in meters, displayed in the user's unit.

Also covers blocked doors, windows, and passages.

### 11. Add persistence and project import/export

Dexie over IndexedDB, per
[ADR 0002](docs/adr/0002-local-first-persistence.md). Versioned records, Zod
validation on read, forward migrations, JSON import/export, CSV export.

Migrations get tests against captured old payloads. They run on user devices
where we cannot see them fail.

### 12. Add layouts

Multiple named arrangements of the same room. Save, duplicate, rename, switch,
compare. Products are shared across layouts; instances belong to one.

### 13. Add checklist and budget functionality

The non-3D representation of the project: products, prices, links, purchase
status. Totals derived from products deduplicated by id, with quantity from
instance count — never stored, so they cannot drift. Print-friendly.

### 14. Populate the apartment demo only after the generic system works

The living room from `AGENTS.md`: L-shaped sectional, round coffee table,
television console, 65-inch Hisense CanvasTV, rug, arc lamp, artificial olive
tree, olive accent pillows and throw — with the route to the guest room held at
36 inches minimum, 42 preferred.

It is a fixture built on the finished system, and it is the acceptance test for
the whole roadmap. If the demo needs a special case in the engine to work, the
engine is not finished.

---

## Explicitly out of scope

Floor-plan AI recognition, multiplayer, photorealistic rendering, retailer
scraping, AR, multi-story architecture, direct checkout.

## Not scheduled

Non-rectangular rooms, non-rectangular footprints, an accessibility audit
against WCAG 2.2 AA.
