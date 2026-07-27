# RoomScale Agent Instructions

## Product goal

RoomScale is a local-first browser application for testing whether furniture
fits inside a measured room while preserving required walkways.

The application combines:

- room planning,
- furniture placement,
- spatial validation,
- layout comparison,
- and a shopping checklist.

Dimensional correctness is more important than photorealism.

## MVP constraints

The MVP supports:

- one rectangular room,
- doors, windows, and open passages,
- exact furniture dimensions,
- top-down and perspective views,
- furniture movement and rotation,
- wall, furniture, doorway, and clearance-zone validation,
- multiple saved layouts,
- prices, product links, purchase statuses,
- IndexedDB persistence,
- JSON and CSV export.

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
  step 15 — the last step, after the tool answers its question. Building it
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
- X represents room width.
- Y is vertical.
- Z represents room depth.
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

Use the Separating Axis Theorem for rotated rectangle intersection.

Validation must detect:

- furniture overlap,
- wall intersection,
- furniture outside the room,
- blocked openings,
- protected walkway intersection.

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
- keyboard-accessible editing,
- numeric transforms,
- visible validation messages,
- a non-3D checklist representation.

The 3D canvas must not be the sole way to edit or understand a project.

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

## The room being planned

This is not a fixture to build at the end. It is the project being planned right
now, entered through the same interface anyone else would use — so a gap in the
tool shows up as a thing that cannot be entered, not as a test that fails later.

It is an apartment living room containing:

- an L-shaped sectional,
- a round coffee table,
- a television console,
- a 65-inch Hisense CanvasTV,
- a rug,
- an arc lamp,
- an artificial olive tree,
- olive accent pillows and a throw.

The route from the living room to the guest room must remain at least
36 inches wide, with 42 inches preferred.
