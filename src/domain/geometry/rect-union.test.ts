import { describe, expect, it } from "vitest";
import {
  orientedRectUnionOverlapArea,
  rectUnionArea,
  rectUnionBounds,
  rectUnionContains,
  type AxisAlignedRect,
} from "./rect-union";

const L_SHAPE: readonly AxisAlignedRect[] = [
  {
    origin: { xMeters: 0, zMeters: 0 },
    widthMeters: 4,
    depthMeters: 2,
  },
  {
    origin: { xMeters: 0, zMeters: 2 },
    widthMeters: 2,
    depthMeters: 2,
  },
];

describe("axis-aligned rectangle unions", () => {
  it("counts overlapping parts once", () => {
    expect(
      rectUnionArea([
        { ...L_SHAPE[0]!, widthMeters: 3, depthMeters: 3 },
        {
          origin: { xMeters: 2, zMeters: 2 },
          widthMeters: 3,
          depthMeters: 2,
        },
      ]),
    ).toBe(14);
  });

  it("keeps a notch out of the room even though it is inside the bounds", () => {
    expect(rectUnionContains(L_SHAPE, { xMeters: 1, zMeters: 3 })).toBe(true);
    expect(rectUnionContains(L_SHAPE, { xMeters: 3, zMeters: 3 })).toBe(false);
    expect(rectUnionBounds(L_SHAPE)).toEqual({
      origin: { xMeters: 0, zMeters: 0 },
      widthMeters: 4,
      depthMeters: 4,
    });
  });

  it("measures a turned footprint against the union rather than its bounds", () => {
    const footprint = {
      center: { xMeters: 2, zMeters: 2 },
      widthMeters: 2,
      depthMeters: 2,
      rotationRadians: Math.PI / 4,
    };

    expect(orientedRectUnionOverlapArea(footprint, L_SHAPE)).toBeLessThan(4);
    expect(orientedRectUnionOverlapArea(footprint, L_SHAPE)).toBeCloseTo(3, 10);
  });
});
