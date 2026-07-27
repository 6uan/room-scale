import { describe, expect, it } from "vitest";
import {
  EMPTY_PLAN_PROJECTION,
  createPlanProjection,
  projectLength,
  projectPoint,
} from "./plan-projection";

const SQUARE_VIEWPORT = { width: 400, height: 400 };

describe("createPlanProjection", () => {
  it("scales to the limiting axis when the room is wider than it is deep", () => {
    const projection = createPlanProjection(
      { widthMeters: 4, depthMeters: 2 },
      SQUARE_VIEWPORT,
    );

    // Width binds: 400 / 4 = 100, which leaves depth at 200 of the 400 available.
    expect(projection.pixelsPerMeter).toBe(100);
  });

  it("scales to the limiting axis when the room is deeper than it is wide", () => {
    const projection = createPlanProjection(
      { widthMeters: 2, depthMeters: 4 },
      SQUARE_VIEWPORT,
    );

    expect(projection.pixelsPerMeter).toBe(100);
  });

  it("uses one scale for both axes, so a square room stays square", () => {
    const projection = createPlanProjection(
      { widthMeters: 3, depthMeters: 3 },
      { width: 600, height: 300 },
    );

    expect(projectLength(projection, 3)).toBe(300);
    const corner = projectPoint(projection, { xMeters: 3, zMeters: 3 });
    const origin = projectPoint(projection, { xMeters: 0, zMeters: 0 });
    expect(corner.x - origin.x).toBe(corner.y - origin.y);
  });

  it("centers the floor in the viewport", () => {
    const projection = createPlanProjection(
      { widthMeters: 4, depthMeters: 2 },
      SQUARE_VIEWPORT,
    );

    // 200 pixels of drawn depth in 400 available leaves 100 above and below.
    expect(projection.originX).toBe(0);
    expect(projection.originY).toBe(100);
  });

  it("keeps the padding clear on every side", () => {
    const projection = createPlanProjection(
      { widthMeters: 4, depthMeters: 4 },
      SQUARE_VIEWPORT,
      50,
    );

    // 300 usable pixels across 4 meters, still centered in the full 400.
    expect(projection.pixelsPerMeter).toBe(75);
    expect(projection.originX).toBe(50);
    expect(projection.originY).toBe(50);
  });

  it("gives up rather than inverting when the padding swallows the viewport", () => {
    expect(
      createPlanProjection(
        { widthMeters: 4, depthMeters: 4 },
        SQUARE_VIEWPORT,
        200,
      ),
    ).toEqual(EMPTY_PLAN_PROJECTION);
  });

  it("gives up on an unmeasured viewport", () => {
    expect(
      createPlanProjection(
        { widthMeters: 4, depthMeters: 4 },
        { width: 0, height: 0 },
      ),
    ).toEqual(EMPTY_PLAN_PROJECTION);
  });

  it("gives up on a room with no extent", () => {
    expect(
      createPlanProjection({ widthMeters: 0, depthMeters: 4 }, SQUARE_VIEWPORT),
    ).toEqual(EMPTY_PLAN_PROJECTION);
    expect(
      createPlanProjection(
        { widthMeters: Number.NaN, depthMeters: 4 },
        SQUARE_VIEWPORT,
      ),
    ).toEqual(EMPTY_PLAN_PROJECTION);
  });
});

describe("projecting floor points", () => {
  const projection = createPlanProjection(
    { widthMeters: 4, depthMeters: 2 },
    SQUARE_VIEWPORT,
  );

  it("puts the floor origin at the top-left of the drawn room", () => {
    expect(projectPoint(projection, { xMeters: 0, zMeters: 0 })).toEqual({
      x: 0,
      y: 100,
    });
  });

  it("maps increasing depth downward, as a plan is read", () => {
    const near = projectPoint(projection, { xMeters: 1, zMeters: 0 });
    const far = projectPoint(projection, { xMeters: 1, zMeters: 2 });

    expect(far.y).toBeGreaterThan(near.y);
    expect(far.x).toBe(near.x);
  });

  it("converts a length to pixels", () => {
    expect(projectLength(projection, 1)).toBe(100);
    expect(projectLength(projection, 0.9144)).toBeCloseTo(91.44, 10);
  });
});
