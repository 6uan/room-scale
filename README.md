# RoomScale

**Will it actually fit?**

RoomScale is a local-first browser application for testing whether furniture
fits inside a measured room while preserving the walkways you need. It combines
room planning, furniture placement, spatial validation, layout comparison, and
a shopping checklist.

Dimensional correctness comes before photorealism here. A sofa that renders
beautifully but blocks the hallway is a wrong answer. Photorealism is wanted,
and it is the last step rather than an abandoned one.

> **Status: roadmap steps 1–7 of 15 complete.** A rectangular room can be
> measured, given its doors, windows, and passages, and seen to scale in plan at
> `/plan`. Furniture can be entered at its exact product dimensions, with price,
> retailer, and link, at `/furniture`, filled in from a pasted product page.
> Furniture can be placed in the room at its true footprint, and everything is
> saved to IndexedDB. Step 8 — moving and rotating what you placed — is next.
> Steps 4 to 10 are the tool's whole reason for existing: what fits, and what
> it costs.
> [ROADMAP.md](ROADMAP.md) is a strict sequence, not a backlog.

## What it will do

- One rectangular room with doors, windows, and open passages
- Furniture entered at its exact product dimensions
- Top-down plan view and a perspective view of the same data
- Movement and rotation, by pointer or by typing numbers
- Validation of furniture overlap, wall intersection, out-of-room placement,
  blocked openings, and protected walkways
- Multiple saved layouts of the same room, for comparison
- Prices, product links, and purchase status in a shopping checklist
- Product details filled in from a pasted page or link, always shown for
  confirmation before they are stored
- Everything stored in your browser (IndexedDB), exportable as JSON or CSV

## Not in scope

Floor-plan recognition from photos, multiplayer, bulk retailer scraping, AR,
multi-story buildings, and checkout.

Photorealistic rendering is wanted but deliberately last, after the tool
answers the question it exists for.

## Getting started

Requires Node 20.11+ and pnpm.

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

If you reach the dev server on any hostname other than `localhost` — through a
tunnel, a reverse proxy, or from another machine — copy `.env.example` to
`.env.local` and list those hostnames in `DEV_ORIGINS`, or Next will reject the
requests.

## Scripts

| Command              | What it does                                  |
| -------------------- | --------------------------------------------- |
| `pnpm dev`           | Development server                            |
| `pnpm build`         | Production build                              |
| `pnpm start`         | Serve the production build                    |
| `pnpm lint`          | ESLint                                        |
| `pnpm format`        | Rewrite files with Prettier                   |
| `pnpm format:check`  | Fail if anything is unformatted               |
| `pnpm typecheck`     | `tsc --noEmit`, strict mode                   |
| `pnpm test`          | Vitest unit tests, once                       |
| `pnpm test:watch`    | Vitest in watch mode                          |
| `pnpm test:coverage` | Unit tests with a V8 coverage report          |
| `pnpm e2e`           | Playwright end-to-end tests (builds first)    |
| `pnpm e2e:install`   | Install the Chromium browser Playwright needs |
| `pnpm verify`        | format:check + lint + typecheck + unit tests  |

Run `pnpm verify` before opening a pull request; run `pnpm e2e` too if you
touched anything user-facing.

## Repository layout

```
src/
  app/            Next.js App Router routes and layouts
  components/     Non-3D React components
  domain/         Pure logic — no React, no Three.js, no browser APIs
    units/        Meter, area, and integer-cent conversions (implemented)
    room/         The room, its walls, and its openings (implemented)
    furniture/    Products: dimensions, price, retailer (implemented)
    project/      The saved document: room, products, unit (implemented)
    import/       Reading a product out of a pasted page (implemented)
    geometry/     Plan projection (implemented); SAT footprints (step 9)
    validation/   Fit and clearance rules (steps 9 and 11)
  persistence/    Dexie/IndexedDB schema and migrations (implemented)
  state/          Zustand store holding the active project (implemented)
  scene/          React Three Fiber rendering (step 14)
e2e/              Playwright specs
docs/adr/         Architecture decision records
```

`src/domain` is the heart of the project and is deliberately framework-free —
ESLint blocks React, Three.js, Zustand, Dexie, and Next imports there.

## Key decisions

- [ADR 0001 — Use meters internally](docs/adr/0001-use-meters-internally.md)
- [ADR 0002 — Local-first persistence](docs/adr/0002-local-first-persistence.md)
- [ADR 0003 — Separate furniture products from scene instances](docs/adr/0003-separate-products-from-instances.md)
- [ADR 0004 — Draw the plan view on a 2D canvas](docs/adr/0004-draw-the-plan-view-on-a-2d-canvas.md)
- [ADR 0005 — Assisted product import](docs/adr/0005-assisted-product-import.md)

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Agent-authored contributions must
follow [AGENTS.md](AGENTS.md). Security reports go through
[SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE).
