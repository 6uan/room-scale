# `src/domain`

Pure, framework-free logic. Everything here is deterministic and testable
without a browser.

| Folder        | Holds                                                     |
| ------------- | --------------------------------------------------------- |
| `units/`      | Meter and integer-cent conversions at the input boundary. |
| `geometry/`   | Oriented rectangles, SAT intersection, clearance zones.   |
| `validation/` | Rules that turn geometry facts into user-facing problems. |

Rules:

- No imports from React, React Three Fiber, Three.js, Zustand, Dexie, Next, or
  any browser API. ESLint enforces this (`no-restricted-imports`).
- Prefer pure functions. No module-level mutable state.
- Every geometry utility ships with unit tests.
- Document non-obvious math inline.
