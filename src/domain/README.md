# `src/domain`

Pure, framework-free logic. Everything here is deterministic and testable
without a browser.

| Folder        | Holds                                                             |
| ------------- | ----------------------------------------------------------------- |
| `units/`      | Meter, square-meter, degree, and integer-cent conversions.        |
| `room/`       | The apartment: rooms on a floor, their walls and openings.        |
| `furniture/`  | Furniture products: dimensions, price, retailer, purchase status. |
| `project/`    | The saved document: floor, products, unit, and the checklist.     |
| `import/`     | Reading a product out of the text of the page selling it.         |
| `geometry/`   | Oriented rectangles, SAT intersection, bounds, and projection.    |
| `validation/` | Rules that turn geometry facts into user-facing problems.         |

Rules:

- No imports from React, React Three Fiber, Three.js, Zustand, Dexie, Next, or
  any browser API. ESLint enforces this (`no-restricted-imports`).
- Prefer pure functions. No module-level mutable state.
- Every geometry utility ships with unit tests.
- Document non-obvious math inline.
