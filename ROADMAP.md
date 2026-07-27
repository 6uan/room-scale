# Roadmap

This is the build order for RoomScale. It is a **sequence, not a backlog**:
steps are done one at a time, in this order, and a step is not started until
the one before it is finished and its checks pass.

Two rules keep the order honest:

- **Every step changes what you can do that day.** A step that only moves code
  around, or that builds a foundation nobody stands on yet, is either too big
  or in the wrong place.
- **The point of the tool comes first.** RoomScale exists to answer one
  question — _will this furniture fit in this room, and what will it cost?_
  Steps 4 to 10 are that question end to end. Everything after them makes the
  answer nicer to look at.

Status: **step 5 is next.**

---

## Done

### 1. Read the product specification and propose the smallest implementation ✅

`AGENTS.md` is the specification. The proposal was scaffold plus toolchain, with
no planner code.

### 2. Create the repository foundation without adding 3D functionality ✅

Next.js with TypeScript strict mode, ESLint and Prettier, Vitest and React
Testing Library, Playwright, scripts for every check, GitHub Actions running
them, the module structure under `src/`, a landing page, project documentation,
and ADRs 0001–0003.

### 3. Implement a rectangular room using meters internally ✅

A `Room` with width, depth, height, and wall thickness in meters, plus its
openings — doors, windows, and open passages — each positioned along a wall by
center and width. Editable through numeric inputs in either unit, and drawn to
scale in a top-down plan view at `/plan`.

The plan view is a 2D canvas, recorded in
[ADR 0004](docs/adr/0004-draw-the-plan-view-on-a-2d-canvas.md).

Not carried out of this step: opening heights — a window's sill and head, a
door's head — which the plan view does not use. They arrive with the 3D view.

---

## The core loop

By the end of step 10 the tool answers the question it exists for. These steps
are the product; the rest is refinement.

### 4. Add furniture products — the things you can buy ✅

Done. `FurnitureProduct` — name, footprint and height in meters, price in
integer cents, retailer, product URL, purchase status — with its validity rules
in `src/domain/furniture`. A form to add and edit one, and a table of them, at
`/furniture`. No placement yet: this is the catalogue, not the room.

`money.ts` finally has callers. Prices are typed the way a retailer prints them
and stored as integer cents.

Zod did not arrive here — nothing crosses a trust boundary yet, so a schema
would have had no reader. It arrives in step 5 with the code that parses stored
data back.

Not carried out of this step: the catalogue total counts one of each, because
quantity comes from how many are placed and nothing can be placed yet. The real
budget is step 10.

### 5. Save the project, so nothing is typed twice ◀ next

Dexie over IndexedDB, per
[ADR 0002](docs/adr/0002-local-first-persistence.md). One versioned project
document holding the room and the products, Zod validated on read, with forward
migrations.

Built early and deliberately generic: later steps add fields to the document and
a migration, rather than building persistence again. Each migration gets a test
against a captured old payload, because they run on devices we cannot watch.

Done when: enter a room and three products, reload the page, and everything is
still there.

### 6. Fill a product in from its page, instead of typing it

Typing a dozen products by hand is the thing most likely to stop this tool being
used. This step removes most of that typing without ever letting a guessed
number reach the catalogue unseen, per
[ADR 0005](docs/adr/0005-assisted-product-import.md).

Three stages, each shipping on its own and in this order:

**6a — Paste the page text.** A parser over pasted text: JSON-LD `Product`
metadata if it is there, and dimension patterns (`112"W x 65"D x 34"H`,
`Overall Width - Side to Side: 112"`, `112 x 65 x 34 inches`) if it is not.
Pure, offline, and unit tested against real strings captured from the retailers
actually being used. Also the way an existing product gets corrected.

**6b — Paste a link.** A Next route handler fetches the page server-side, since
a browser cannot fetch cross-origin, and runs the same parser. Retailers that
block the fetch or render their page in JavaScript fall back to 6a with a plain
message saying so — this path is a convenience, never the only way in.

**6c — A local model for the pages the parser cannot read.** Ollama on
`localhost`, with output constrained to the product schema so it cannot return
something invalid. Entirely optional: if it is not running, 6a and 6b still
work.

Every stage ends the same way — a filled-in form showing what was found and the
source text it came from, which is confirmed or corrected before it becomes a
product. Nothing is accepted silently.

Done when: pasting an Article sectional page fills in its name, price, and
dimensions, and a page the parser cannot read says so instead of guessing.

### 7. Place products in the room

`FurnitureInstance`: a reference to a product plus a position and a Y rotation,
as decided in
[ADR 0003](docs/adr/0003-separate-products-from-instances.md). Instances are
drawn in the plan at their true footprint — rectangles at the exact dimensions
from the product page.

Done when: one product can be placed twice, editing its price changes both
placements, and both survive a reload.

### 8. Move and rotate what you placed

Select an instance; move it; rotate it around Y. Pointer dragging _and_ numeric
entry _and_ arrow keys, from the start — the canvas is never the only way in.

Hit testing goes through the plan projection rather than the DOM, since a canvas
has no nodes to click.

Done when: the same sofa can be nudged into the corner by dragging, by typing a
position, and by holding an arrow key.

### 9. Answer whether it fits

Separating Axis Theorem intersection for rotated rectangles, in
`src/domain/geometry` with exhaustive unit tests — touching edges, shared
corners, rotated cases. Detects furniture overlapping furniture, furniture
crossing a wall, and furniture outside the room.

Problems are shown as a readable list, not only as a color on the canvas.

Done when: pushing the coffee table into the sectional flags both, in words, and
says by how much.

### 10. Add the checklist and the budget

The non-3D representation of the project: every product with its quantity,
price, link, and purchase status, plus the total. Quantity comes from the
instance count and totals are derived from products deduplicated by id — never
stored, so they cannot drift from what is actually placed. Print-friendly.

Done when: the total matches the sum of what is in the room, and marking the rug
as bought changes what is still owed.

---

## Making it usable for real

### 11. Add protected walkways

User-drawn routes that must stay clear, each with a minimum and a preferred
width. Anything intersecting one is reported, with the shortfall in meters shown
in the user's unit.

The route from the living room to the guest room is the case that matters: at
least 36 inches, 42 preferred.

Done when: a sofa narrowing that route to 30 inches reports a 6 inch shortfall.

### 12. Compare layouts

Multiple named arrangements of the same room: save, duplicate, rename, switch,
compare. Products are shared across layouts; instances belong to one.

Done when: two arrangements of the same furniture can be looked at side by side
without losing either.

### 13. Take the data elsewhere

JSON export and import for the whole project, CSV export for the checklist.

Done when: a project exported, cleared, and re-imported is identical.

---

## Fidelity

Nothing here changes an answer. It changes how easy the answer is to believe.

### 14. Add a perspective view

React Three Fiber, Three.js, and Drei arrive here. The same data, seen from
inside the room, with furniture as correctly sized boxes and the openings from
step 3 finally given their heights.

The plan view stays fully capable. Neither view is the only way in.

Done when: the room can be walked around, and every box measures what its
product says it measures.

### 15. Move toward photorealism

The long goal, gated behind a working tool, and taken in stages so each one can
be judged on its own:

1. Per-product colors and materials, so a walnut console is not the same box as
   a white one.
2. Lighting and shadows, and the floor and wall finishes.
3. Real geometry — a downloaded or authored model per product, swapped in behind
   the same footprint the validation already uses.

The rule that survives every stage: **a prettier render never changes a
measurement.** If a model and its product dimensions disagree, the dimensions
win, and validation keeps using the footprint.

---

## The room being planned

The first real project is not a fixture built at the end — it is whatever is
being planned right now, entered through the same interface anyone else would
use. Currently that is an apartment living room: an L-shaped sectional, a round
coffee table, a television console, a 65-inch Hisense CanvasTV, a rug, an arc
lamp, an artificial olive tree, and olive accent pillows and a throw, with the
route to the guest room held at 36 inches minimum and 42 preferred.

If planning it needs a special case in the engine, the engine is not finished.

## Explicitly out of scope

Floor-plan AI recognition, multiplayer, retailer scraping, AR, multi-story
architecture, direct checkout.

## Not scheduled

Non-rectangular rooms, non-rectangular footprints, an accessibility audit
against WCAG 2.2 AA.
