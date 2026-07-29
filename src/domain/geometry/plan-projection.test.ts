import { describe, expect, it } from "vitest";
import {
  EMPTY_PLAN_PROJECTION,
  createPlanProjection,
  projectLength,
  projectPoint,
  unprojectPoint,
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

describe("unprojectPoint", () => {
  const projection = createPlanProjection(
    { widthMeters: 4, depthMeters: 2 },
    SQUARE_VIEWPORT,
  );

  it("gives back the point that was projected", () => {
    const floor = { xMeters: 1.35, zMeters: 0.8 };

    const back = unprojectPoint(projection, projectPoint(projection, floor));

    expect(back?.xMeters).toBeCloseTo(floor.xMeters, 12);
    expect(back?.zMeters).toBeCloseTo(floor.zMeters, 12);
  });

  it("reads a pixel below the origin as depth, not as height", () => {
    expect(unprojectPoint(projection, { x: 0, y: 200 })).toEqual({
      xMeters: 0,
      zMeters: 1,
    });
  });

  it("has nothing to say about a viewport nothing fits in", () => {
    expect(unprojectPoint(EMPTY_PLAN_PROJECTION, { x: 10, y: 10 })).toBeNull();
  });
});

describe("an extent that does not start at the floor's zero", () => {
  const APARTMENT = { widthMeters: 4, depthMeters: 4 };

  it("puts the extent's own corner where the zero corner would have gone", () => {
    const atZero = createPlanProjection(APARTMENT, SQUARE_VIEWPORT);
    const moved = createPlanProjection(APARTMENT, SQUARE_VIEWPORT, 0, {
      xMeters: -10,
      zMeters: 6,
    });

    expect(projectPoint(moved, { xMeters: -10, zMeters: 6 })).toEqual(
      projectPoint(atZero, { xMeters: 0, zMeters: 0 }),
    );
  });

  it("scales the same however far from the zero it sits", () => {
    const atZero = createPlanProjection(APARTMENT, SQUARE_VIEWPORT);
    const moved = createPlanProjection(APARTMENT, SQUARE_VIEWPORT, 0, {
      xMeters: -10,
      zMeters: 6,
    });

    expect(moved.pixelsPerMeter).toBe(atZero.pixelsPerMeter);
  });

  it("takes a floor point straight to a pixel, with nothing to add back", () => {
    const projection = createPlanProjection(APARTMENT, SQUARE_VIEWPORT, 0, {
      xMeters: -10,
      zMeters: 6,
    });

    // Two meters in from the corner, on both axes.
    const point = { xMeters: -8, zMeters: 8 };
    const corner = projectPoint(projection, { xMeters: -10, zMeters: 6 });
    const inside = projectPoint(projection, point);

    expect(inside.x - corner.x).toBe(2 * projection.pixelsPerMeter);
    expect(inside.y - corner.y).toBe(2 * projection.pixelsPerMeter);
  });

  it("comes back through unproject to the point it started at", () => {
    const projection = createPlanProjection(APARTMENT, SQUARE_VIEWPORT, 0, {
      xMeters: -10,
      zMeters: 6,
    });
    const point = { xMeters: -7.5, zMeters: 9.25 };

    expect(unprojectPoint(projection, projectPoint(projection, point))).toEqual(
      point,
    );
  });

  it("defaults to the floor's zero, leaving every existing caller alone", () => {
    expect(createPlanProjection(APARTMENT, SQUARE_VIEWPORT)).toEqual(
      createPlanProjection(APARTMENT, SQUARE_VIEWPORT, 0, {
        xMeters: 0,
        zMeters: 0,
      }),
    );
  });
});
