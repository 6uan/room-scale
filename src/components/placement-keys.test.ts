import { describe, expect, it } from "vitest";
import { createInstance, turnInstance } from "@/domain/furniture";
import { DEFAULT_FLOOR, DEFAULT_ROOM } from "@/domain/room";
import { degreesFromRadians } from "@/domain/units";
import { instanceFromKeyPress } from "./placement-keys";

const FLOOR = {
  ...DEFAULT_FLOOR,
  rooms: [
    {
      ...DEFAULT_ROOM,
      parts: [
        {
          id: "room-1-part-1",
          origin: { xMeters: 0, zMeters: 0 },
          widthMeters: 4,
          depthMeters: 3,
          rotationRadians: 0,
          openWalls: [],
        },
      ],
      openings: [],
    },
  ],
};
const RUG = createInstance("i1", "rug", { xMeters: 2, zMeters: 1.5 });

function press(key: string, shiftKey = false) {
  return instanceFromKeyPress(FLOOR, RUG, { key, shiftKey });
}

describe("instanceFromKeyPress", () => {
  it("nudges east and west along X", () => {
    expect(press("ArrowRight")?.position.xMeters).toBeCloseTo(2.05, 12);
    expect(press("ArrowLeft")?.position.xMeters).toBeCloseTo(1.95, 12);
  });

  it("nudges up the plan toward the north wall, where depth is measured from", () => {
    expect(press("ArrowUp")?.position.zMeters).toBeCloseTo(1.45, 12);
    expect(press("ArrowDown")?.position.zMeters).toBeCloseTo(1.55, 12);
  });

  it("takes a finer step with Shift held", () => {
    expect(press("ArrowRight", true)?.position.xMeters).toBeCloseTo(2.01, 12);
  });

  it("turns fifteen degrees a press, and one with Shift", () => {
    expect(degreesFromRadians(press("]")?.rotationRadians ?? 0)).toBeCloseTo(
      15,
      12,
    );
    expect(
      degreesFromRadians(press("]", true)?.rotationRadians ?? 0),
    ).toBeCloseTo(1, 12);
  });

  it("wraps an anticlockwise turn past zero rather than going negative", () => {
    expect(degreesFromRadians(press("[")?.rotationRadians ?? 0)).toBeCloseTo(
      345,
      12,
    );
  });

  it("turns from where the piece already stands", () => {
    const turned = turnInstance(RUG, Math.PI / 2);

    const next = instanceFromKeyPress(FLOOR, turned, {
      key: "]",
      shiftKey: false,
    });

    expect(degreesFromRadians(next?.rotationRadians ?? 0)).toBeCloseTo(105, 12);
  });

  it("stops a nudge at the wall rather than pushing the center off the floor", () => {
    const atWall = createInstance("i1", "rug", { xMeters: 0, zMeters: 1.5 });

    const next = instanceFromKeyPress(FLOOR, atWall, {
      key: "ArrowLeft",
      shiftKey: false,
    });

    expect(next?.position.xMeters).toBe(0);
  });

  it("leaves a key it does not handle to the browser", () => {
    expect(press("Tab")).toBeNull();
    expect(press("a")).toBeNull();
  });
});
