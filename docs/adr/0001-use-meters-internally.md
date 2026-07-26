# ADR 0001: Use meters internally

- Status: Accepted
- Date: 2026-07-26

## Context

RoomScale exists to answer a dimensional question, so unit errors are not
cosmetic — they are the failure mode of the whole product. The application
takes measurements from at least three sources:

- a person measuring a room, often in feet and inches,
- retail product pages, which mix inches, centimeters, and millimetres,
- clearance guidance, usually stated in inches (36" minimum, 42" preferred).

Three.js has no units of its own; a unit is whatever the application says it
is. Physically-based lighting, camera near/far planes, and shadow bias all
behave best when one unit is roughly one meter.

If each value carried its own unit, every geometry function would have to
either accept a unit argument or trust its caller. Both invite drift: a
Separating Axis Theorem test comparing a value in inches against one in
centimeters produces a confident, wrong answer.

## Decision

**Every length inside the application is a number of meters.** One Three.js
unit equals one meter.

- Conversion happens once, at the application boundary, in
  `src/domain/units/length.ts`. Nothing downstream converts again.
- Axes: X is room width, Y is vertical, Z is room depth. Furniture origins sit
  at floor level, centered horizontally. Rotation is around Y.
- The unit a person reads is a separate display preference. It affects
  rendering of a value, never its storage.
- Rounding happens at format time only. Intermediate math keeps full
  precision.
- Angles are radians internally, for the same reason.

Prices are not lengths and follow the opposite rule: they are stored as
integer cents, never floating-point dollars. See `src/domain/units/money.ts`.

## Consequences

Positive:

- Geometry functions take plain numbers with one meaning. Their tests do not
  need unit fixtures.
- Persisted documents are unambiguous years later, and JSON/CSV exports need no
  unit column per field.
- Three.js, physics-style clearance offsets, and camera framing all work at a
  natural scale.

Negative:

- Imperial users never see a stored value directly; a `3' 6"` input becomes
  `1.0668`. Debugging a saved file requires converting mentally.
- Round-tripping imperial input through a decimal meter and back can surface
  values like `35.99999999999999` inches. Formatters must round for display,
  and equality comparisons in geometry must use an epsilon rather than `===`.
- Every new input path must be reviewed for a missing conversion. This is the
  main risk the decision creates, and code review is the control for it.
