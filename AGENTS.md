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
- photorealistic rendering,
- retailer scraping,
- AR,
- multi-story architecture,
- direct checkout.

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

Before implementing a feature:

1. State the intended change.
2. Identify affected domain types.
3. Identify tests required.
4. Implement the smallest complete version.
5. Run validation commands.
6. Summarize changes and remaining limitations.

Do not add unrelated dependencies or features.

## Current real-world demo

The first demo is an apartment living room containing:

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
