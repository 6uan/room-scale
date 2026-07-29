import { describe, expect, it } from "vitest";
import {
  createPlanProjection,
  projectPoint,
  unprojectPoint,
} from "./plan-projection";
import {
  MIN_VISIBLE_PIXELS,
  clampToViewport,
  panBy,
  zoomAt,
  zoomLevel,
} from "./viewport";

/** Four meters across a 400 pixel viewport: 100 pixels to the meter. */
const FITTED = createPlanProjection(
  { widthMeters: 4, depthMeters: 4 },
  { width: 400, height: 400 },
);

const LOOSE = { minimum: 1, maximum: 10_000 };

describe("panBy", () => {
  it("moves the drawing by exactly the pixels it was given", () => {
    const moved = panBy(FITTED, 30, -20);

    const before = projectPoint(FITTED, { xMeters: 1, zMeters: 1 });
    const after = projectPoint(moved, { xMeters: 1, zMeters: 1 });

    expect(after.x - before.x).toBe(30);
    expect(after.y - before.y).toBe(-20);
  });

  it("leaves the scale alone, so nothing measures differently", () => {
    expect(panBy(FITTED, 100, 100).pixelsPerMeter).toBe(FITTED.pixelsPerMeter);
  });
});

describe("zoomAt", () => {
  it("multiplies the scale", () => {
    expect(
      zoomAt(FITTED, 2, { x: 0, y: 0 }, LOOSE.minimum, LOOSE.maximum)
        .pixelsPerMeter,
    ).toBe(200);
  });

  it("keeps the floor under the pointer where it was", () => {
    const pointer = { x: 137, y: 249 };
    const under = unprojectPoint(FITTED, pointer);

    const zoomed = zoomAt(FITTED, 2.5, pointer, LOOSE.minimum, LOOSE.maximum);

    // The same floor point, still under the same pixel.
    const back = projectPoint(zoomed, under ?? { xMeters: 0, zMeters: 0 });
    expect(back.x).toBeCloseTo(pointer.x, 10);
    expect(back.y).toBeCloseTo(pointer.y, 10);
  });

  it("holds that point on the way out as well as in", () => {
    const pointer = { x: 300, y: 80 };
    const under = unprojectPoint(FITTED, pointer);

    const zoomed = zoomAt(FITTED, 0.4, pointer, LOOSE.minimum, LOOSE.maximum);

    const back = projectPoint(zoomed, under ?? { xMeters: 0, zMeters: 0 });
    expect(back.x).toBeCloseTo(pointer.x, 10);
    expect(back.y).toBeCloseTo(pointer.y, 10);
  });

  it("comes back to where it started when it is undone", () => {
    const pointer = { x: 210, y: 130 };

    const there = zoomAt(FITTED, 2, pointer, LOOSE.minimum, LOOSE.maximum);
    const back = zoomAt(there, 0.5, pointer, LOOSE.minimum, LOOSE.maximum);

    expect(back.pixelsPerMeter).toBeCloseTo(FITTED.pixelsPerMeter, 10);
    expect(back.originX).toBeCloseTo(FITTED.originX, 10);
    expect(back.originY).toBeCloseTo(FITTED.originY, 10);
  });

  it("will not scale past the limits it is given", () => {
    expect(zoomAt(FITTED, 100, { x: 0, y: 0 }, 50, 200).pixelsPerMeter).toBe(
      200,
    );
    expect(zoomAt(FITTED, 0.001, { x: 0, y: 0 }, 50, 200).pixelsPerMeter).toBe(
      50,
    );
  });

  it("refuses a factor that is not a scale", () => {
    expect(zoomAt(FITTED, 0, { x: 1, y: 1 }, 1, 100)).toEqual(FITTED);
    expect(zoomAt(FITTED, -2, { x: 1, y: 1 }, 1, 100)).toEqual(FITTED);
  });

  it("has nothing to do to a projection nothing fits in", () => {
    const empty = createPlanProjection(
      { widthMeters: 0, depthMeters: 0 },
      { width: 0, height: 0 },
    );

    expect(zoomAt(empty, 2, { x: 1, y: 1 }, 1, 100)).toEqual(empty);
  });
});

describe("zoomLevel", () => {
  it("is one at the size the plan was fitted to", () => {
    expect(zoomLevel(FITTED, FITTED)).toBe(1);
  });

  it("says how far from that the plan has been scaled", () => {
    const zoomed = zoomAt(
      FITTED,
      3,
      { x: 0, y: 0 },
      LOOSE.minimum,
      LOOSE.maximum,
    );

    expect(zoomLevel(zoomed, FITTED)).toBeCloseTo(3, 10);
  });
});

describe("clampToViewport", () => {
  const VIEWPORT = { width: 400, height: 400 };
  /** The four-meter apartment FITTED was built around, at the floor's zero. */
  const RECT = {
    origin: { xMeters: 0, zMeters: 0 },
    extent: { widthMeters: 4, depthMeters: 4 },
  };

  it("leaves a plan that is already on screen exactly where it is", () => {
    expect(clampToViewport(FITTED, RECT, VIEWPORT)).toEqual(FITTED);
  });

  it("leaves a plan pushed to the edge but still reachable", () => {
    // Its right-hand strip is still on screen, which is all that is asked.
    const pushed = panBy(FITTED, 400 - MIN_VISIBLE_PIXELS, 0);

    expect(clampToViewport(pushed, RECT, VIEWPORT)).toEqual(pushed);
  });

  it("brings back a plan panned off to the east", () => {
    const lost = panBy(FITTED, 5000, 0);

    const held = clampToViewport(lost, RECT, VIEWPORT);

    // Its western strip sits against the eastern edge of the viewport.
    expect(projectPoint(held, RECT.origin).x).toBe(400 - MIN_VISIBLE_PIXELS);
  });

  it("brings back a plan panned off to the west", () => {
    const lost = panBy(FITTED, -5000, 0);

    const held = clampToViewport(lost, RECT, VIEWPORT);

    // Its eastern strip sits against the western edge.
    const drawn = 4 * held.pixelsPerMeter;
    expect(projectPoint(held, RECT.origin).x).toBe(MIN_VISIBLE_PIXELS - drawn);
  });

  it("brings back a plan panned off the bottom", () => {
    const lost = panBy(FITTED, 0, 5000);

    const held = clampToViewport(lost, RECT, VIEWPORT);

    expect(projectPoint(held, RECT.origin).y).toBe(400 - MIN_VISIBLE_PIXELS);
  });

  it("moves one axis without disturbing the other", () => {
    const lost = panBy(FITTED, 5000, 0);

    const held = clampToViewport(lost, RECT, VIEWPORT);

    expect(held.originY).toBe(lost.originY);
  });

  it("never changes the scale, only where the plan sits", () => {
    const held = clampToViewport(panBy(FITTED, 9000, 9000), RECT, VIEWPORT);

    expect(held.pixelsPerMeter).toBe(FITTED.pixelsPerMeter);
  });

  it("holds a plan smaller than the visible strip whole", () => {
    // A drawn plan 20 pixels across cannot show 48 of itself; asking for it
    // would push a plan off the screen in the name of keeping it on.
    const tiny = {
      origin: { xMeters: 0, zMeters: 0 },
      extent: { widthMeters: 0.2, depthMeters: 0.2 },
    };
    const lost = panBy(FITTED, 5000, 0);

    const held = clampToViewport(lost, tiny, VIEWPORT);

    expect(projectPoint(held, tiny.origin).x).toBe(400 - 20);
  });

  it("keeps a plan away from a zero-scale projection rather than dividing by it", () => {
    const empty = { pixelsPerMeter: 0, originX: 0, originY: 0 };

    expect(clampToViewport(empty, RECT, VIEWPORT)).toBe(empty);
  });

  it("holds an apartment that does not start at the floor's zero", () => {
    const away = {
      origin: { xMeters: -10, zMeters: -10 },
      extent: { widthMeters: 4, depthMeters: 4 },
    };
    const fitted = createPlanProjection(away.extent, VIEWPORT, 0, away.origin);

    const held = clampToViewport(panBy(fitted, 5000, 0), away, VIEWPORT);

    expect(projectPoint(held, away.origin).x).toBe(400 - MIN_VISIBLE_PIXELS);
  });
});
