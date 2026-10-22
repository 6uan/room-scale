import { describe, expect, it } from "vitest";
import { metersFromInches } from "@/domain/units";
import {
  DEFAULT_FLOOR,
  SNAP_METERS,
  drawnRoom,
  drawnSection,
  snapRoomEdge,
  snapRoomOrigin,
  snapRoomPartOrigin,
  snapRoomPartResize,
  roundedResizeTarget,
  snapRoomResize,
} from "./floor";
import { pointAlongWall } from "./openings";
import {
  ROOM_LENGTH_LIMITS,
  createRoom,
  primaryRoomPart,
  roomPart,
  withOpenings,
  withOrigin,
  withRoomWallThickness,
  type Room,
} from "./room";

/** Two rooms: one at the origin, and one to be placed against it. */
const FIRST: Room = {
  ...createRoom("room-1", "Living room", { xMeters: 0, zMeters: 0 }),
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
};
const SECOND = createRoom("room-2", "Hall", { xMeters: 9, zMeters: 9 });
const FLOOR = {
  ...DEFAULT_FLOOR,
  wallThicknessMeters: 0.1,
  rooms: [FIRST, SECOND],
};
const part = (room: Room) => primaryRoomPart(room);

/** Where the second room would land, given where it was typed. */
function snapped(xMeters: number, zMeters: number) {
  return snapRoomOrigin(FLOOR, SECOND, { xMeters, zMeters });
}

describe("snapRoomOrigin, by the doors", () => {
  const door = (
    room: Room,
    wall: "east" | "west" | "north" | "south",
    centerMeters: number,
  ) =>
    withOpenings(room, [
      {
        id: `${room.id}-door`,
        kind: "door" as const,
        partId: part(room).id,
        wall,
        centerMeters,
        widthMeters: 0.8,
        hinge: "start" as const,
        swing: "inward" as const,
        style: "swing" as const,
      },
    ]);
  const living = door(FIRST, "east", 1.2);
  const hall = door(SECOND, "west", 0.5);
  const floor = { ...FLOOR, rooms: [living, hall] };
  /** Where the hall's origin puts its door on the living room's. */
  const aligned =
    pointAlongWall(living, "east", 1.2).zMeters -
    pointAlongWall(hall, "west", 0.5).zMeters;

  it("slides a room along a shared wall until the doors meet", () => {
    const landed = snapRoomOrigin(floor, hall, {
      xMeters: 4.06,
      zMeters: aligned + 0.04,
    });
    expect(landed.xMeters).toBeCloseTo(4.1, 10);
    expect(landed.zMeters).toBeCloseTo(aligned, 10);
  });

  it("offers nothing to a door on a wall that does not face the other", () => {
    const sideways = { ...FLOOR, rooms: [living, door(SECOND, "north", 0.5)] };
    const landed = snapRoomOrigin(sideways, door(SECOND, "north", 0.5), {
      xMeters: 4.06,
      zMeters: aligned + 0.04,
    });
    expect(landed.zMeters).toBeCloseTo(aligned + 0.04, 10);
  });

  it("lines up nothing with a window", () => {
    const window = withOpenings(FIRST, [
      {
        id: "w",
        kind: "window",
        partId: part(FIRST).id,
        wall: "east",
        centerMeters: 1.2,
        widthMeters: 1.2,
      },
    ]);
    const landed = snapRoomOrigin({ ...FLOOR, rooms: [window, hall] }, hall, {
      xMeters: 4.06,
      zMeters: aligned + 0.04,
    });
    expect(landed.zMeters).toBeCloseTo(aligned + 0.04, 10);
  });

  it("does not reach further for a door than for a wall", () => {
    const far = aligned + SNAP_METERS + 0.01;
    expect(
      snapRoomOrigin(floor, hall, { xMeters: 4.06, zMeters: far }).zMeters,
    ).toBe(far);
  });
});

describe("snapRoomOrigin", () => {
  it("shares a wall when a room is brought up against one", () => {
    // The first room ends at 4, and one wall thickness past it is 4.1.
    expect(snapped(4.06, 0).xMeters).toBeCloseTo(4.1, 10);
  });

  it("shares a wall on the other side too", () => {
    // Its own far edge a thickness before the first room's near edge.
    expect(snapped(-3.06, 0).xMeters).toBeCloseTo(
      -0.1 - part(SECOND).widthMeters,
      10,
    );
  });

  it("brings a room let go on the neighbour's wall band out to share it", () => {
    // Dropped with its west edge on the first room's inner face — the far
    // side of the band from where it should be. That is a whole thickness
    // off, further than the ordinary reach, and still comes out to 4.1.
    expect(snapped(4.0, 0).xMeters).toBeCloseTo(4.1, 10);
    expect(snapped(3.98, 0).xMeters).toBeCloseTo(4.1, 10);
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
    expect(snapRoomEdge(FLOOR, "x", 4.06, FIRST)).toBe(4.06);
  });

  it("takes the nearest candidate when two rooms offer one", () => {
    const crowded = {
      ...FLOOR,
      rooms: [FIRST, withOrigin(SECOND, { xMeters: 4.3, zMeters: 0 })],
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

describe("roundedResizeTarget", () => {
  const wholeInches = (meters: number) => Math.round(meters / 0.0254) * 0.0254;

  it("rounds the length between the walls, not the dragged coordinate", () => {
    // The fixed wall stands on a fraction; the dragged one lands wherever
    // makes the room a whole number of inches wide.
    const fixed = 0.0254 * 10.5;
    const target = roundedResizeTarget(fixed, 0.0254 * 130.7, wholeInches);

    expect((target - fixed) / 0.0254).toBeCloseTo(120, 10);
  });

  it("works the same way dragging toward the negative side", () => {
    const fixed = 0.0254 * 10.5;
    const target = roundedResizeTarget(fixed, -0.0254 * 109.7, wholeInches);

    expect((fixed - target) / 0.0254).toBeCloseTo(120, 10);
  });
});

describe("snapRoomResize", () => {
  it("snaps an east resize to share the next room's west wall", () => {
    const resized = snapRoomResize(FLOOR, FIRST, "east", 8.94);

    // SECOND begins at 9, so FIRST's east wall shares it at 8.9.
    expect(part(resized).widthMeters).toBeCloseTo(8.9, 10);
    expect(part(resized).origin).toEqual(part(FIRST).origin);
  });

  it("snaps a south resize against room depth", () => {
    const below = withOrigin(SECOND, { xMeters: 0, zMeters: 5 });
    const floor = { ...FLOOR, rooms: [FIRST, below] };
    const resized = snapRoomResize(floor, FIRST, "south", 4.94);

    expect(part(resized).depthMeters).toBeCloseTo(4.9, 10);
    expect(part(resized).origin).toEqual(part(FIRST).origin);
  });

  it("leaves a pointer resize exact when no neighboring face is near", () => {
    expect(part(snapRoomResize(FLOOR, FIRST, "east", 6)).widthMeters).toBe(6);
  });

  it("does not snap a room's moving edge back to itself", () => {
    const alone = { ...FLOOR, rooms: [FIRST] };

    expect(part(snapRoomResize(alone, FIRST, "east", 4.05)).widthMeters).toBe(
      4.05,
    );
  });
});

describe("room part snapping", () => {
  const multi = {
    ...FIRST,
    parts: [
      part(FIRST),
      {
        id: "room-1-part-2",
        origin: { xMeters: 6, zMeters: 0 },
        widthMeters: 2,
        depthMeters: 2,
        rotationRadians: 0,
        openWalls: [],
      },
    ],
  };

  it("snaps a resized part directly to a sibling seam", () => {
    const resized = snapRoomPartResize(
      { ...FLOOR, rooms: [multi] },
      multi,
      part(FIRST).id,
      "east",
      5.95,
    );

    expect(part(resized).widthMeters).toBe(6);
  });

  it("snaps a moved part flush beside a sibling", () => {
    const moving = multi.parts[1]!;
    const origin = snapRoomPartOrigin(
      { ...FLOOR, rooms: [multi] },
      multi,
      moving,
      { xMeters: 4.06, zMeters: 0.03 },
    );

    expect(origin).toEqual({ xMeters: 4, zMeters: 0 });
  });

  it("brings a section let go on another room's wall band out to share it", () => {
    // The second room's section, dragged west until its west edge stands on
    // the first room's inner face at x = 4: a whole thickness into the wall,
    // further than the ordinary reach, and it still comes out to 4.1.
    const moving = part(SECOND);
    const origin = snapRoomPartOrigin(FLOOR, SECOND, moving, {
      xMeters: 4.0,
      zMeters: 9,
    });
    expect(origin.xMeters).toBeCloseTo(4.1, 10);
  });

  it("stops a section's dragged edge short of another room by a wall, even from inside it", () => {
    // Its west edge pulled into the first room's band lands a thickness
    // clear of it, as the edge of a whole room would.
    const resized = snapRoomPartResize(
      FLOOR,
      SECOND,
      part(SECOND).id,
      "west",
      4.03,
    );
    expect(part(resized).origin.xMeters).toBeCloseTo(4.1, 10);
  });

  describe("a dividing wall meeting a sibling's wall", () => {
    // Juan's guest room: the main rectangle, a closet-like section tucked
    // along its south edge with dividing walls north and west, and a third
    // section hanging below the main one to the west of the closet. The
    // third section's east side is a real wall, and the closet's west side
    // is a dividing one: they should lie over each other as one wall.
    const inch = 0.0254;
    const t = 1.5 * inch;
    const guest: Room = {
      ...createRoom("room-2", "Guest Room", { xMeters: 0, zMeters: 0 }),
      wallThicknessMeters: t,
      parts: [
        {
          id: "room-2-part-1",
          origin: { xMeters: 87.51 * inch, zMeters: -169.2 * inch },
          widthMeters: 132 * inch,
          depthMeters: 160 * inch,
          rotationRadians: 0,
          openWalls: [],
        },
        {
          id: "room-2-part-2",
          origin: { xMeters: 131.51 * inch, zMeters: -30.2 * inch },
          widthMeters: 88 * inch,
          depthMeters: 21 * inch,
          rotationRadians: 0,
          openWalls: ["east", "south"],
          dividingWalls: ["north", "west"],
        },
        {
          id: "room-2-part-3",
          origin: { xMeters: 87.51 * inch, zMeters: -9.2 * inch },
          widthMeters: 40 * inch,
          depthMeters: 70 * inch,
          rotationRadians: 0,
          openWalls: [],
        },
      ],
    };
    const floor = { ...FLOOR, rooms: [guest] };
    const closet = guest.parts[1]!;
    const asOneWall = (127.51 + 1.5) * inch;

    it("lands the closet's dragged west wall over the sibling's east wall", () => {
      // Pulled by its handle to 129.4 inches, just past where the sibling's
      // wall band ends at 129.01: it lands there, band over band.
      const resized = snapRoomPartResize(
        floor,
        guest,
        closet.id,
        "west",
        129.4 * inch,
      );
      expect(roomPart(resized, closet.id)!.origin.xMeters).toBeCloseTo(
        asOneWall,
        10,
      );
    });

    it("still offers the seam, for a wall pulled onto the sibling's edge", () => {
      const resized = snapRoomPartResize(
        floor,
        guest,
        closet.id,
        "west",
        127.3 * inch,
      );
      expect(roomPart(resized, closet.id)!.origin.xMeters).toBeCloseTo(
        127.51 * inch,
        10,
      );
    });

    it("lands the whole closet the same way when it is moved", () => {
      const origin = snapRoomPartOrigin(floor, guest, closet, {
        xMeters: 129.3 * inch,
        zMeters: closet.origin.zMeters,
      });
      expect(origin.xMeters).toBeCloseTo(asOneWall, 10);
    });

    it("offers no wall for a side that is not dividing", () => {
      const plain = { ...closet, dividingWalls: ["north" as const] };
      const room = {
        ...guest,
        parts: [guest.parts[0]!, plain, guest.parts[2]!],
      };
      const origin = snapRoomPartOrigin(
        { ...FLOOR, rooms: [room] },
        room,
        plain,
        {
          xMeters: 129.3 * inch,
          zMeters: plain.origin.zMeters,
        },
      );
      // With no wall on that side there is nothing at 129.01 to land on,
      // and the nearest offer is the seam at 127.51.
      expect(origin.xMeters).toBeCloseTo(127.51 * inch, 10);
    });
  });

  it("leaves a turned part exactly where the hand put it", () => {
    const turned = { ...multi.parts[1]!, rotationRadians: Math.PI / 4 };
    const room = { ...multi, parts: [part(FIRST), turned] };
    const origin = snapRoomPartOrigin(
      { ...FLOOR, rooms: [room] },
      room,
      turned,
      { xMeters: 4.06, zMeters: 0.03 },
    );

    expect(origin).toEqual({ xMeters: 4.06, zMeters: 0.03 });
  });

  it("offers no phantom wall where a turned part's bounding box would be", () => {
    // The sibling is turned, so its box edge near 6 is air, not a wall.
    const turned = { ...multi.parts[1]!, rotationRadians: Math.PI / 4 };
    const room = { ...multi, parts: [part(FIRST), turned] };
    const resized = snapRoomPartResize(
      { ...FLOOR, rooms: [room] },
      room,
      part(FIRST).id,
      "east",
      5.95,
    );

    expect(part(resized).widthMeters).toBe(5.95);
  });
});

describe("drawnRoom", () => {
  it("keeps a whole length when one edge has snapped to a neighbour's wall", () => {
    const half = (meters: number) => Math.round(meters * 2) / 2;
    const room = drawnRoom(
      FLOOR,
      "room-3",
      "Hall",
      { xMeters: 4.06, zMeters: 20 },
      { xMeters: 6.4, zMeters: 21.6 },
      half,
    );
    expect(part(room).origin.xMeters).toBeCloseTo(4.1, 10);
    expect(part(room).widthMeters).toBeCloseTo(2.5, 10);
  });

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

    expect(part(room).widthMeters).toBeCloseTo(3, 10);
    expect(part(room).depthMeters).toBeCloseTo(2, 10);
  });

  it("puts the origin at the north-west corner whichever way it was dragged", () => {
    const forwards = drawn([20, 20], [23, 22]);
    const backwards = drawn([23, 22], [20, 20]);

    expect(part(backwards).origin).toEqual(part(forwards).origin);
    expect(part(backwards).widthMeters).toBeCloseTo(
      part(forwards).widthMeters,
      10,
    );
    expect(part(backwards).depthMeters).toBeCloseTo(
      part(forwards).depthMeters,
      10,
    );
  });

  it("lands each corner on a whole unit when given a rounding", () => {
    // Raw pointer coordinates, as a drag actually produces them.
    const room = drawnRoom(
      FLOOR,
      "room-3",
      "Study",
      { xMeters: 20.004_7, zMeters: 20.008_1 },
      { xMeters: 23.213_9, zMeters: 22.191_2 },
      (meters) => Math.round(meters * 100) / 100,
    );

    expect(part(room).origin.xMeters).toBeCloseTo(20, 10);
    expect(part(room).origin.zMeters).toBeCloseTo(20.01, 10);
    expect(part(room).widthMeters).toBeCloseTo(3.21, 10);
    expect(part(room).depthMeters).toBeCloseTo(2.18, 10);
  });

  it("keeps the pointer's own precision when given no rounding", () => {
    const room = drawn([20.004_7, 20], [23.213_9, 22]);

    expect(part(room).origin.xMeters).toBeCloseTo(20.004_7, 10);
    expect(part(room).widthMeters).toBeCloseTo(3.209_2, 10);
  });

  it("lets a shared wall beat a round number", () => {
    // FIRST's far face is at 4 and a wall thickness past it is 4.1, which is
    // not a whole 10 cm step away from the 4.06 the pointer gave. Rounding
    // happens first so the snap still has something to catch, and sharing a
    // wall is worth more than a tidy number.
    const room = drawnRoom(
      FLOOR,
      "room-3",
      "Study",
      { xMeters: 4.06, zMeters: 0 },
      { xMeters: 7, zMeters: 3 },
      (meters) => Math.round(meters * 10) / 10,
    );

    expect(part(room).origin.xMeters).toBeCloseTo(4.1, 10);
  });

  it("shares a wall when a corner is dragged up against a neighbour", () => {
    // FIRST's far face is at 4; a wall thickness past it is 4.1.
    const room = drawn([4.06, 0], [7, 3]);

    expect(part(room).origin.xMeters).toBeCloseTo(4.1, 10);
  });

  it("snaps both corners, not only the one it started from", () => {
    const room = drawn([7, 0], [4.06, 3]);

    expect(part(room).origin.xMeters).toBeCloseTo(4.1, 10);
    expect(part(room).widthMeters).toBeCloseTo(7 - 4.1, 10);
  });

  it("holds a slip of a drag to the smallest a room may be", () => {
    const room = drawn([20, 20], [20.01, 20.01]);
    const minimum = ROOM_LENGTH_LIMITS.widthMeters.minMeters;

    expect(part(room).widthMeters).toBe(minimum);
    expect(part(room).depthMeters).toBe(minimum);
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

describe("snapping when the two rooms disagree about the wall between them", () => {
  const FAT = 0.3;
  /** The first room built out of something fatter than the floor's 0.1. */
  const THICK_FIRST = withRoomWallThickness(FIRST, FAT);
  const MIXED = { ...FLOOR, rooms: [THICK_FIRST, SECOND] };

  it("moves a room up against the thicker of the two walls", () => {
    // The first room ends at 4. Its own wall is the fatter claim, so the
    // gap is 0.3 rather than the floor's 0.1 — and the room lands at 4.3.
    expect(
      snapRoomOrigin(MIXED, SECOND, { xMeters: 4.26, zMeters: 0 }).xMeters,
    ).toBeCloseTo(4.3, 10);
    // The floor's own 0.1 is no longer a candidate at all. Put at 4.1 — the
    // wall these two rooms would have shared before either overrode anything
    // — the room is standing in the fatter wall, and comes out of it to 4.3.
    expect(
      snapRoomOrigin(MIXED, SECOND, { xMeters: 4.1, zMeters: 0 }).xMeters,
    ).toBeCloseTo(4.3, 10);
    // Clear of the wall on the open side, it stays exactly where it was put.
    const clear = 4.3 + SNAP_METERS + 0.01;
    expect(
      snapRoomOrigin(MIXED, SECOND, { xMeters: clear, zMeters: 0 }).xMeters,
    ).toBe(clear);
  });

  it("answers the same whichever of the two is the one being moved", () => {
    // Dragging the fat room against the thin one has to find the same gap as
    // dragging the thin one against the fat one, or the pair would settle in
    // two different places depending on the order they were touched.
    const away = withOrigin(SECOND, { xMeters: 20, zMeters: 0 });
    const floor = { ...FLOOR, rooms: [THICK_FIRST, away] };
    const width = part(THICK_FIRST).widthMeters;

    const thinMoved = snapRoomOrigin(floor, away, {
      xMeters: 4.26,
      zMeters: 0,
    }).xMeters;
    const fatMoved = snapRoomOrigin(
      {
        ...floor,
        rooms: [withOrigin(away, { xMeters: 4.3, zMeters: 0 }), THICK_FIRST],
      },
      THICK_FIRST,
      { xMeters: 0.04, zMeters: 0 },
    ).xMeters;

    // The thin room moved east lands a fat wall past the fat room's face; the
    // fat room moved west leaves a fat wall before the thin room's face. Same
    // gap either way, which is the whole point of a symmetric rule.
    expect(thinMoved).toBeCloseTo(4.3, 10);
    expect(thinMoved - (fatMoved + width)).toBeCloseTo(FAT, 10);
  });

  it("resizes a wall onto the thicker gap as well", () => {
    const east = withOrigin(SECOND, { xMeters: 4.3, zMeters: 0 });
    const floor = { ...FLOOR, rooms: [THICK_FIRST, east] };

    // Pulling the first room's east wall out toward its neighbour lands on 4,
    // which is the fat partition's width short of the neighbour's face.
    const resized = snapRoomResize(floor, THICK_FIRST, "east", 3.97);

    expect(part(resized).widthMeters).toBeCloseTo(4, 10);
  });

  it("leaves a room being drawn on the floor's own thickness", () => {
    // A rectangle being dragged out is not a room yet, so it has nothing of
    // its own to declare — but its neighbour still does, and the fatter wins.
    expect(snapRoomEdge(MIXED, "x", 4.28)).toBeCloseTo(4.3, 10);
  });
});

describe("drawnSection", () => {
  const drawn = (from: [number, number], to: [number, number], room = FIRST) =>
    drawnSection(
      FLOOR,
      room,
      "room-1-part-2",
      { xMeters: from[0], zMeters: from[1] },
      { xMeters: to[0], zMeters: to[1] },
    );

  it("takes its size and place from the two corners", () => {
    const part = drawn([6, 6], [8, 7.5]);

    expect(part.id).toBe("room-1-part-2");
    expect(part.origin.xMeters).toBeCloseTo(6, 10);
    expect(part.origin.zMeters).toBeCloseTo(6, 10);
    expect(part.widthMeters).toBeCloseTo(2, 10);
    expect(part.depthMeters).toBeCloseTo(1.5, 10);
    expect(part.rotationRadians).toBe(0);
    expect(part.openWalls).toEqual([]);
  });

  it("meets its own room's other rectangles directly, with no wall between", () => {
    // FIRST's part runs to x=4. A section drawn near that face lands on it
    // exactly: no wall stands at a seam inside one room.
    const part = drawn([4.03, 0], [6, 2]);

    expect(part.origin.xMeters).toBeCloseTo(4, 10);
  });

  it("stops a partition short of another room", () => {
    // SECOND runs from x=9. A section drawn near its west face stops a wall
    // thickness before it, exactly as a room would.
    const part = drawn([6, 9.5], [8.93, 10.5]);

    expect(part.origin.xMeters + part.widthMeters).toBeCloseTo(9 - 0.1, 10);
  });

  it("keeps a whole length when one edge has snapped to a neighbour's wall", () => {
    // Rounded to half a meter. The west edge lands on the shared wall at
    // 4.1, a fraction; the east edge is then set a whole 2.5 from it rather
    // than left at the round 6.5, which would make the width 2.4.
    const half = (meters: number) => Math.round(meters * 2) / 2;
    const part = drawnSection(
      FLOOR,
      SECOND,
      "room-2-part-2",
      { xMeters: 4.06, zMeters: 20 },
      { xMeters: 6.4, zMeters: 21.6 },
      half,
    );
    expect(part.origin.xMeters).toBeCloseTo(4.1, 10);
    expect(part.widthMeters).toBeCloseTo(2.5, 10);
    expect(part.depthMeters).toBeCloseTo(1.5, 10);
  });

  it("sorts the corners, so it does not matter which way the drag ran", () => {
    const forwards = drawn([6, 6], [8, 7.5]);
    const backwards = drawn([8, 7.5], [6, 6]);

    expect(backwards.origin).toEqual(forwards.origin);
    expect(backwards.widthMeters).toBeCloseTo(forwards.widthMeters, 10);
    expect(backwards.depthMeters).toBeCloseTo(forwards.depthMeters, 10);
  });

  it("holds a flick of the wrist to the smallest a rectangle may be", () => {
    const part = drawn([6, 6], [6.001, 6.001]);
    const smallest = ROOM_LENGTH_LIMITS.widthMeters.minMeters;

    expect(part.widthMeters).toBeCloseTo(smallest, 10);
    expect(part.depthMeters).toBeCloseTo(smallest, 10);
  });

  it("lands on a whole unit when given a rounding", () => {
    const part = drawnSection(
      FLOOR,
      FIRST,
      "room-1-part-2",
      { xMeters: 6.004_7, zMeters: 6.008_1 },
      { xMeters: 8.213_9, zMeters: 7.191_2 },
      (meters) => Math.round(meters * 100) / 100,
    );

    expect(part.origin.xMeters).toBeCloseTo(6, 10);
    expect(part.widthMeters).toBeCloseTo(2.21, 10);
  });
});
