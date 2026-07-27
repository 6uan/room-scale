import { describe, expect, it } from "vitest";
import { corridorClearance, type Intruder } from "./clearance";
import type { OrientedRect } from "./oriented-rect";

/**
 * A corridor four meters long and one meter wide, running west to east along
 * z = 0. In its own frame `u` runs from -2 to 2 and `v` from -0.5 to 0.5.
 */
const CORRIDOR: OrientedRect = {
  center: { xMeters: 0, zMeters: 0 },
  widthMeters: 4,
  depthMeters: 1,
  rotationRadians: 0,
};

function box(
  id: string,
  xMeters: number,
  zMeters: number,
  widthMeters: number,
  depthMeters: number,
  rotationRadians = 0,
): Intruder {
  return {
    id,
    rect: {
      center: { xMeters, zMeters },
      widthMeters,
      depthMeters,
      rotationRadians,
    },
  };
}

describe("corridorClearance: an empty corridor", () => {
  it("is as wide as it was drawn", () => {
    expect(corridorClearance(CORRIDOR, [])).toEqual({
      clearMeters: 1,
      intruderIds: [],
    });
  });

  it("ignores something beside the corridor", () => {
    const clearance = corridorClearance(CORRIDOR, [box("a", 0, 2, 1, 1)]);

    expect(clearance.clearMeters).toBe(1);
    expect(clearance.intruderIds).toEqual([]);
  });

  it("ignores something past either end of it", () => {
    const clearance = corridorClearance(CORRIDOR, [box("a", 3, 0, 1, 1)]);

    expect(clearance.clearMeters).toBe(1);
  });

  it("treats a piece touching the edge as beside it, not in it", () => {
    // The corridor's north edge is at z = -0.5, and this box ends exactly there.
    expect(
      corridorClearance(CORRIDOR, [box("a", 0, -1, 1, 1)]).clearMeters,
    ).toBe(1);
  });
});

describe("corridorClearance: something in the way", () => {
  it("measures what is left beside an intruder", () => {
    // A 0.4 m deep box centered on the corridor's north edge reaches 0.2 m in,
    // leaving 0.8 m of the meter.
    const clearance = corridorClearance(CORRIDOR, [box("a", 0, -0.5, 1, 0.4)]);

    expect(clearance.clearMeters).toBeCloseTo(0.8, 10);
    expect(clearance.intruderIds).toEqual(["a"]);
  });

  it("leaves nothing when a piece crosses the whole width", () => {
    expect(
      corridorClearance(CORRIDOR, [box("a", 0, 0, 1, 2)]).clearMeters,
    ).toBe(0);
  });

  it("takes the narrowest point, not the average", () => {
    // One box reaching a long way in over a short stretch.
    const clearance = corridorClearance(CORRIDOR, [
      box("a", 0, -0.3, 0.2, 0.8),
    ]);

    expect(clearance.clearMeters).toBeCloseTo(0.4, 10);
  });

  it("adds up two pieces narrowing the same stretch from both sides", () => {
    const clearance = corridorClearance(CORRIDOR, [
      box("north", 0, -0.5, 1, 0.4),
      box("south", 0, 0.5, 1, 0.4),
    ]);

    // 0.2 m in from each side of a meter leaves 0.6 m.
    expect(clearance.clearMeters).toBeCloseTo(0.6, 10);
    expect(clearance.intruderIds).toEqual(["north", "south"]);
  });

  it("does not add up two pieces at opposite ends of the route", () => {
    // This is the case a single merged band would get wrong: each end is
    // narrowed to 0.8 m, and the corridor is 0.8 m at its worst — not 0.6.
    const clearance = corridorClearance(CORRIDOR, [
      box("west", -1.5, -0.5, 0.5, 0.4),
      box("east", 1.5, 0.5, 0.5, 0.4),
    ]);

    expect(clearance.clearMeters).toBeCloseTo(0.8, 10);
    expect(clearance.intruderIds).toEqual(["west", "east"]);
  });

  it("finds the gap between two pieces standing in the middle", () => {
    // Two boxes 0.3 m apart across a meter-wide corridor: the way through is
    // the gap between them, not the scraps at the edges.
    const clearance = corridorClearance(CORRIDOR, [
      box("north", 0, -0.4, 1, 0.6),
      box("south", 0, 0.45, 1, 0.5),
    ]);

    // North reaches z = -0.1, south starts at z = 0.2.
    expect(clearance.clearMeters).toBeCloseTo(0.3, 10);
  });

  it("measures a corridor that does not run along an axis", () => {
    // The whole scene from "what is left beside an intruder", turned a quarter
    // turn: the corridor now runs north to south and the box with it. Turning
    // the rectangle is what swaps its axes, so its width stays its width.
    const turned: OrientedRect = { ...CORRIDOR, rotationRadians: Math.PI / 2 };
    const clearance = corridorClearance(turned, [
      box("a", 0.5, 0, 1, 0.4, Math.PI / 2),
    ]);

    expect(clearance.clearMeters).toBeCloseTo(0.8, 10);
  });

  it("measures a turned piece by its corners", () => {
    // A 0.4 m square turned an eighth reaches 0.283 m from its center rather
    // than 0.2, so it eats further into the corridor than it would square on.
    const square = corridorClearance(CORRIDOR, [box("a", 0, -0.5, 0.4, 0.4)]);
    const turned = corridorClearance(CORRIDOR, [
      box("a", 0, -0.5, 0.4, 0.4, Math.PI / 4),
    ]);

    expect(square.clearMeters).toBeCloseTo(0.8, 10);
    expect(turned.clearMeters).toBeCloseTo(0.717, 3);
  });

  it("has nothing to offer for a corridor with no width", () => {
    expect(
      corridorClearance({ ...CORRIDOR, depthMeters: 0 }, []).clearMeters,
    ).toBe(0);
  });
});
