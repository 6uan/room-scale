# RoomScale

**Will it actually fit?**

RoomScale is a local-first browser application for testing whether furniture
fits inside a measured room while preserving the walkways you need. It combines
room planning, furniture placement, spatial validation, layout comparison, and
a shopping checklist.

Dimensional correctness matters more than photorealism here. A sofa that
renders beautifully but blocks the hallway is a wrong answer.

> **Status: roadmap steps 1–2 of 14 complete.** The repository, toolchain, and
> CI are in place; the planner is not built yet. Step 3 — a rectangular room
> measured in meters — is next. [ROADMAP.md](ROADMAP.md) is a strict sequence,
> not a backlog.

## What it will do

- One rectangular room with doors, windows, and open passages
- Furniture entered at its exact product dimensions
- Top-down plan view and a perspective view of the same data
- Movement and rotation, by pointer or by typing numbers
- Validation of furniture overlap, wall intersection, out-of-room placement,
  blocked openings, and protected walkways
- Multiple saved layouts of the same room, for comparison
- Prices, product links, and purchase status in a shopping checklist
- Everything stored in your browser (IndexedDB), exportable as JSON or CSV

## Not in scope

Floor-plan recognition from photos, multiplayer, photorealistic rendering,
retailer scraping, AR, multi-story buildings, and checkout.

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
    units/        Meter and integer-cent conversions (implemented)
    geometry/     Footprints and SAT intersection (Milestone 1)
    validation/   Fit and clearance rules (Milestone 2)
  persistence/    Dexie/IndexedDB schema, migrations, export (Milestone 3)
  state/          Zustand stores (Milestone 3)
  scene/          React Three Fiber rendering (Milestone 4)
e2e/              Playwright specs
docs/adr/         Architecture decision records
```

`src/domain` is the heart of the project and is deliberately framework-free —
ESLint blocks React, Three.js, Zustand, Dexie, and Next imports there.

## Key decisions

- [ADR 0001 — Use meters internally](docs/adr/0001-use-meters-internally.md)
- [ADR 0002 — Local-first persistence](docs/adr/0002-local-first-persistence.md)
- [ADR 0003 — Separate furniture products from scene instances](docs/adr/0003-separate-products-from-instances.md)

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and
[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Agent-authored contributions must
follow [AGENTS.md](AGENTS.md). Security reports go through
[SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE).
