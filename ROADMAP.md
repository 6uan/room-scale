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

Status: **step 11 is next.**

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

### 5. Save the project, so nothing is typed twice ✅

Done. Dexie over IndexedDB, per
[ADR 0002](docs/adr/0002-local-first-persistence.md). One versioned project
document holding the room, the products, and the display-unit preference, Zod
validated on read.

`/plan` and `/furniture` are now two views of one project rather than two
islands, through a Zustand store that holds state and does no input or output.
Reading and writing live in `ProjectGate`, which holds the interface back until
storage has been read — rendering the editor first would let someone type into
a default room and then have the load overwrite it.

A record that cannot be read is kept aside rather than overwritten, and a
document from a newer build is refused rather than half-understood.

Not carried out of this step: there is only version 1, so there is nothing to
migrate yet. The read path dispatches on version and refuses what it does not
recognize, which is the part that has to exist before there is a version 2.

### 6. Fill a product in from its page, instead of typing it ◀ 6a only

Typing a dozen products by hand is the thing most likely to stop this tool being
used. This step removes most of that typing without ever letting a guessed
number reach the catalogue unseen, per
[ADR 0005](docs/adr/0005-assisted-product-import.md).

Three stages, each shipping on its own and in this order:

**6a — Paste the page text. ✅** A parser over pasted visible text, in
`src/domain/import`, filling the form for confirmation. Reads labelled axes
(`70"W x 15.7"D x 20.5"H`, `Overall Width - Side to Side: 112"`) in inches,
feet, centimeters, or millimeters, and falls back to positional triples
(`52.8 x 125.8 x 36.4 inches`) marked as an assumed order. Also the way an
existing product gets corrected.

Outstanding: Target's own rendered text is not a captured fixture. Its formats
are covered by pattern rather than by a real capture, because getting it needs
JavaScript to run. Pasting that page into the panel and reporting what it got
wrong is the cheapest way to close that, whenever it comes up.

Two findings from the real pages changed the plan. Neither Target nor Amazon
publishes schema.org metadata for furniture, so there is no structured source
to prefer — the JSON-LD step was dropped. And it reads rendered text rather
than HTML, because retail markup is full of stylesheet lengths and script
numbers that look exactly like measurements.

**6b — Paste a link.** A Next route handler fetches the page
server-side, since a browser cannot fetch cross-origin, strips it to text, and
runs the same parser. Both pages tried so far return 200, but Target's is a
JavaScript shell whose markup carries no title, price, or dimensions — so this
path is a convenience for the pages it works on, never the only way in.

**6c — A local model for the pages the parser cannot read.** Ollama on
`localhost`, with output constrained to the product schema so it cannot return
something invalid. Entirely optional: if it is not running, 6a and 6b still
work.

Every stage ends the same way — a filled-in form showing what was found and the
source text it came from, which is confirmed or corrected before it becomes a
product. Nothing is accepted silently.

Done when: pasting an Article sectional page fills in its name, price, and
dimensions, and a page the parser cannot read says so instead of guessing.

### 7. Place products in the room ✅

Done. `FurnitureInstance` — a product reference plus a position and a rotation
about the vertical axis, as decided in
[ADR 0003](docs/adr/0003-separate-products-from-instances.md). Instances are
drawn in the plan at their true footprint, rotated about their own center.

A product can be placed more than once: two of the same pillow are one product
and two placements. Deleting a product that is still in the room is refused
rather than cascaded, which is the rule ADR 0003 set and this step activated.

The stored document went to version 2, so this is the first real migration. A
version 1 project simply had nothing placed, and the step from 1 to 2 is tested
against a payload captured from version 1.

Not carried out of this step: where a piece lands is a starting point, stepped
diagonally so copies do not stack invisibly. Moving and rotating is step 8, and
until then a placement cannot be adjusted.

### 8. Move and rotate what you placed ✅

Done. A piece is selected by clicking it on the plan or by pressing its name in
the list beside it, and then moved by dragging, by typing a position, or by
holding an arrow key — 5 cm a press, 1 cm with Shift. It is turned by typing
degrees, or with `[` and `]` at 15° a press. All three ways in shipped
together, because the canvas is never the only way in.

Hit testing goes through the plan projection rather than the DOM: a pointer
position comes back through `unprojectPoint` into meters, and the question is
asked of the footprints themselves. Those footprints are now `OrientedRect`s in
`src/domain/geometry` — the shape step 9 runs the Separating Axis Theorem over,
arriving early because a rotated piece has to be clickable before it can be
validated.

Only the _center_ of a piece is held on the floor. A sofa may still overhang a
wall, because "that does not fit" is an answer step 9 gives in words, not
something a drag should quietly prevent.

Not carried out of this step: which piece is selected is not saved, being a
fact about the session rather than about the project; and nothing snaps or
aligns to anything, so squaring a piece against a wall is still done by eye or
by typing.

### 9. Answer whether it fits ✅

Done. `sat.ts` implements the Separating Axis Theorem over the oriented
rectangles step 8 introduced, and returns the penetration depth — the least a
piece has to move — rather than a boolean, because that is the number worth
telling somebody. `bounds.ts` measures how far a footprint reaches past each
edge of the floor, which needs no theorem: the floor is axis-aligned, so the
corners answer directly.

`src/domain/validation`, empty since step 2, now holds `checkLayout`. It reports
overlaps between pieces, a piece crossing a wall and by how much, and a piece
outside the room altogether. The list appears beside the plan in words, in the
reader's own unit, and announces itself as it changes; the plan marks the pieces
involved in red as an illustration of the list, never as the report.

Touching is not overlapping. Contact within a millimeter is treated as flush,
because a console pushed against a sofa is a legitimate arrangement and a
retailer's rounded inches are not precise enough to argue about less.

Not carried out of this step: **blocked openings**. `AGENTS.md` lists them under
validation but no step ever scheduled them, and a door needs its swing treated
as a clearance zone — which is step 11's machinery. They belong there, and step
11's text now says so.

### 10. Add the checklist and the budget ✅

Done. `/checklist` is the project without the drawing: every placed product with
its quantity, price each, line total, link, and purchase status, and three
figures — what the room costs, what has been ordered or is already owned, and
what is still to buy.

Quantity is counted from the instances and the totals are added up on every
render. Nothing is stored, so no number can drift from the furniture it
describes. Products are deduplicated by id before counting, so a catalogue that
somehow holds one twice still bills for it once.

Ordered counts as spent alongside owned: retailers take the money when the order
goes in, so a sofa on a lorry is not something you still have to buy.

Printing drops the navigation and the dropdowns, leaving the words they were
showing and a product's link as its address rather than as "Open Sectional".

Not carried out of this step: a product in the catalogue with nothing placed is
listed as not counted rather than priced, because the total is a fact about the
room. Buying two of something still means placing it twice — there is no
quantity field, and there should not be one while quantity means "how many are
standing in the plan".

---

## Making it usable for real

### 11. Keep the routes clear ◀ next

Two halves, each shipping on its own and in this order. They share one idea —
a zone furniture has to stay out of — which is why they are one step.

**11a — Protected walkways.** User-drawn routes that must stay clear, each with
a minimum and a preferred width. A route is a line across the floor with a
width, which makes it an oriented rectangle: the same shape step 9 already
measures. Anything intruding is reported with the width it leaves behind and
the shortfall against the minimum, in the reader's unit.

The route from the living room to the guest room is the case that matters: at
least 36 inches, 42 preferred.

Done when: a sofa narrowing that route to 30 inches reports a 6 inch shortfall.

**11b — Blocked openings.** `AGENTS.md` lists them under validation and step 9
deliberately left them: a door needs the arc it sweeps treated as a zone that
must stay clear, which is 11a's machinery pointed at a door instead of a
hallway. A piece standing in a doorway is a blocked route by another name.

Done when: a console in front of the door says the door cannot open, and moving
it six inches says the door clears it.

### 12. Compare layouts

Multiple named arrangements of the same room: save, duplicate, rename, switch,
compare. Products are shared across layouts; instances belong to one.

Done when: two arrangements of the same furniture can be looked at side by side
without losing either.

### 13. Take the data elsewhere

JSON export and import for the whole project, CSV export for the checklist.

Done when: a project exported, cleared, and re-imported is identical.

### 14. Make it editable on one page

By here the left-hand column of `/plan` holds dimensions, furniture, placements,
openings, and walkways, and the project spans three routes. That is a reasonable
way to build it and a poor way to use it.

The plan and the checklist become the two things always on screen, and
everything else is edited where it lives: a modal for the room, for a product,
for a placement, for a walkway. Nothing new can be answered afterwards — this is
the step that stops the answers being buried.

It comes after 13 and not before, because 11, 12, and 13 each add something that
has to be edited, and a shell designed before them would be rebuilt three times.
It comes before the perspective view, because that view needs room on the screen
too, and building it into a cramped page is worse than fixing the page first.

The rule that governs it: every modal is reachable, escapable, and returns focus
where it came from, and every value in one is still editable as a number. The
canvas is not the only way in, and neither is the mouse.

Done when: a room can be measured, furnished, arranged, checked, and priced
without leaving one screen — and the whole of that can be done from the
keyboard.

---

## Fidelity

Nothing here changes an answer. It changes how easy the answer is to believe.

### 15. Add a perspective view

React Three Fiber, Three.js, and Drei arrive here. The same data, seen from
inside the room, with furniture as correctly sized boxes and the openings from
step 3 finally given their heights.

The plan view stays fully capable. Neither view is the only way in.

Done when: the room can be walked around, and every box measures what its
product says it measures.

### 16. Move toward photorealism

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
