import { describe, expect, it } from "vitest";
import { orientedRectContains, orientedRectCorners } from "./oriented-rect";
import type { OrientedRect } from "./oriented-rect";

/** Two by one, centered on the origin, unturned. */
const FLAT: OrientedRect = {
  center: { xMeters: 0, zMeters: 0 },
  widthMeters: 2,
  depthMeters: 1,
  rotationRadians: 0,
};

const QUARTER_TURN = Math.PI / 2;

describe("orientedRectCorners", () => {
  it("puts an unturned rectangle's corners at its half extents", () => {
    const corners = orientedRectCorners(FLAT);

    expect(corners).toEqual([
      { xMeters: -1, zMeters: -0.5 },
      { xMeters: 1, zMeters: -0.5 },
      { xMeters: 1, zMeters: 0.5 },
      { xMeters: -1, zMeters: 0.5 },
    ]);
  });

  it("turns +X toward +Z on a quarter turn", () => {
    // The corner that was a meter along +X ends up a meter along +Z.
    const [, secondCorner] = orientedRectCorners({
      ...FLAT,
      depthMeters: 0,
      rotationRadians: QUARTER_TURN,
    });

    expect(secondCorner.xMeters).toBeCloseTo(0, 12);
    expect(secondCorner.zMeters).toBeCloseTo(1, 12);
  });

  it("moves with the center", () => {
    const corners = orientedRectCorners({
      ...FLAT,
      center: { xMeters: 5, zMeters: 3 },
    });

    expect(corners[0]).toEqual({ xMeters: 4, zMeters: 2.5 });
  });
});

describe("orientedRectContains", () => {
  it("contains its own center", () => {
    expect(orientedRectContains(FLAT, { xMeters: 0, zMeters: 0 })).toBe(true);
  });

  it("counts a point exactly on an edge as on the rectangle", () => {
    expect(orientedRectContains(FLAT, { xMeters: 1, zMeters: 0 })).toBe(true);
    expect(orientedRectContains(FLAT, { xMeters: -1, zMeters: -0.5 })).toBe(
      true,
    );
  });

  it("excludes a point just outside", () => {
    expect(orientedRectContains(FLAT, { xMeters: 1.001, zMeters: 0 })).toBe(
      false,
    );
  });

  it("follows the rectangle round when it turns", () => {
    const turned = { ...FLAT, rotationRadians: QUARTER_TURN };

    // A point a meter and a half along X is outside the turned rectangle,
    // which now runs a meter and a half along Z instead.
    expect(orientedRectContains(turned, { xMeters: 0.9, zMeters: 0 })).toBe(
      false,
    );
    expect(orientedRectContains(turned, { xMeters: 0, zMeters: 0.9 })).toBe(
      true,
    );
  });

  it("excludes the corner of the bounding box of a turned rectangle", () => {
    // At 45° the two-by-one rectangle's bounding box reaches (1.06, 1.06),
    // but the rectangle itself does not: the corner is empty floor.
    const turned = { ...FLAT, rotationRadians: Math.PI / 4 };

    expect(orientedRectContains(turned, { xMeters: 1, zMeters: 1 })).toBe(
      false,
    );
    expect(orientedRectContains(turned, { xMeters: 0.6, zMeters: 0.6 })).toBe(
      true,
    );
  });
});
