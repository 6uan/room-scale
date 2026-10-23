import { describe, expect, it } from "vitest";
import { metersFromInches } from "@/domain/units";
import { metersFromFeetAndInches } from "@/domain/units";
import { createOpening } from "./openings";
import { LIVING_ROOM } from "./fixtures";
import {
  ROOM_LENGTH_LIMITS,
  checkRoomLength,
  createRoom,
  groupMates,
  isValidRoom,
  partGroupOf,
  pointOnRoomPart,
  primaryRoomPart,
  resizeRoomPartEdgeToPoint,
  roomBounds,
  roomFloorAreaSquareMeters,
  roomPartContains,
  roomPartPivotRect,
  roomPartWallState,
  withOpenings,
  withOrigin,
  withPartGroup,
  withPartGroupName,
  withPartUngrouped,
  withParts,
  withRoomLength,
  withRoomPart,
  withRoomPartRotation,
  withoutPartGroup,
  withoutRoomParts,
  type Room,
} from "./room";

describe("room lengths", () => {
  it("accepts an ordinary room dimension", () => {
    expect(
      checkRoomLength(metersFromFeetAndInches(13, 9), "widthMeters"),
    ).toBeNull();
  });

  it("accepts the bounds themselves", () => {
    const { minMeters, maxMeters } = ROOM_LENGTH_LIMITS.widthMeters;

    expect(checkRoomLength(minMeters, "widthMeters")).toBeNull();
    expect(checkRoomLength(maxMeters, "widthMeters")).toBeNull();
  });

  it("rejects lengths outside the bounds", () => {
    expect(checkRoomLength(0, "widthMeters")).toBe("too-small");
    expect(checkRoomLength(-4, "widthMeters")).toBe("too-small");
    expect(checkRoomLength(40, "widthMeters")).toBe("too-large");
  });

  it("holds each dimension to its own bounds", () => {
    // A 4 m length is a fine wall, an absurd ceiling, and an absurd wall
    // thickness.
    expect(checkRoomLength(4, "widthMeters")).toBeNull();
    expect(checkRoomLength(4, "heightMeters")).toBeNull();
    expect(checkRoomLength(8, "heightMeters")).toBe("too-large");
    // Wall thickness is the floor's now: an apartment has one kind of wall.
  });

  it("rejects values that are not real numbers", () => {
    expect(checkRoomLength(Number.NaN, "widthMeters")).toBe("not-a-number");
    expect(checkRoomLength(Number.POSITIVE_INFINITY, "depthMeters")).toBe(
      "not-a-number",
    );
  });
});

describe("room", () => {
  it("ships a valid default", () => {
    expect(isValidRoom(LIVING_ROOM)).toBe(true);
  });

  it("reports a room with any bad dimension as invalid", () => {
    expect(isValidRoom(withRoomLength(LIVING_ROOM, "depthMeters", 0))).toBe(
      false,
    );
    expect(isValidRoom(withRoomLength(LIVING_ROOM, "heightMeters", 99))).toBe(
      false,
    );
  });

  it("reports a room as invalid when an opening has fallen off its wall", () => {
    // The default door sits on the south wall; a much narrower room leaves it
    // hanging past the corner.
    expect(isValidRoom(withRoomLength(LIVING_ROOM, "widthMeters", 1))).toBe(
      false,
    );
  });

  it("replaces one dimension without mutating the original", () => {
    const updated = withRoomLength(LIVING_ROOM, "widthMeters", 5);

    expect(primaryRoomPart(updated).widthMeters).toBe(5);
    expect(primaryRoomPart(updated).depthMeters).toBe(
      primaryRoomPart(LIVING_ROOM).depthMeters,
    );
    // Fourteen feet, which is where the default started.
    expect(primaryRoomPart(LIVING_ROOM).widthMeters).toBe(
      metersFromInches(168),
    );
  });

  it("replaces the openings without mutating the original", () => {
    const updated = withOpenings(LIVING_ROOM, [
      createOpening("passage", "p1", LIVING_ROOM),
    ]);

    expect(updated.openings).toHaveLength(1);
    expect(LIVING_ROOM.openings).toHaveLength(2);
  });

  it("computes floor area from width and depth only", () => {
    const room = withRoomPart(
      LIVING_ROOM,
      primaryRoomPart(LIVING_ROOM).id,
      (part) => ({ ...part, widthMeters: 4, depthMeters: 3 }),
    );

    expect(roomFloorAreaSquareMeters(room)).toBeCloseTo(12, 10);
  });

  it("counts overlapping rectangular parts once", () => {
    const first = primaryRoomPart(LIVING_ROOM);
    const room = {
      ...LIVING_ROOM,
      parts: [
        {
          ...first,
          origin: { xMeters: 0, zMeters: 0 },
          widthMeters: 4,
          depthMeters: 3,
        },
        {
          ...first,
          id: "part-2",
          origin: { xMeters: 2, zMeters: 2 },
          widthMeters: 3,
          depthMeters: 2,
        },
      ],
      openings: [],
    };

    expect(roomFloorAreaSquareMeters(room)).toBe(16);
  });

  it("measures floor area inside the walls, from the numbers a tape gives", () => {
    const same = withRoomLength(LIVING_ROOM, "heightMeters", 3);

    expect(roomFloorAreaSquareMeters(same)).toBe(
      roomFloorAreaSquareMeters(LIVING_ROOM),
    );
  });
});

describe("turned parts", () => {
  /** A 4 × 3 part turned 45° about its anchor corner at (1, 1). */
  const TURNED: Room = {
    ...LIVING_ROOM,
    parts: [
      {
        id: "part-1",
        origin: { xMeters: 1, zMeters: 1 },
        widthMeters: 4,
        depthMeters: 3,
        rotationRadians: Math.PI / 4,
        openWalls: [],
      },
    ],
    openings: [],
  };
  const part = (room: Room) => primaryRoomPart(room);

  it("spins in place: the center holds still and the corner follows", () => {
    const turned = withRoomPartRotation(LIVING_ROOM, "room-1-part-1", 0.3);
    const before = roomPartPivotRect(primaryRoomPart(LIVING_ROOM)).center;
    const after = roomPartPivotRect(primaryRoomPart(turned)).center;

    expect(after.xMeters).toBeCloseTo(before.xMeters, 12);
    expect(after.zMeters).toBeCloseTo(before.zMeters, 12);
    expect(primaryRoomPart(turned).rotationRadians).toBe(0.3);
    expect(primaryRoomPart(turned).origin).not.toEqual(
      primaryRoomPart(LIVING_ROOM).origin,
    );
  });

  it("turns back to zero without the section having drifted", () => {
    const there = withRoomPartRotation(LIVING_ROOM, "room-1-part-1", 0.3);
    const back = withRoomPartRotation(there, "room-1-part-1", 0);
    const original = primaryRoomPart(LIVING_ROOM);

    expect(primaryRoomPart(back).origin.xMeters).toBeCloseTo(
      original.origin.xMeters,
      12,
    );
    expect(primaryRoomPart(back).origin.zMeters).toBeCloseTo(
      original.origin.zMeters,
      12,
    );
  });

  it("keeps the turned area what the tape would measure", () => {
    expect(roomFloorAreaSquareMeters(TURNED)).toBeCloseTo(12, 10);
  });

  it("bounds a turned part by its swept corners, not its typed size", () => {
    const bounds = roomBounds(TURNED);
    const spread = (4 + 3) * (Math.SQRT2 / 2);

    expect(bounds.widthMeters).toBeCloseTo(spread, 10);
    expect(bounds.depthMeters).toBeCloseTo(spread, 10);
    // The west extreme is the swept south-west corner, 3/√2 west of the anchor.
    expect(bounds.origin.xMeters).toBeCloseTo(1 - 3 * (Math.SQRT2 / 2), 10);
    expect(bounds.origin.zMeters).toBeCloseTo(1, 10);
  });

  it("contains points by the turned shape, not the box around it", () => {
    // Just north-east of the anchor: inside the bounding box, outside the part.
    expect(
      roomPartContains(part(TURNED), { xMeters: 1.4, zMeters: 1.05 }),
    ).toBe(false);
    // On the part's own diagonal middle.
    expect(
      roomPartContains(
        part(TURNED),
        pointOnRoomPart(part(TURNED), { xMeters: 2, zMeters: 1.5 }),
      ),
    ).toBe(true);
  });

  it("moves the whole room without disturbing a part's turn", () => {
    const moved = withOrigin(TURNED, { xMeters: 10, zMeters: 10 });

    expect(part(moved).rotationRadians).toBe(Math.PI / 4);
    expect(part(moved).widthMeters).toBe(4);
    expect(roomBounds(moved).origin.xMeters).toBeCloseTo(10, 10);
    expect(roomBounds(moved).origin.zMeters).toBeCloseTo(10, 10);
  });

  it("resizes the east edge to where the pointer lands in the part's own frame", () => {
    // Two meters along the turned width from the anchor, on the wall itself.
    const at = pointOnRoomPart(part(TURNED), { xMeters: 2, zMeters: 1.5 });
    const resized = resizeRoomPartEdgeToPoint(TURNED, "part-1", "east", at);

    expect(part(resized).widthMeters).toBeCloseTo(2, 10);
    expect(part(resized).origin).toEqual(part(TURNED).origin);
    expect(part(resized).rotationRadians).toBe(Math.PI / 4);
  });

  it("slides the anchor along the turned axis when the west edge is dragged", () => {
    const at = pointOnRoomPart(part(TURNED), { xMeters: 1, zMeters: 0 });
    const resized = resizeRoomPartEdgeToPoint(TURNED, "part-1", "west", at);

    expect(part(resized).widthMeters).toBeCloseTo(3, 10);
    // The anchor moved one meter along the turned width: 1/√2 east and south.
    expect(part(resized).origin.xMeters).toBeCloseTo(1 + Math.SQRT2 / 2, 10);
    expect(part(resized).origin.zMeters).toBeCloseTo(1 + Math.SQRT2 / 2, 10);
    // The east edge stayed put.
    const farCorner = pointOnRoomPart(part(resized), {
      xMeters: 3,
      zMeters: 0,
    });
    const before = pointOnRoomPart(part(TURNED), { xMeters: 4, zMeters: 0 });
    expect(farCorner.xMeters).toBeCloseTo(before.xMeters, 10);
    expect(farCorner.zMeters).toBeCloseTo(before.zMeters, 10);
  });

  it("will not resize a turned part smaller than a room may be", () => {
    const at = pointOnRoomPart(part(TURNED), { xMeters: 0.01, zMeters: 0 });
    const resized = resizeRoomPartEdgeToPoint(TURNED, "part-1", "east", at);

    expect(part(resized).widthMeters).toBe(
      ROOM_LENGTH_LIMITS.widthMeters.minMeters,
    );
  });
});

describe("groups of sections", () => {
  const base = withParts(
    createRoom("r", "Bedroom", { xMeters: 0, zMeters: 0 }),
    [
      {
        id: "a",
        origin: { xMeters: 0, zMeters: 0 },
        widthMeters: 5,
        depthMeters: 5,
        rotationRadians: 0,
        openWalls: [],
      },
      {
        id: "b",
        origin: { xMeters: 1, zMeters: 1 },
        widthMeters: 1,
        depthMeters: 2,
        rotationRadians: 0,
        openWalls: [],
      },
      {
        id: "c",
        origin: { xMeters: 2, zMeters: 1 },
        widthMeters: 1,
        depthMeters: 1,
        rotationRadians: 0,
        openWalls: [],
      },
    ],
  );

  it("gathers sections under one name", () => {
    const room = withPartGroup(base, { id: "g", name: "Closet" }, ["b", "c"]);
    expect(room.partGroups).toEqual([{ id: "g", name: "Closet" }]);
    expect(room.parts.map((part) => part.groupId)).toEqual([
      undefined,
      "g",
      "g",
    ]);
    expect(partGroupOf(room, "c")?.name).toBe("Closet");
    expect(groupMates(room, room.parts[1]!).map((part) => part.id)).toEqual([
      "c",
    ]);
  });

  it("drops a group left with one section", () => {
    const room = withPartUngrouped(
      withPartGroup(base, { id: "g", name: "Closet" }, ["b", "c"]),
      "c",
    );
    expect(room.partGroups).toBeUndefined();
    expect(room.parts.every((part) => part.groupId === undefined)).toBe(true);
  });

  it("ungroups all at once, and renames", () => {
    const grouped = withPartGroup(base, { id: "g", name: "Closet" }, [
      "b",
      "c",
    ]);
    expect(
      withPartGroupName(grouped, "g", "Pantry").partGroups?.[0]?.name,
    ).toBe("Pantry");
    const loose = withoutPartGroup(grouped, "g");
    expect(loose.partGroups).toBeUndefined();
    expect(loose.parts.every((part) => part.groupId === undefined)).toBe(true);
  });

  it("deletes sections with their openings, and a group left with one", () => {
    const grouped = withOpenings(
      withPartGroup(base, { id: "g", name: "Closet" }, ["b", "c"]),
      [
        createOpening("door", "o1", base, "north", 0.5, "a"),
        createOpening("door", "o2", base, "north", 0.5, "c"),
      ],
    );

    const one = withoutRoomParts(grouped, ["c"]);
    expect(one.parts.map((part) => part.id)).toEqual(["a", "b"]);
    expect(one.openings.map((opening) => opening.id)).toEqual(["o1"]);
    expect(one.partGroups).toBeUndefined();
    expect(one.parts[1]?.groupId).toBeUndefined();

    const closet = withoutRoomParts(grouped, ["b", "c"]);
    expect(closet.parts.map((part) => part.id)).toEqual(["a"]);
    expect(closet.partGroups).toBeUndefined();
  });

  it("refuses to delete every section, which would be the room", () => {
    expect(withoutRoomParts(base, ["a", "b", "c"])).toBe(base);
  });

  it("reads every side of a grouped section as dividing", () => {
    const room = withPartGroup(base, { id: "g", name: "Closet" }, ["b", "c"]);
    expect(roomPartWallState(room.parts[1]!, "west")).toBe("dividing");
    expect(roomPartWallState(base.parts[1]!, "west")).toBe("auto");
  });
});
