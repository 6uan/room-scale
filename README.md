# RoomScale

**You get one visit with a tape measure. Then you have to furnish the place.**

RoomScale works out what furniture will fit in the apartment you are moving
into — before you buy any of it, and without going back to measure again.

It runs in your browser. No account, nothing uploaded, and the project stays on
your own machine.

Measure the rooms once. Bring furniture in from the listing pages you already
have open, at the dimensions the retailer printed. Arrange it in a plan drawn to
scale, and RoomScale tells you what does not fit and by how much: a sectional
overlapping the coffee table, a console pushed through a wall, the route to the
bedroom narrowed below what a person can walk through. What you are left with is
a shopping list whose total you can trust, because every price on it belongs to
something that has a place in the room.

Eventually you will be able to see it, rather than read it. A 3D view of the
same data is the last step rather than the first, because a render that looks
right and measures wrong is the exact mistake this tool exists to prevent. When
it arrives, the dimensions still win.

## Who it is for

Somebody who has just signed for an apartment. You have the listing floor plan,
a few photos of empty rooms, and — if you are lucky — one visit with a tape
measure. Every sofa you like is fifteen minutes of arithmetic and a guess, and
the wrong guess is a restocking fee or a living room you cannot walk through.

RoomScale is the place to do that arithmetic once, keep it, and change your mind
about the furniture instead of the measurements.

## How it works

1. **Measure the rooms once** — each room's width, depth, and ceiling, where it
   sits in the apartment, and where the doors, windows, and open passages are. Type inches or centimeters; it stores meters
   either way.
2. **Bring the furniture in from its page** — paste a product page and RoomScale
   reads the name, price, and dimensions out of it. Every value it extracts is
   shown with the text it came from and confirmed before it is stored, and
   typing one in by hand stays a first-class path.
3. **Put it in the room** — pieces are drawn at their true footprint, and moved
   and turned by dragging, by typing numbers, or with the arrow keys.
4. **Find out what does not fit** — overlaps, wall crossings, and blocked
   routes, reported in words with the amount, in your unit. Not a color on a
   canvas you have to interpret.
5. **Keep the list** — every product with its quantity, price, link, and whether
   you have bought it yet, and a total that comes from what is actually in the
   room.

## Where it is now

**Roadmap steps 1–11 of 18 are done.** What works today:

- A rectangular room, measured in either unit, with its doors, windows, and open
  passages, drawn to scale in plan at `/plan`.
- A catalogue at `/furniture` — exact dimensions, price in integer cents,
  retailer, link, purchase status — filled in from a pasted product page.
- Furniture placed in the room at its true footprint, moved and turned by
  dragging, by typing a position, or with the arrow keys.
- Overlaps, wall crossings, and pieces outside the room, reported in words with
  the amount they are out by.
- A printable checklist at `/checklist` — quantity, price, link, and purchase
  status per item, with what the room costs and what is still to buy.
- Protected walkways: routes that must stay clear, each with a width you need
  and a width you would rather have, reported with what is left and by how much
  it falls short. The rules are live; the form for drawing one is written but
  not yet on the page, and arrives with the interface pass in step 15.
- Everything saved in your browser, and nothing sent anywhere.

Still to come, in this order: **the whole apartment rather than one room**
(step 12), comparing layouts (13), JSON and CSV export (14), editing the whole project
on one screen (15), the doorway and clearance checks (16), the perspective view
(17), and photorealism (18).

[ROADMAP.md](ROADMAP.md) is a strict sequence, not a backlog. Steps 4 to 10 are
the tool's whole reason for existing: what fits, and what it costs. Everything
after them makes the answer nicer to look at.

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
    project/      The saved document, and the checklist derived from it
    import/       Reading a product out of a pasted page (implemented)
    geometry/     Plan projection, oriented rectangles, SAT (implemented)
    validation/   Fit rules (implemented); clearance rules (step 11)
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
