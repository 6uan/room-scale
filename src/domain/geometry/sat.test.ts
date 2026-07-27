import { describe, expect, it } from "vitest";
import type { OrientedRect } from "./oriented-rect";
import { orientedRectOverlap } from "./sat";

/** A two by one rectangle at a place and an angle. */
function rect(
  xMeters: number,
  zMeters: number,
  rotationRadians = 0,
  widthMeters = 2,
  depthMeters = 1,
): OrientedRect {
  return {
    center: { xMeters, zMeters },
    widthMeters,
    depthMeters,
    rotationRadians,
  };
}

const QUARTER_TURN = Math.PI / 2;
const EIGHTH_TURN = Math.PI / 4;

describe("orientedRectOverlap: rectangles that are apart", () => {
  it("finds no overlap between two rectangles separated along X", () => {
    expect(orientedRectOverlap(rect(0, 0), rect(3, 0))).toBeNull();
  });

  it("finds no overlap between two rectangles separated along Z", () => {
    expect(orientedRectOverlap(rect(0, 0), rect(0, 2))).toBeNull();
  });

  it("treats edge to edge contact as apart, not as overlapping", () => {
    // Two meters wide, so centers two meters apart put their edges together.
    expect(orientedRectOverlap(rect(0, 0), rect(2, 0))).toBeNull();
  });

  it("treats a shared corner as apart", () => {
    expect(orientedRectOverlap(rect(0, 0), rect(2, 1))).toBeNull();
  });

  it("separates along a turned rectangle's own axis", () => {
    // Both turned the same way: still two rectangles side by side.
    const a = rect(0, 0, EIGHTH_TURN);
    const b = {
      ...rect(0, 0, EIGHTH_TURN),
      center: {
        xMeters: 2 * Math.cos(EIGHTH_TURN),
        zMeters: 2 * Math.sin(EIGHTH_TURN),
      },
    };

    expect(orientedRectOverlap(a, b)).toBeNull();
  });

  it("clears a diagonal piece a bounding box would say it hits", () => {
    // This is the case the theorem is here for. The turned rectangle's bounding
    // box reaches (1.06, 1.06), which is inside the neighbor's [1, 2] square,
    // so comparing boxes would report a collision. The rectangle itself stops
    // at the line x + z = 1.41, and the neighbor's nearest corner (1, 1) sums
    // to 2 — a third of a meter clear.
    const turned = rect(0, 0, EIGHTH_TURN);
    const neighbor = rect(1.5, 1.5, 0, 1, 1);

    expect(orientedRectOverlap(turned, neighbor)).toBeNull();
  });
});

describe("orientedRectOverlap: rectangles that intersect", () => {
  it("reports how far one has to move to clear the other", () => {
    // Centers 1.5 m apart on rectangles 2 m wide: half a meter into each other.
    const overlap = orientedRectOverlap(rect(0, 0), rect(1.5, 0));

    expect(overlap?.depthMeters).toBeCloseTo(0.5, 12);
  });

  it("takes the shorter way out when both axes overlap", () => {
    // 0.4 m deep into each other and 1.6 m wide into each other: the depth is
    // the smaller, because that is the least a piece has to move.
    const overlap = orientedRectOverlap(rect(0, 0), rect(0.4, 0.6));

    expect(overlap?.depthMeters).toBeCloseTo(0.4, 12);
  });

  it("finds a rectangle sitting entirely inside another", () => {
    const overlap = orientedRectOverlap(
      rect(0, 0, 0, 4, 4),
      rect(0, 0, 0, 1, 1),
    );

    // A meter square in the middle of a four meter square: half a meter to any
    // edge, and a meter for the piece to be clear of it altogether.
    expect(overlap?.depthMeters).toBeCloseTo(1, 12);
  });

  it("finds two identical rectangles on top of each other", () => {
    const overlap = orientedRectOverlap(rect(1, 1), rect(1, 1));

    expect(overlap?.depthMeters).toBeCloseTo(1, 12);
  });

  it("catches a turned piece crossing an unturned one", () => {
    // Turned a quarter, the two by one runs one wide and two deep, so it
    // reaches into a neighbor that was clear of it before.
    const neighbor = rect(0, 1.2, 0, 1, 1);

    expect(orientedRectOverlap(rect(0, 0), neighbor)).toBeNull();
    expect(
      orientedRectOverlap(rect(0, 0, QUARTER_TURN), neighbor),
    ).not.toBeNull();
  });

  it("is symmetrical", () => {
    const a = rect(0, 0, EIGHTH_TURN);
    const b = rect(1, 0.5, QUARTER_TURN);

    expect(orientedRectOverlap(a, b)?.depthMeters).toBeCloseTo(
      orientedRectOverlap(b, a)?.depthMeters ?? -1,
      12,
    );
  });

  it("does not report an overlap thinner than a millimeter", () => {
    // Half a millimeter in: closer than any measurement here is trustworthy.
    expect(orientedRectOverlap(rect(0, 0), rect(1.9995, 0))).toBeNull();
  });
});
