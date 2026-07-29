import { describe, expect, it } from "vitest";
import { metersFromInches } from "@/domain/units";
import {
  DEFAULT_FLOOR,
  SNAP_METERS,
  drawnRoom,
  snapRoomEdge,
  snapRoomOrigin,
} from "./floor";
import { ROOM_LENGTH_LIMITS, createRoom, type Room } from "./room";

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

describe("snapRoomEdge", () => {
  // FIRST runs from 0 to 4 across and 0 to 3 down, in a floor with 0.1 walls.
  const edge = (value: number) => snapRoomEdge(FLOOR, "x", value);

  it("shares a wall with the neighbour's far face", () => {
    expect(edge(4.06)).toBeCloseTo(4.1, 10);
  });

  it("shares a wall with the neighbour's near face", () => {
    expect(edge(-0.06)).toBeCloseTo(-0.1, 10);
  });

  it("sits flush against a face, for a room drawn inside a space", () => {
    // Nearer to the face itself than to the wall a thickness beyond it.
    expect(edge(3.98)).toBeCloseTo(4, 10);
  });

  it("leaves an edge nowhere near anything exactly where it was drawn", () => {
    expect(edge(1.7)).toBe(1.7);
  });

  it("leaves an edge just outside the snapping distance alone", () => {
    const clear = 4 + SNAP_METERS * 2;

    expect(edge(clear)).toBe(clear);
  });

  it("snaps down the other axis against depth rather than width", () => {
    // FIRST is 3 deep, so its southern face is at 3 and its shared wall at 3.1.
    expect(snapRoomEdge(FLOOR, "z", 3.06)).toBeCloseTo(3.1, 10);
  });

  it("ignores the room being redrawn, so it cannot snap to itself", () => {
    expect(snapRoomEdge(FLOOR, "x", 4.06, FIRST.id)).toBe(4.06);
  });

  it("takes the nearest candidate when two rooms offer one", () => {
    const crowded = {
      ...FLOOR,
      rooms: [FIRST, { ...SECOND, origin: { xMeters: 4.3, zMeters: 0 } }],
    };

    // 4.2 is nearer the second room's near face at 4.3 than the first's
    // shared wall at 4.1 — but its shared wall at 4.2 is nearer still.
    expect(snapRoomEdge(crowded, "x", 4.22)).toBeCloseTo(4.2, 10);
  });

  it("snaps to nothing on a floor with no other rooms", () => {
    const empty = { ...FLOOR, rooms: [] };

    expect(snapRoomEdge(empty, "x", 4.06)).toBe(4.06);
  });
});

describe("drawnRoom", () => {
  const drawn = (from: [number, number], to: [number, number]) =>
    drawnRoom(
      FLOOR,
      "room-3",
      "Study",
      { xMeters: from[0], zMeters: from[1] },
      { xMeters: to[0], zMeters: to[1] },
    );

  it("takes its size from the two corners", () => {
    const room = drawn([20, 20], [23, 22]);

    expect(room.widthMeters).toBeCloseTo(3, 10);
    expect(room.depthMeters).toBeCloseTo(2, 10);
  });

  it("puts the origin at the north-west corner whichever way it was dragged", () => {
    const forwards = drawn([20, 20], [23, 22]);
    const backwards = drawn([23, 22], [20, 20]);

    expect(backwards.origin).toEqual(forwards.origin);
    expect(backwards.widthMeters).toBeCloseTo(forwards.widthMeters, 10);
    expect(backwards.depthMeters).toBeCloseTo(forwards.depthMeters, 10);
  });

  it("shares a wall when a corner is dragged up against a neighbour", () => {
    // FIRST's far face is at 4; a wall thickness past it is 4.1.
    const room = drawn([4.06, 0], [7, 3]);

    expect(room.origin.xMeters).toBeCloseTo(4.1, 10);
  });

  it("snaps both corners, not only the one it started from", () => {
    const room = drawn([7, 0], [4.06, 3]);

    expect(room.origin.xMeters).toBeCloseTo(4.1, 10);
    expect(room.widthMeters).toBeCloseTo(7 - 4.1, 10);
  });

  it("holds a slip of a drag to the smallest a room may be", () => {
    const room = drawn([20, 20], [20.01, 20.01]);
    const minimum = ROOM_LENGTH_LIMITS.widthMeters.minMeters;

    expect(room.widthMeters).toBe(minimum);
    expect(room.depthMeters).toBe(minimum);
  });

  it("carries the name and id it was given, and no openings", () => {
    const room = drawn([20, 20], [23, 22]);

    expect(room.id).toBe("room-3");
    expect(room.name).toBe("Study");
    expect(room.openings).toEqual([]);
  });

  it("takes the standard ceiling height, which a plan cannot show", () => {
    expect(drawn([20, 20], [23, 22]).heightMeters).toBe(
      createRoom("x", "x", { xMeters: 0, zMeters: 0 }).heightMeters,
    );
  });
});
