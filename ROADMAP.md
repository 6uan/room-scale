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

Status: **step 18, second slice is next.**

## Near-term pull requests

**Impact** is how much of the real apartment or furnishing decision a change
unlocks. **ROI** weighs that impact against implementation cost and risk. These
ratings compare the remaining work with itself; they are not promises about
calendar time.

| Order                 | Pull request boundary                                                                                                            | ROI         | Impact      | Why it is here                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------- | ----------- | ---------------------------------------------------------------------------------------------------------------- |
| Done — #24            | Draw rooms directly; rename them in place; edit and scrub X/Y and W/H/D; remove the retired planning feature and its stored data | **Highest** | **High**    | It turns room entry into one coherent, pointer-first workflow and removes scope that distracts from furnishing.  |
| Done — #25            | Snap canvas resizing and scrubbed W/D changes to neighbouring room faces through one shared rule                                 | **Highest** | Medium      | Small, contained work that closes the last inconsistent transform path before more geometry is added.            |
| Done — #26            | Place, select, move, and resize doors, windows, and passages on the plan while keeping every value typeable                      | **Highest** | **Highest** | Fourteen openings are the largest remaining source of repetitive arithmetic in entering the real apartment.      |
| Done — Step 18a       | Build an L-shaped or notched room from multiple axis-aligned rectangular parts, including persistence and validation             | **High**    | **Highest** | This expresses most currently impossible rooms without taking on rotation at the same time.                      |
| Step 18, second slice | Rotate room parts for diagonal walls                                                                                             | Medium      | High        | Required for the real plan, but only after the higher-leverage rectangular-part model is proven.                 |
| Step 18, final slice  | Mark edges open and distinguish exterior from interior wall thickness                                                            | Medium      | High        | Completes balconies, open living areas, and an honest apartment shell without bloating the first room-parts PR.  |
| Step 19               | Report furniture that blocks a door or passage                                                                                   | **High**    | **High**    | Once openings are correctly placed, this directly prevents a bad furnishing decision with bounded geometry work. |
| Deferred import       | Try a pasted product URL, with the existing paste-text flow as the permanent fallback                                            | Medium      | Medium      | It can remove typing on cooperative sites, but retailer rendering and anti-bot behavior cap its reliability.     |
| Step 20               | Add the dimensionally correct perspective view                                                                                   | Medium      | Medium      | It increases confidence and comprehension, but does not unlock a measurement the plan cannot already answer.     |
| Optional import       | Try a local model when deterministic product parsing fails                                                                       | Low         | Low         | Setup cost and limited audience make this a fallback, not a near-term product dependency.                        |
| Step 21               | Add materials, lighting, finishes, and eventually product geometry in separate stages                                            | Low now     | Medium      | Valuable presentation work, deliberately last because it cannot improve dimensional correctness.                 |

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

**6b — Paste a link.** A Next server endpoint fetches the page
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
validation, but they depend on doors being placed correctly on the finished
apartment plan. They are scheduled after the drawing steps.

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

### 11. Build the apartment out of rooms ✅

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

### 12. Make it one workspace ✅

The plan is a third of the screen and everything else is a column you scroll
past. Rooms made that worse. The shape of the interface is now the thing
holding the tool back.

It moves ahead of comparing layouts and export because the room list has made
the old stack of forms untenable. What is left adds a switcher and two buttons,
and those land in a workspace far more easily than in a column that would then
be torn out.

**One screen, three panels.**

- **Left, split.** What is in the apartment — rooms and the furniture standing
  in them — over the catalogue of things being considered. Selecting anything
  selects it on the plan.
- **Centre.** The plan, given the room it deserves, pannable and zoomable.
- **Right.** Whatever is selected, in full: a room's size and place, or a
  piece's position and rotation. Nothing is selected, and it shows the
  apartment's own settings.

**It pans and zooms like a design tool.** Scroll pans, ⌘ or Ctrl with scroll
zooms toward the pointer, space and drag pans, pinch zooms. A plain scroll never
zooms by accident, which is the mistake that makes a canvas feel hostile. Zoom
to fit is one key.

**The catalogue folds in; the checklist becomes an overview.** Adding and
picking furniture is part of arranging, so it happens here. What you leave with
— the list, the prices, the total, and later the export — moves to its own
page, which is the thing to print and take to a shop.

**The drafting look stays.** Monochrome lines, real dimension lines, hatched
walls, one accent for selection and red only for problems. Dimension text keeps
its size as the plan zooms, the way a design tool keeps its own furniture
constant. A measured plan is what makes the answers trustworthy; step 21 is
where it stops looking like a drawing.

**On the keyboard.** Earlier steps treated a key for every action as a gate on
shipping. That is relaxed: the workspace is a pointer-first tool, and shortcuts
arrive where they earn their place. What does not relax is that every value is
still a number you can type. That has never been about access — a dimension you
can only drag is a dimension you cannot trust.

Done. `/` is the workspace; `/plan`, `/furniture` and `/checklist` redirect to
where their work moved.

Selection turned out to be the spine. One idea — room, piece, or product —
covers every kind of thing, so pressing a name in the list and pressing a piece
on the plan do the same thing, and the panel on the right is always the editor
for whatever that was. It is what made the catalogue's own form just another
selection rather than a page.

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

### 13. Compare layouts ✅

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

### 14. Take the data elsewhere ✅

Done. From the overview: save the project, save the list as a spreadsheet, open
a project file.

An exported project is the same document IndexedDB holds, in the same versioned
envelope, so importing goes through `readStoredProject` — a file written by an
older build is migrated forward exactly the way a stored record is, and one from
a newer build is refused rather than half-read. A second format would have been
a second set of migrations to keep honest.

The CSV writes money as `1999.00` rather than `$1,999.00`, because a spreadsheet
adds up the first and cannot add up the second, and it ends on the total, which
is the number people opened it for. Names are quoted where they have to be:
furniture is called things like `Sofa, 3-seat` often enough to matter.

Not carried out of this step: importing replaces what is there rather than
merging, and says so before it happens. Merging two projects is a different
feature and nobody has needed it.

### 15. Lay the apartment out by hand ✅

Step 11 made rooms building blocks and then left them to be typed: a new one
landed east of everything else, and putting it where it went meant working out
its neighbour's edge plus a wall thickness. That is arithmetic in service of a
drawing, which is the wrong way round.

Done, in two halves.

**15a — Drag a room, and share a wall by getting near one. ✅** A room is moved
by dragging it on the plan, and let go within four inches of a neighbour it
takes the neighbour's wall as its own — `SNAP_METERS` in `floor.ts`. Sharing
wins over lining up, because sharing is what makes an apartment rather than a
diagram: two rooms a wall thickness apart have their wall bands in exactly the
same place, so one doorway cut in it opens through both.

**15b — Resize a room by dragging its walls. ✅** Eight handles, an edge moving
one wall and a corner moving two, snapping the same way and rounding to the
unit on screen so a dragged wall lands on a number somebody would have typed.

This step was built before it was written down: it shipped as PRs #18 and #19.
The roadmap is the build order, so this entry records where that work actually
belongs rather than inventing a step after the fact.

Corrected afterwards, and worth recording because the fix was not the one the
symptom suggested. Dragging felt violent — a wall pulled sixty pixels grew the
room by four and a half times that, and a hard swipe lost the apartment off the
edge with nothing but the fit key to find it again.

The cause was that a `PlanProjection` was not the whole transform it claimed to
be. It was built against the apartment's north-west corner, and everything
reading it added that corner back on — but the corner is _derived from where
the rooms are_. Dragging the west wall moved it, which moved the drawing, which
moved the floor point under a pointer that had not itself moved, which dragged
the wall further west. Pinning the view for the drag, which step 15b already
did, could not help: the second term was never pinned.

The projection now carries the origin it was fitted at, so a floor point goes
straight to a pixel and a pinned view pins everything. Damping the drag would
have hidden a feedback loop rather than closing it — a room has to track the
pointer exactly or it is not being dragged.

Two smaller things came with it. A view is held so at least a strip of the
apartment stays reachable, because panning has no natural limit and a tool
should not need rescuing. And one wheel notch is capped at fifteen percent:
a notch reports a hundred units where a trackpad pinch reports one, so the rate
that suited a pinch made a notch a third of the way in.

Not carried out of this step: rooms are dragged and resized, but not **made**
by pointer — "Add room" still puts a rectangle east of everything and leaves
you to move it. That is step 17.

---

## Drawing the apartment

The goal these two steps serve is one apartment on the screen: the real floor
plan, the one with two bedrooms, two bathrooms, a living room open to a kitchen
and a dining area, and the closets and halls between them. Fifteen or so
enclosed spaces, fourteen or so doors and windows.

The tool can already express most of it. What it cannot do is let anybody enter
it in an afternoon, and what it cannot express exactly is the handful of shapes
that are not rectangles. One step each.

### 16. Take it back ✅

Everything the last step made easy to do, it made easy to do by accident. A
wall is dragged to a number nobody meant, a room is dropped on top of its
neighbour, a room is deleted — and the only way back is to remember what it
said and type it again. Step 17 puts a pointer on the one thing still safe from
this, which is the wrong order to do it in.

**Undo, rather than a way to restore deleted rooms.** A trash can would cover
one accident. Undo covers the dragged wall, the moved room, the nudged sofa and
the deleted room with one idea, and there are more drags coming, not fewer.

It is cheap here because of a decision made in step 5: the project is plain
serializable data and every action in the store replaces it immutably. So the
history is a bounded list of past projects — no diffing, no command objects,
and no inverse operations to write and get subtly wrong.

Three decisions this step makes:

- **History is session-only and never stored.** It is a fact about this sitting
  at the machine, the same as which piece is selected, which step 8 also
  refused to save. A project opened on another machine does not come with
  somebody else's mistakes to undo.
- **It covers the project, not the view.** Rooms, furniture, products, and
  layouts. Not selection, not the display unit, not which layout is being
  looked at — undoing "I switched to inches" is a surprise rather than a mercy.
- **One gesture is one entry.** A drag calls the store a couple of hundred
  times and has to land as a single step back. This is the part of the step
  with any difficulty in it, and it is why the history is written where the
  actions are rather than at the edge of the interface.

**Deleting gets easier at the same time**, because it is only safe to make
easy once it is undoable: Delete removes what is selected, from the plan or
from the list.

**And a guide to what the keyboard does.** There are now enough keys — nudges,
turns, space to pan, the zoom keys, and undo itself — that nobody will find
them by looking. It is generated from the same table the application binds
from, so it cannot drift; a hand-written list of shortcuts is wrong within two
changes, and `PLACEMENT_KEY_HINT` is already a sentence duplicating the switch
below it.

Done. `history.ts` holds the past projects and nothing else — no React, no
store, no knowledge of what a project is — and the store is where an edit
becomes a step, because that is the one layer where an edit is a single call.

A gesture turned out to be the whole design. Every edit carries a string naming
what is doing it, `room-resize:room-2` or `piece-move:instance-1`, and while
that string holds the history replaces the value at the front rather than
pushing a new one. Closing it is what the canvas does on pointer-up, on key-up,
and on losing focus — that last one because a key held as focus leaves never
sends its key-up anywhere.

Keeping the view still across a step back needed its own rule. The display unit
and the arrangement on screen are saved in the project because they are worth
saving, but they are not the edit: without `keepingView`, taking back a moved
sofa would also flip the panel to centimeters if that had been changed since.

`shortcuts.ts` is one table that the handlers match against and the guide is
printed from, so a key that stops working stops being listed. It swallowed
`PLACEMENT_KEY_HINT`, which had been telling somebody working in inches that
the arrows moved a piece five centimeters; the distances now read in whatever
unit the reader is in, because they are generated from the constants that
decide them.

Opening a file is undoable and loading from storage is not. Replacing a project
somebody has been working on with the wrong file has to be one press back;
finding the project that was already there is not a thing to take back.

Not carried out of this step: **a typed value is its own step for every value
it passes through.** Typing `4.25` into a width field applies 4, then 4.2, then
4.25, and each is a step. A drag is the flood that mattered and it is handled;
this is three presses in the worst case, and fixing it means threading a
gesture down through every field, which is worth doing when it annoys somebody
rather than now. Undo also does not restore what was selected, for the same
reason selection was never saved: it is not part of the project.

### 17. Draw the plan instead of typing it ✅

Recreating a real floor plan today is fifteen rounds of press "Add room", drag
it across from wherever it landed, resize it, then type each door's distance
from that room's own north-west corner. The drawing is right at the end of it,
and almost none of the effort went into the drawing.

Two things become pointer work, and neither stops being a number. One each.

**17a — A room is drawn. ✅** Done. "Add room" no longer drops a rectangle east
of everything and leaves you to move it: it arms the plan for one room, and a
drag on it is that room. Both corners snap independently through `snapRoomEdge`, so a rectangle
pulled up against a neighbour shares its wall without anybody working out the
neighbour's edge plus a thickness. The preview is run through the same
`drawnRoom` the drop uses, because a preview that shows one rectangle and
produces another is worse than none.

Three decisions the step's own text did not settle:

- **A mode, not a modifier, and not the plain drag.** Dragging empty floor
  already pans, and a plan you cannot push around while laying rooms out would
  be worse than one that needs a button pressed first.
- **The mode lasts one room.** This was got wrong first, and the way it was
  got wrong is worth keeping. Six end-to-end tests failed on "Add room" no
  longer being a single press, and that was read as an argument for the mode
  staying armed: an apartment is fifteen rooms, so one press should buy all
  fifteen. It was a tidy argument about a task nobody performs. The thing
  anybody does straight after drawing a room is drag it into place, and an
  armed plan answers that by drawing another room on top of it — which is
  exactly what happened the first time it was used. Test churn is not a design
  signal. Escape still leaves the mode from anywhere, for a press that was a
  mistake, and it is handled at the window because pressing the button leaves
  focus on the button.
- **A click is still a room.** Below six pixels of travel the press was a
  click, and a click drops one the usual size, centred where it was put. The
  canvas tells a click from a drag because it knows pixels; it has no business
  knowing how big a room usually is, so the choice of size is made outside it.

`nextRoomOrigin` left with this: nothing puts a room east of everything any
more.

**17b — An opening is placed on the wall it belongs to. ✅** Done. A room's
door, window, or passage button arms the plan for one wall click. The opening
lands where it was clicked, stays selected, and the mode ends; like drawing a
room, it does one concrete thing and then gives the plan back.

Every opening is now a row beneath its room in the Apartment list and a thing
the canvas can hit-test. Drag the gap to move it along its wall, or select it
and drag either jamb to resize it while the other jamb stays put. Pointer
changes land on a value in the display unit and stop at corners or at the
minimum opening width. The center and width fields remain the exact path:
typing a measured number neither snaps nor approximates it, and the drawing
follows.

Wall picking and opening transforms are pure room geometry with unit tests.
The canvas supplies a fixed pixel reach converted through its current
projection, so a wall and a jamb remain possible to hit at any zoom. Placement
is scoped to the room whose button armed it; on a shared wall this avoids
storing the same opening twice, while the existing finished-wall punch order
still cuts it through both rooms.

Not carried out of this step: **blocked-opening validation**, which remains
step 19, and **multi-part rooms**, which begin in step 18.

### 18. Rooms that are not rectangles

The MVP said rectangular rooms, and for measuring a sofa against a wall that
was right. It stops being right at the exact moment the plan is a real
apartment: the living room, kitchen, dining area and entry are one continuous
space with corners in it, the ensuite wraps around its shower, and two walls
run at forty-five degrees.

Approximating those with rectangles would be the thing `AGENTS.md` forbids — a
drawing that looks right and measures wrong.

What a room becomes, and why this shape rather than a polygon:

- **A room is a union of rectangular parts.** An L is two parts, a notch is
  two, the open living space is three. Every part keeps square walls, so
  openings still sit on a wall with a start corner and a distance, the resize
  handles still mean something, and every footprint stays convex — which is
  what the Separating Axis Theorem needs. A free polygon would have taken all
  four of those away at once and bought only the shapes nobody's apartment has.
- **A part may be turned.** Rotation about the vertical axis, which
  `OrientedRect` and `sat.ts` already carry and `roomRect` currently hard-codes
  to zero. This is where the forty-five degree walls come from.
- **An edge may be open.** A balcony is a room with a railing where a wall
  would be, and drawing it enclosed would say something false about the
  apartment.
- **Interior and exterior wall thickness are two numbers, not one.** Step 11
  gave the floor one thickness because an apartment has one kind of wall. It
  has two: the shell is thicker than the partitions, and it is visible in every
  plan ever drawn.

Area, bounds, containment, which-room-is-this-piece-in, and the plan's punch
order all follow the parts. The stored document goes to version 7; a version 6
room becomes a room of one part, which is what it always was.

**18a — Axis-aligned parts. ✅** Done. A room now owns one or more rectangular
parts in floor coordinates. The inspector adds, removes, and numerically edits
every part; the plan draws their union and moves it as one room. Area counts
overlap once, furniture is assigned to the room it overlaps most, validation
measures footprints against the union instead of its bounding box, and
openings remember the part whose exterior wall they occupy. Stored projects
migrate from version 6 to version 7 as one-part rooms. A room remains one module
when selected and moved, while selecting one of its parts exposes that
rectangle's native move and resize handles on the plan as well as its exact
numeric fields.

Done when: the apartment above is on the screen at its real dimensions, with
nothing squared off that is not square, and every measurement it reports is one
you could check with a tape.

---

## Finishing the answer

### 19. Check blocked openings

Blocked openings are checked here, after doors can be placed on the finished
apartment plan. A console in front of a door must say the door cannot open, and
moving it out of the way must clear the problem.

---

## Fidelity

Nothing here changes an answer. It changes how easy the answer is to believe.

### 20. Add a perspective view

React Three Fiber, Three.js, and Drei arrive here. The same data, seen from
inside the room, with furniture as correctly sized boxes and the openings from
step 3 finally given their heights.

The plan view stays fully capable. Neither view is the only way in.

Done when: the room can be walked around, and every box measures what its
product says it measures.

### 21. Move toward photorealism

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

## The apartment being planned

The first real project is not a fixture built at the end — it is whatever is
being planned right now, entered through the same interface anyone else would
use.

That is now the whole apartment rather than one room of it: two bedrooms, two
bathrooms, a living room open to a kitchen and a dining area, a balcony, and
the closets and halls between them. Getting it onto the screen at its real
dimensions is what steps 17 and 18 are for, and it is the measure of whether
they worked.

The living room is still the room being furnished first: an L-shaped sectional,
a round coffee table, a television console, a 65-inch Hisense CanvasTV, a rug,
an arc lamp, an artificial olive tree, and olive accent pillows and a throw.

If planning it needs a special case in the engine, the engine is not finished.

## Explicitly out of scope

Floor-plan AI recognition, multiplayer, retailer scraping, AR, multi-story
architecture, direct checkout.

## Not scheduled

Non-rectangular furniture footprints, and an accessibility audit against WCAG
2.2 AA.

Non-rectangular **rooms** left this list at step 18: the apartment being planned
has them, so the engine has to.

Also considered and not scheduled: tracing the plan over a photograph of the
listing's floor plan, calibrated by drawing a line of known length. It would
make entering an apartment far easier and it breaks no rule — the image never
leaves the machine, and it changes no measurement. It waits because a traced
dimension is an eyeballed one, and steps 17 and 18 are about the numbers being
right. Worth revisiting if entering the apartment still turns out to be the
thing that stops people.
