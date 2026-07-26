# Contributing to RoomScale

Thanks for taking the time. RoomScale is a small, opinionated project — the
guidelines below exist so that contributions stay easy to review.

## Before you start

- For anything beyond a typo, open an issue first and describe the change.
- Check [ROADMAP.md](ROADMAP.md). Work that belongs to a later milestone is
  usually declined for now, not because it is bad but because the foundations
  it needs are not there.
- Check the [ADRs](docs/adr). If your change contradicts one, that is a
  legitimate proposal — say so, and expect to write a superseding ADR.
- Do not add dependencies or features that the change does not require.

## Setup

Node 20.11+ and pnpm.

```bash
pnpm install
pnpm e2e:install   # once, for Playwright's Chromium
pnpm dev
```

## Working on a change

1. State the intended change.
2. Identify the domain types it affects.
3. Identify the tests it needs.
4. Implement the smallest complete version.
5. Run the checks.
6. Summarize what changed and what is still missing.

## Checks

```bash
pnpm verify   # format:check, lint, typecheck, unit tests
pnpm e2e      # end-to-end, if you touched anything user-facing
```

CI runs the same commands. A pull request that fails them will not be reviewed
until it passes.

## Code standards

- TypeScript strict mode. No `any` — if you genuinely need an escape hatch, use
  `unknown` and narrow it, and explain why in a comment.
- Domain logic (`src/domain`) is pure: no React, React Three Fiber, Three.js,
  Zustand, Dexie, or browser APIs. ESLint enforces this.
- Lengths are meters and money is integer cents. See
  [ADR 0001](docs/adr/0001-use-meters-internally.md).
- Persisted state is plain serializable data. Never store a Three.js object in
  Zustand or IndexedDB.
- Prefer pure functions. Avoid hidden global mutable state.
- Keep components small. Every capability must be reachable without the 3D
  canvas — keyboard editing, numeric inputs, and a non-3D checklist are
  requirements, not extras.
- Document non-obvious math where it lives.

## Tests

- Every geometry or validation change ships with unit tests. This is not
  negotiable; the geometry is the product.
- Unit tests live beside the code as `*.test.ts` / `*.test.tsx` and run in
  Vitest with React Testing Library.
- End-to-end specs live in `e2e/` and run in Playwright. Vitest never picks
  them up.
- Test behaviour through the accessible interface (roles, labels, text) rather
  than implementation details.

## Commits and pull requests

- [Conventional Commits](https://www.conventionalcommits.org/): `feat:`,
  `fix:`, `docs:`, `test:`, `chore:`, `refactor:`.
- One logical change per pull request.
- Describe what you changed, how you verified it, and what remains
  unfinished. Report failures honestly — a known limitation stated up front is
  far more useful than a green summary that is not true.

## Automated contributions

If you are using an AI agent, it must follow [AGENTS.md](AGENTS.md). You remain
responsible for the diff: review it, run the checks locally, and do not open a
pull request you have not read.
