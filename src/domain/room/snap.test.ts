import { describe, expect, it } from "vitest";
import { metersFromInches } from "@/domain/units";
import { DEFAULT_FLOOR, SNAP_METERS, snapRoomOrigin } from "./floor";
import { createRoom, type Room } from "./room";

/** Two rooms: one at the origin, and one to be placed against it. */
const FIRST: Room = {
  ...createRoom("room-1", "Living room", { xMeters: 0, zMeters: 0 }),
  widthMeters: 4,
  depthMeters: 3,
};
const SECOND = createRoom("room-2", "Hall", { xMeters: 9, zMeters: 9 });
const FLOOR = {
  ...DEFAULT_FLOOR,
  wallThicknessMeters: 0.1,
  rooms: [FIRST, SECOND],
};

/** Where the second room would land, given where it was typed. */
function snapped(xMeters: number, zMeters: number) {
  return snapRoomOrigin(FLOOR, SECOND, { xMeters, zMeters });
}

describe("snapRoomOrigin", () => {
  it("shares a wall when a room is brought up against one", () => {
    // The first room ends at 4, and one wall thickness past it is 4.1.
    expect(snapped(4.06, 0).xMeters).toBeCloseTo(4.1, 10);
  });

  it("shares a wall on the other side too", () => {
    // Its own far edge a thickness before the first room's near edge.
    expect(snapped(-3.06, 0).xMeters).toBeCloseTo(
      -0.1 - SECOND.widthMeters,
      10,
    );
  });

  it("lines a room up with its neighbour without touching it", () => {
    // Nowhere near sharing a wall on X, but its top edge is near the other's.
    expect(snapped(9, 0.05).zMeters).toBe(0);
  });

  it("leaves a room exactly where it was put when nothing is near", () => {
    expect(snapped(9, 9)).toEqual({ xMeters: 9, zMeters: 9 });
  });

  it("does not snap from further than it says it will", () => {
    const far = 4.1 + SNAP_METERS + 0.01;

    expect(snapped(far, 9).xMeters).toBe(far);
  });

  it("prefers the nearer of two candidates", () => {
    // Just past the first room's far edge: sharing a wall is at 4.1, lining
    // up with its near edge is at 0, and 4.09 is plainly the former.
    expect(snapped(4.09, 9).xMeters).toBeCloseTo(4.1, 10);
  });

  it("never snaps a room to itself", () => {
    const alone = { ...FLOOR, rooms: [SECOND] };

    expect(
      snapRoomOrigin(alone, SECOND, { xMeters: 9.02, zMeters: 9 }),
    ).toEqual({ xMeters: 9.02, zMeters: 9 });
  });

  it("snaps each axis on its own, so one can share and the other line up", () => {
    const result = snapped(4.07, 0.03);

    expect(result.xMeters).toBeCloseTo(4.1, 10);
    expect(result.zMeters).toBe(0);
  });

  it("is near enough to reach with a typed inch or two", () => {
    // Four inches: further than a slip, closer than anything typed on purpose.
    expect(SNAP_METERS).toBeCloseTo(metersFromInches(4), 10);
  });
});
