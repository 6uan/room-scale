import { describe, expect, it } from "vitest";
import {
  UNDERLAY_WIDTH_LIMITS,
  createUnderlay,
  resizedUnderlay,
  underlayCorners,
  underlayExtentMeters,
  underlayWithWidth,
  type PlanUnderlay,
} from "./underlay";

const DROPPED: PlanUnderlay = createUnderlay(
  "data:image/png;base64,x",
  800,
  600,
  {
    xMeters: 0,
    zMeters: 0,
  },
);

describe("createUnderlay", () => {
  it("assumes a plausible width and centers the image where asked", () => {
    expect(underlayExtentMeters(DROPPED).widthMeters).toBeCloseTo(8, 10);
    expect(underlayExtentMeters(DROPPED).depthMeters).toBeCloseTo(6, 10);
    expect(DROPPED.origin).toEqual({ xMeters: -4, zMeters: -3 });
    expect(DROPPED.visible).toBe(true);
  });
});

describe("underlayCorners", () => {
  it("gives the four corners the handles sit on", () => {
    expect(underlayCorners(DROPPED)).toEqual([
      { corner: "north-west", at: { xMeters: -4, zMeters: -3 } },
      { corner: "north-east", at: { xMeters: 4, zMeters: -3 } },
      { corner: "south-east", at: { xMeters: 4, zMeters: 3 } },
      { corner: "south-west", at: { xMeters: -4, zMeters: 3 } },
    ]);
  });
});

describe("resizedUnderlay", () => {
  it("takes the dragged corner to the pointer, holding the opposite one", () => {
    // (8, 6) is on the image's own diagonal from its north-west corner, so
    // the aspect-locked size lands exactly under the hand.
    const bigger = resizedUnderlay(DROPPED, "south-east", {
      xMeters: 8,
      zMeters: 6,
    });

    expect(bigger.origin).toEqual({ xMeters: -4, zMeters: -3 });
    expect(underlayExtentMeters(bigger)).toEqual({
      widthMeters: 12,
      depthMeters: 9,
    });
  });

  it("moves the origin when the north-west corner is the one dragged", () => {
    const smaller = resizedUnderlay(DROPPED, "north-west", {
      xMeters: 0,
      zMeters: 0,
    });

    // The south-east corner stayed at (4, 3) and the image shrank onto it.
    expect(smaller.origin.xMeters).toBeCloseTo(0, 10);
    expect(smaller.origin.zMeters).toBeCloseTo(0, 10);
    expect(underlayExtentMeters(smaller).widthMeters).toBeCloseTo(4, 10);
  });

  it("holds the north or west edge still for the other two corners", () => {
    const fromNorthEast = resizedUnderlay(DROPPED, "north-east", {
      xMeters: 8,
      zMeters: -6,
    });
    // The south-west corner is what does not move: (-4, 3).
    expect(fromNorthEast.origin.xMeters).toBeCloseTo(-4, 10);
    expect(
      fromNorthEast.origin.zMeters +
        underlayExtentMeters(fromNorthEast).depthMeters,
    ).toBeCloseTo(3, 10);

    const fromSouthWest = resizedUnderlay(DROPPED, "south-west", {
      xMeters: -8,
      zMeters: 6,
    });
    // And here it is the north-east corner: (4, -3).
    expect(fromSouthWest.origin.zMeters).toBeCloseTo(-3, 10);
    expect(
      fromSouthWest.origin.xMeters +
        underlayExtentMeters(fromSouthWest).widthMeters,
    ).toBeCloseTo(4, 10);
  });

  it("never stretches the plan, however far off the diagonal it is pulled", () => {
    for (const point of [
      { xMeters: 8, zMeters: 0 },
      { xMeters: 0, zMeters: 6 },
      { xMeters: 30, zMeters: -20 },
    ]) {
      const resized = resizedUnderlay(DROPPED, "south-east", point);
      const { widthMeters, depthMeters } = underlayExtentMeters(resized);

      expect(widthMeters / depthMeters).toBeCloseTo(800 / 600, 10);
    }
  });

  it("cannot be collapsed onto nothing or dragged off the floor", () => {
    // Pulled back past the corner it is anchored to.
    const collapsed = resizedUnderlay(DROPPED, "south-east", {
      xMeters: -100,
      zMeters: -100,
    });
    expect(underlayExtentMeters(collapsed).widthMeters).toBeCloseTo(
      UNDERLAY_WIDTH_LIMITS.minMeters,
      10,
    );

    const stretched = resizedUnderlay(DROPPED, "south-east", {
      xMeters: 5000,
      zMeters: 5000,
    });
    expect(underlayExtentMeters(stretched).widthMeters).toBeCloseTo(
      UNDERLAY_WIDTH_LIMITS.maxMeters,
      10,
    );
  });
});

describe("underlayWithWidth", () => {
  it("takes a typed width and keeps the image's proportions", () => {
    const typed = underlayWithWidth(DROPPED, 12);

    expect(underlayExtentMeters(typed)).toEqual({
      widthMeters: 12,
      depthMeters: 9,
    });
  });

  it("holds the top-left corner, which is what X and Y read", () => {
    expect(underlayWithWidth(DROPPED, 20).origin).toEqual(DROPPED.origin);
  });

  it("refuses a width that is no width at all", () => {
    expect(underlayWithWidth(DROPPED, 0)).toBe(DROPPED);
    expect(underlayWithWidth(DROPPED, -3)).toBe(DROPPED);
  });
});
