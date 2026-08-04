import { describe, expect, it } from "vitest";
import {
  calibratedUnderlay,
  createUnderlay,
  underlayExtentMeters,
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

describe("calibratedUnderlay", () => {
  it("fixes the scale from one measured line", () => {
    // A line drawn 2 m long on screen that the tape says is 4 m: everything
    // doubles.
    const calibrated = calibratedUnderlay(
      DROPPED,
      { xMeters: -1, zMeters: 0 },
      { xMeters: 1, zMeters: 0 },
      4,
    );

    expect(calibrated.metersPerPixel).toBeCloseTo(0.02, 12);
    expect(underlayExtentMeters(calibrated).widthMeters).toBeCloseTo(16, 10);
  });

  it("holds the measured wall still while the image scales around it", () => {
    const from = { xMeters: 1, zMeters: 2 };
    const to = { xMeters: 3, zMeters: 2 };
    const calibrated = calibratedUnderlay(DROPPED, from, to, 1);

    // The line's midpoint keeps its distance ratio: a point at the midpoint
    // of the drawn line maps to the same floor spot before and after.
    const middle = { xMeters: 2, zMeters: 2 };
    const beforePixels = {
      x: (middle.xMeters - DROPPED.origin.xMeters) / DROPPED.metersPerPixel,
      z: (middle.zMeters - DROPPED.origin.zMeters) / DROPPED.metersPerPixel,
    };
    const afterFloor = {
      x: calibrated.origin.xMeters + beforePixels.x * calibrated.metersPerPixel,
      z: calibrated.origin.zMeters + beforePixels.z * calibrated.metersPerPixel,
    };
    expect(afterFloor.x).toBeCloseTo(middle.xMeters, 10);
    expect(afterFloor.z).toBeCloseTo(middle.zMeters, 10);
  });

  it("refuses a zero-length line or a nonsense length", () => {
    const same = { xMeters: 1, zMeters: 1 };
    expect(calibratedUnderlay(DROPPED, same, same, 4)).toBe(DROPPED);
    expect(
      calibratedUnderlay(DROPPED, same, { xMeters: 2, zMeters: 1 }, 0),
    ).toBe(DROPPED);
  });
});
