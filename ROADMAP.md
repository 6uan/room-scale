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

Status: **step 15 is next.**

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

### 11. Keep the routes clear ✅

Two halves, each shipping on its own and in this order. They share one idea —
a zone furniture has to stay out of — which is why they are one step.

**11a — Protected walkways. ✅** Done. User-drawn routes that must stay clear, each with
a minimum and a preferred width. A route is a line across the floor with a
width, which makes it an oriented rectangle: the same shape step 9 already
measures. Anything intruding is reported with the width it leaves behind and
the shortfall against the minimum, in the reader's unit.

The route from the living room to the guest room is the case that matters: at
least 36 inches, 42 preferred.

A route is stored on the room beside its openings, so the same routes hold for
every layout step 12 will add. The document went to version 3, migrated from a
version 2 payload with no routes rather than a guessed one.

Measuring the width left is more than an intersection: in the corridor's own
frame each intruder covers a band across a stretch, and sweeping the stretches
finds the narrowest gap. Merging every intruder at once would have been simpler
and wrong — a sofa at one end and a console at the other, on opposite sides,
would report a corridor far narrower than the one you can walk down.

Not carried out of this step: **the form is not mounted.** The rules are live —
a project holding a route is measured against it and reported in the fit list —
but `/plan`'s left-hand column already holds dimensions, furniture, placements
and openings, and a fifth section would have made the case for step 14 by being
unusable. `RoomWalkwaysForm` is written and tested; step 14 gives it somewhere
to live. A route's ends are typed rather than dragged for the same reason the
numbers came first: 36 inches is a figure somebody has been told, not one they
can eyeball.

**Blocked openings moved to step 16.** `AGENTS.md` lists them under validation and step 9
deliberately left them: a door needs the arc it sweeps treated as a zone that
must stay clear, which is 11a's machinery pointed at a door instead of a
hallway. A piece standing in a doorway is a blocked route by another name.

Done when: a console in front of the door says the door cannot open, and moving
it six inches says the door clears it.

### 12. Build the apartment out of rooms ✅

A floor plan is a whole apartment, and until now RoomScale has drawn one
rectangle. A sofa that fits the living room and blocks the hall is the wrong
sofa, and there has been no way to say so.

Rooms become **building blocks**: a rectangle with a name, a size, and a place
on the floor. Add one, size it, put it where it goes, and the plan draws the
apartment — every room at once, the way the listing showed it.

Decisions this step makes, and why:

- **A room carries its position, and rooms may overlap.** Shared walls derived
  from adjacency would be truer to a real plan and much more work, and it would
  make every room's position depend on its neighbours. Two blocks overlapping is
  a mistake worth reporting, in the same list that reports everything else — not
  a state the editor refuses to enter.
- **Wall thickness belongs to the floor, not the room.** An apartment has one
  wall thickness, and asking for it per room would be asking the same question
  five times.
- **Walkways move from the room to the floor.** The route that matters runs from
  the living room to the guest room, and a route that cannot leave a room is not
  the route anybody meant.
- **Furniture is placed on the floor**, and the room it is in is worked out from
  where it sits. A rug half in the hallway is a real thing to do, and a piece
  owned by a room could not express it.
- **Furniture is measured against the room it mostly occupies.** Reaching past
  that room's walls is reported even when another room is on the far side,
  because furniture cannot occupy a wall.
- **One floor.** Not a limitation to work around later — the apartment being
  planned has one storey, and a second would buy a coordinate nobody needs.

The stored document goes to version 4: a version 3 project becomes an apartment
of one room at the origin, which is exactly what it always was.

Done. Every decision above holds. What it looks like in use: a Rooms section
where each block carries its name, its size, where it stands, and its own doors
and windows; a plan that draws the whole apartment with each room named inside
it; and a summary that counts rooms and measures the place end to end.

Not carried out of this step: rooms do not snap to each other, so two blocks
meeting exactly is a matter of typing the same number twice. Snapping wants a
pointer, and rooms cannot be dragged yet either — both belong with the
workspace.

### 13. Make it one workspace ✅

The plan is a third of the screen and everything else is a column you scroll
past. Rooms made that worse, and the walkway form is sitting on `main`
unmounted because there was nowhere honest to put it. The shape of the
interface is now the thing holding the tool back.

It moves ahead of comparing layouts and export because the two surfaces that
argued for waiting — walkways and rooms — have both shipped. What is left adds
a switcher and two buttons, and those land in a workspace far more easily than
in a column that would then be torn out.

**One screen, three panels.**

- **Left, split.** What is in the apartment — rooms, the furniture standing in
  them, the routes — over the catalogue of things being considered. Selecting
  anything selects it on the plan.
- **Centre.** The plan, given the room it deserves, pannable and zoomable.
- **Right.** Whatever is selected, in full: a room's size and place, a piece's
  position and rotation, a route's widths. Nothing is selected, and it shows
  the apartment's own settings.

**It pans and zooms like a design tool.** Scroll pans, ⌘ or Ctrl with scroll
zooms toward the pointer, space and drag pans, pinch zooms. A plain scroll never
zooms by accident, which is the mistake that makes a canvas feel hostile. Zoom
to fit is one key.

**The catalogue folds in; the checklist becomes an overview.** Adding and
picking furniture is part of arranging, so it happens here. What you leave with
— the list, the prices, the total, and later the export — moves to its own
route, which is the thing to print and take to a shop.

**The drafting look stays.** Monochrome lines, real dimension lines, hatched
walls, one accent for selection and red only for problems. Dimension text keeps
its size as the plan zooms, the way a design tool keeps its own furniture
constant. A measured plan is what makes the answers trustworthy; step 18 is
where it stops looking like a drawing.

**On the keyboard.** Earlier steps treated a key for every action as a gate on
shipping. That is relaxed: the workspace is a pointer-first tool, and shortcuts
arrive where they earn their place. What does not relax is that every value is
still a number you can type. That has never been about access — a dimension you
can only drag is a dimension you cannot trust.

Done. `/` is the workspace; `/plan`, `/furniture` and `/checklist` redirect to
where their work moved.

Selection turned out to be the spine. One idea — room, piece, route, or product
— covers every kind of thing, so pressing a name in the list and pressing a
piece on the plan do the same thing, and the panel on the right is always the
editor for whatever that was. It is what let the walkway form come back after
sitting unmounted since 11a, and what made the catalogue's own form just
another selection rather than a page.

The plan holds its projection now rather than fitting one on every paint, which
is all panning and zooming turned out to be. One bug came of it that only the
browser could catch: hit testing was fitting a projection of its own, so a
panned plan drew in one place and answered clicks in another.

Not carried out of this step: rooms still cannot be dragged or snapped, and the
list does not reorder anything. Both want more pointer work than the shell did.

The end-to-end suite was rewritten against the workspace rather than adapted —
forty tests describing a page of forms became seventeen describing a tool. The
e2e build also moved to its own directory, having clobbered the dev server
three times.

### 14. Compare layouts ✅

Done. Named arrangements of the same apartment, switched from the top bar:
duplicate, rename, delete. Products are shared across every one of them —
marking the rug owned marks it owned everywhere, because you only buy it once —
and instances belong to a layout, which is the split ADR 0003 was made for.

Two decisions the step's own text did not settle:

- **Switching, not two canvases.** "Side by side" could have meant two plans
  drawn at once, each in half the space. What the comparison is actually for is
  choosing between furniture, and that is a question about money and fit rather
  than about seeing both drawings at the same instant.
- **The comparison is the price.** Each arrangement's total sits in the
  switcher, and the overview lists them all against each other with the
  cheapest named. A number you have to navigate to is a number nobody checks.

The stored document goes to version 5, migrating a version 4 project into a
single arrangement called "First try" — which is what it always was.

Not carried out of this step: a layout cannot be started from an empty floor,
only duplicated from one that exists. Comparing two plans visually, if it is
ever wanted, is a different feature from comparing two prices.

### 15. Take the data elsewhere ◀ next

JSON export and import for the whole project, CSV export for the checklist,
offered from the overview — the page that already exists to be taken away.

Done when: a project exported, cleared, and re-imported is identical.

### 16. Finish the clearance checks

The half of step 11 that was deliberately left, now that a route can cross a
whole apartment: a door's swing arc as a zone that must stay clear, and a piece
standing in a doorway reported as the blocked route it is.

It waits until here because a doorway between two rooms is only expressible once
there are two rooms, and because the workspace in step 13 is what gives a
walkway somewhere to be drawn.

Done when: a console in front of the door says the door cannot open, and moving
it six inches says the door clears it.

---

## Fidelity

Nothing here changes an answer. It changes how easy the answer is to believe.

### 17. Add a perspective view

React Three Fiber, Three.js, and Drei arrive here. The same data, seen from
inside the room, with furniture as correctly sized boxes and the openings from
step 3 finally given their heights.

The plan view stays fully capable. Neither view is the only way in.

Done when: the room can be walked around, and every box measures what its
product says it measures.

### 18. Move toward photorealism

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
