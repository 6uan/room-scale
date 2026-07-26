# Roadmap

Milestones are deliberately small: each one ends with something that runs, is
tested, and passes CI. Dates are not promised; order is.

## Milestone 0 — Foundations ✅

Repository, toolchain, and continuous integration.

- Next.js + TypeScript strict mode
- ESLint + Prettier, with a lint rule keeping `src/domain` framework-free
- Vitest + React Testing Library
- Playwright
- Scripts for lint, format check, type check, unit tests, end-to-end tests
- GitHub Actions running all of them
- Landing page, project documentation, ADRs 0001–0003
- `src/domain/units`: meter and integer-cent conversion, fully tested

## Milestone 1 — Geometry core

Pure math, no interface. `src/domain/geometry`.

- `Vec2`, oriented rectangle footprints, transforms
- Separating Axis Theorem intersection for rotated rectangles
- Containment within room bounds
- Clearance-zone expansion around a footprint
- Exhaustive unit tests, including touching-edge and rotated cases

## Milestone 2 — Validation rules

`src/domain/validation`, built on Milestone 1.

- Furniture overlap
- Wall intersection and furniture outside the room
- Blocked doors, windows, and passages
- Protected walkway intersection with a minimum and a preferred width
- Structured issues (severity, instance ids, measured shortfall) ready to
  render

## Milestone 3 — Project model, state, and storage

- Zod-validated `FurnitureProduct` and `FurnitureInstance`
  ([ADR 0003](docs/adr/0003-separate-products-from-instances.md))
- Room, openings, walkways, and layouts
- Zustand stores over plain serializable state
- Dexie/IndexedDB persistence with versioned records and migrations
- JSON import/export and CSV export

## Milestone 4 — Plan view

- Top-down 2D editing of room, openings, and furniture
- Numeric transform inputs and keyboard editing
- Live validation messages
- The demo apartment living room, loadable as a fixture

## Milestone 5 — 3D view

- React Three Fiber, Three.js, and Drei enter the dependency list
- Perspective view of the same data, one unit per meter
- Camera presets, orbit, and view switching
- Plan view stays fully capable on its own

## Milestone 6 — Layouts and checklist

- Save, duplicate, rename, and compare layouts
- Shopping checklist with prices, links, and purchase status
- Totals derived from products, deduplicated by product id
- Print-friendly checklist output

## Later, not scheduled

Non-rectangular rooms, non-rectangular footprints, unit-preference persistence
across devices, accessibility audit against WCAG 2.2 AA.

## Explicitly out of scope

Floor-plan AI recognition, multiplayer, photorealistic rendering, retailer
scraping, AR, multi-story architecture, direct checkout.
