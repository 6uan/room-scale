# RoomScale Agent Instructions

## Product goal

RoomScale is for somebody moving into an apartment who has to decide what
furniture to buy from a floor plan, a few photographs, and at most one visit
with a tape measure.

The unit of work is the apartment, not the room. A floor plan is drawn whole —
every room at once, the way the listing showed it — because furniture is chosen
for a home and a sofa that fits the living room while blocking the hall is the
wrong sofa.

It runs entirely in the browser: no account, no server, and nothing uploaded.
Everything is stored on the reader's own machine, per
[ADR 0002](docs/adr/0002-local-first-persistence.md).

It answers that question end to end: measure the room once, bring furniture in
from the listing pages the person is already looking at, arrange it at true
size, find out what does not fit and by how much, and keep the resulting
shopping list and its total. The alternative it replaces is arithmetic on the
back of an envelope, a second trip to measure again, and a sectional that turns
out to block the hallway.

Seeing the room, rather than reading it, is a real goal and the last one. A
render that looks right and measures wrong is the exact mistake this application
exists to prevent, so the measurements come first and the picture comes after.

The application combines:

- room planning,
- furniture placement,
- spatial validation,
- layout comparison,
- and a shopping checklist.

Dimensional correctness is more important than photorealism.

## MVP constraints

The MVP supports:

- one floor, built out of rooms made of rectangular parts,
- doors, windows, and open passages,
- exact furniture dimensions,
- top-down and perspective views,
- furniture movement and rotation,
- wall, furniture, and doorway validation,
- multiple saved layouts,
- prices, product links, purchase statuses,
- IndexedDB persistence,
- JSON and CSV export.

**One floor only.** The apartment being planned has one, and a second storey
would buy nothing but a coordinate nobody needs. This is not a limitation to
work around; it is the shape of the problem.

Do not implement:

- floor-plan AI recognition,
- multiplayer,
- bulk retailer scraping or catalogue harvesting,
- AR,
- multi-story architecture,
- direct checkout.

Wanted, but not yet:

- **Assisted product import.** Filling the product form in from a pasted page,
  a pasted link, or — where those fail — a local language model, per
  [ADR 0005](docs/adr/0005-assisted-product-import.md). One page at a time, on
  an explicit user action. This is not the scraping ruled out above: no
  crawling, no bulk collection, no background fetching.

  A value that was extracted rather than typed is shown with the text it came
  from and confirmed before it is stored. Manual entry stays a first-class path
  permanently, because page formats change and parsers rot.

- **Photorealistic rendering.** It is a real goal, not a rejected one, and it is
  step 21 — the last step, after the tool answers its question. Building it
  earlier trades the thing that makes RoomScale useful for the thing that makes
  it look useful.

  When it arrives, a prettier render still never changes a measurement. If a
  model and its product dimensions disagree, the dimensions win, and validation
  keeps using the footprint.

## Technology

- Next.js
- React
- TypeScript strict mode
- React Three Fiber
- Three.js
- Drei
- Zustand
- Zod
- Dexie
- Vitest
- React Testing Library
- Playwright

## Coordinate system

- One Three.js unit equals one meter.
- X runs east across the floor plan; Z runs south down it.
- Y is vertical.
- Floor coordinates are shared by the whole apartment. A room has an origin —
  its north-west corner — and everything inside it is positioned in floor
  coordinates, not relative to the room.
- Furniture origins are centered horizontally at floor level.
- Rotation occurs around the Y axis.
- Retail measurements are converted to meters at the application boundary.

## Architecture

Keep these concerns separate:

- domain geometry
- domain validation
- persistence
- application state
- 3D rendering
- user-interface state

Geometry and validation modules must not import React, React Three Fiber,
Zustand, or browser-specific APIs.

Persistent state must be plain serializable data.

Do not store raw Three.js objects in Zustand or IndexedDB.

## Domain rules

A furniture product contains dimensions, price, retailer information, and
purchase status.

A furniture instance references a product and stores layout-specific position
and rotation.

Products and instances must remain separate.

## Geometry rules

Furniture footprints are oriented rectangles during the MVP.

A room's outline is a union of oriented rectangles — its parts. An L-shaped
room is two of them, a room with a notch is two, and a wall running at an angle
is a part that is turned. Keeping every part rectangular is what lets openings
sit on a wall with a start corner and a distance, and what keeps every shape
convex for the theorem below. A free polygon would take both away and buy only
the shapes nobody's apartment has.

A part may have **corners clipped**: each corner carries an optional cut, two
legs measured in from it along the part's own width and depth axes. That is
what a tape gives you at a clipped corner, and it stays two typeable numbers
where a boolean subtract would leave a path with no dimensions to type and no
wall to hang a door on. A rectangle with corners clipped is still convex, so
none of the above is given up to get one, and the chamfer it leaves is a wall
like any other — it draws, it carries a thickness, and it can take an opening.

Use the Separating Axis Theorem for rotated rectangle intersection, and its
convex-polygon form for a part that has a corner cut off it.

Validation must detect:

- furniture overlap,
- wall intersection,
- furniture outside every room,
- rooms overlapping one another,
- blocked openings,

Furniture is measured against the room it stands in, which is the room it
overlaps most. Reaching past that room's walls is reported even when another
room is on the far side: furniture cannot occupy a wall.

Unless there is no wall. A side marked open with another room's floor beyond
it is a way through, and a piece standing across it has walked into the next
room rather than through anything — which is how a living room open to a
kitchen is drawn: two rooms, meeting flush, with the sides between them open.
A balcony rail is open too and the floor simply stops there, so reaching past
one is still reported.

Every geometry utility must have unit tests.

## Measurement rules

- Store lengths in meters.
- Store currency as integer cents.
- Never use floating-point dollar values.
- Preserve the user’s preferred display unit separately.
- Avoid premature rounding during calculations.

## UI rules

The application must support:

- top-down plan view,
- perspective view,
- numeric transforms,
- visible validation messages,
- a non-3D checklist representation.

**Every value must remain typeable as a number.** This is a measurement rule
rather than an accessibility one: a dimension that can only be dragged is a
dimension nobody can trust, and the whole point of the tool is that its numbers
are right.

The plan is a pointer-first workspace — it pans, zooms, and is dragged on.
Keyboard shortcuts are welcome and are not a condition of shipping a feature.
The checklist remains readable and printable without touching the canvas at
all, so a project can always be understood without it.

## Code quality

- TypeScript strict mode
- No `any`
- Prefer pure functions for domain logic
- Add tests with every geometry change
- Keep components small
- Avoid hidden global mutable state
- Document non-obvious math
- Run lint, type check, unit tests, and end-to-end tests before completing work

## Scope management

`ROADMAP.md` holds the build order as a numbered sequence. Work through it one
step at a time, in order. Do not begin a step until the previous step is
finished and its checks pass, and do not implement a later step early because
it seems convenient.

Before implementing a feature:

1. State the intended change.
2. Identify affected domain types.
3. Identify tests required.
4. Implement the smallest complete version.
5. Run validation commands.
6. Summarize changes and remaining limitations.

Do not add unrelated dependencies or features.

## The apartment being planned

This is not a fixture to build at the end. It is the project being planned right
now, entered through the same interface anyone else would use — so a gap in the
tool shows up as a thing that cannot be entered, not as a test that fails later.

It is a two-bedroom apartment on one floor: a living room open to a kitchen and
a dining area, two bedrooms, two bathrooms, and the halls between them. The
living room is the room being furnished first, and it contains:

- an L-shaped sectional,
- a round coffee table,
- a television console,
- a 65-inch Hisense CanvasTV,
- a rug,
- an arc lamp,
- an artificial olive tree,
- olive accent pillows and a throw.
