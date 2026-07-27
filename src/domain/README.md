# `src/domain`

Pure, framework-free logic. Everything here is deterministic and testable
without a browser.

| Folder        | Holds                                                              |
| ------------- | ------------------------------------------------------------------ |
| `units/`      | Meter, square-meter, and integer-cent conversions at the boundary. |
| `room/`       | The rectangular room, its walls, and its openings.                 |
| `furniture/`  | Furniture products: dimensions, price, retailer, purchase status.  |
| `project/`    | The saved document: room, products, unit preference.               |
| `import/`     | Reading a product out of the text of the page selling it.          |
| `geometry/`   | Oriented rectangles, SAT intersection, clearance zones.            |
| `validation/` | Rules that turn geometry facts into user-facing problems.          |

Rules:

- No imports from React, React Three Fiber, Three.js, Zustand, Dexie, Next, or
  any browser API. ESLint enforces this (`no-restricted-imports`).
- Prefer pure functions. No module-level mutable state.
- Every geometry utility ships with unit tests.
- Document non-obvious math inline.
