import { describe, expect, it } from "vitest";
import {
  PERSPECTIVE_TILT_RADIANS,
  cameraOfFraming,
  framingAfterOrbit,
  framingOfProjection,
  projectionOfFraming,
  type Framing,
  type ScenePoint,
} from "./framing";

const VISIBLE = { left: 0, width: 800, height: 600 };
const FOV = (55 * Math.PI) / 180;
const ASPECT = 1.5;

describe("a plan's framing", () => {
  it("reads the floor point in the middle and the floor shown", () => {
    // 50 px to the meter, floor (0, 0) at pixel (100, 50).
    const framing = framingOfProjection(
      { pixelsPerMeter: 50, originX: 100, originY: 50 },
      VISIBLE,
    );
    expect(framing?.center.xMeters).toBeCloseTo(6, 12);
    expect(framing?.center.zMeters).toBeCloseTo(5, 12);
    expect(framing?.metersAcross).toBeCloseTo(16, 12);
    expect(framing?.metersDown).toBeCloseTo(12, 12);
  });

  it("frames only the part not under the details panel", () => {
    const projection = { pixelsPerMeter: 50, originX: 0, originY: 0 };
    const beside = framingOfProjection(projection, { ...VISIBLE, width: 480 });
    expect(beside?.center.xMeters).toBeCloseTo(4.8, 12);
    expect(beside?.metersAcross).toBeCloseTo(9.6, 12);
  });

  it("comes back to the same projection it was read from", () => {
    const projection = { pixelsPerMeter: 37.5, originX: -210, originY: 95 };
    const framing = framingOfProjection(projection, VISIBLE);
    const back =
      framing === null ? null : projectionOfFraming(framing, VISIBLE);
    expect(back?.pixelsPerMeter).toBeCloseTo(37.5, 12);
    expect(back?.originX).toBeCloseTo(-210, 9);
    expect(back?.originY).toBeCloseTo(95, 9);
  });

  it("has nothing to say about a view with nothing in it", () => {
    expect(
      framingOfProjection(
        { pixelsPerMeter: 0, originX: 0, originY: 0 },
        VISIBLE,
      ),
    ).toBeNull();
    expect(
      framingOfProjection(
        { pixelsPerMeter: 50, originX: 0, originY: 0 },
        { ...VISIBLE, width: 0 },
      ),
    ).toBeNull();
  });
});

/** Where a point lands on the camera's screen, from -1 to 1 each way when seen. */
function onScreen(position: ScenePoint, target: ScenePoint, point: ScenePoint) {
  const sight = [
    target[0] - position[0],
    target[1] - position[1],
    target[2] - position[2],
  ];
  const length = Math.hypot(sight[0]!, sight[1]!, sight[2]!);
  const forward = sight.map((value) => value / length) as [
    number,
    number,
    number,
  ];
  // Looking north and down: right is east, up is forward × right reversed.
  const right = [1, 0, 0];
  const up = [
    right[1]! * forward[2] - right[2]! * forward[1],
    right[2]! * forward[0] - right[0]! * forward[2],
    right[0]! * forward[1] - right[1]! * forward[0],
  ].map((value) => -value);
  const relative = point.map((value, index) => value - position[index]!);
  const dot = (a: readonly number[], b: readonly number[]) =>
    a.reduce((sum, value, index) => sum + value * b[index]!, 0);
  const depth = dot(relative, forward);
  return {
    x: dot(relative, right) / depth / (Math.tan(FOV / 2) * ASPECT),
    y: dot(relative, up) / depth / Math.tan(FOV / 2),
  };
}

describe("the perspective camera's framing", () => {
  const framing: Framing = {
    center: { xMeters: 3, zMeters: -2 },
    metersAcross: 10,
    metersDown: 8,
  };
  const HEIGHT = 2.44;

  it("stands due south of the framed point, looking down at the tilt", () => {
    const { position, target } = cameraOfFraming(framing, FOV, ASPECT, HEIGHT);
    expect(target).toEqual([3, 0, -2]);
    // Same east–west line: north stays at the top of the screen.
    expect(position[0]).toBeCloseTo(3, 12);
    const down = Math.atan2(position[1], position[2] - -2);
    expect(down).toBeCloseTo(PERSPECTIVE_TILT_RADIANS, 12);
  });

  it("keeps everything the plan showed in view, walls and all, as close as it can", () => {
    const { position, target } = cameraOfFraming(framing, FOV, ASPECT, HEIGHT);
    let widest = 0;
    for (const east of [-5, 5]) {
      for (const south of [-4, 4]) {
        for (const up of [0, HEIGHT]) {
          const { x, y } = onScreen(position, target, [
            3 + east,
            up,
            -2 + south,
          ]);
          expect(Math.abs(x)).toBeLessThanOrEqual(1 + 1e-9);
          expect(Math.abs(y)).toBeLessThanOrEqual(1 + 1e-9);
          widest = Math.max(widest, Math.abs(x), Math.abs(y));
        }
      }
    }
    // As close as it can be: some corner touches the edge of the view.
    expect(widest).toBeCloseTo(1, 9);
  });

  it("hands back to the plan what an orbit was left framing", () => {
    const start = cameraOfFraming(framing, FOV, ASPECT, HEIGHT);
    // Untouched: the same framing.
    const same = framingAfterOrbit(
      framing,
      start.distanceMeters,
      start.position,
      start.target,
    );
    expect(same.center).toEqual(framing.center);
    expect(same.metersAcross).toBeCloseTo(10, 12);
    expect(same.metersDown).toBeCloseTo(8, 12);

    // Twice as far back, aimed somewhere else: twice the floor, there.
    const target: ScenePoint = [7, 0, 1];
    const away: ScenePoint = [
      7,
      start.position[1] * 2,
      1 + (start.position[2] - start.target[2]) * 2,
    ];
    const back = framingAfterOrbit(framing, start.distanceMeters, away, target);
    expect(back.center).toEqual({ xMeters: 7, zMeters: 1 });
    expect(back.metersAcross).toBeCloseTo(20, 9);
    expect(back.metersDown).toBeCloseTo(16, 9);
  });
});
