import { describe, expect, it } from "vitest";
import { metersFromInches } from "@/domain/units";
import { metersFromFeetAndInches } from "@/domain/units";
import { createOpening } from "./openings";
import {
  DEFAULT_ROOM,
  ROOM_LENGTH_LIMITS,
  checkRoomLength,
  isValidRoom,
  primaryRoomPart,
  roomFloorAreaSquareMeters,
  withRoomPart,
  withOpenings,
  withRoomLength,
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
    expect(isValidRoom(DEFAULT_ROOM)).toBe(true);
  });

  it("reports a room with any bad dimension as invalid", () => {
    expect(isValidRoom(withRoomLength(DEFAULT_ROOM, "depthMeters", 0))).toBe(
      false,
    );
    expect(isValidRoom(withRoomLength(DEFAULT_ROOM, "heightMeters", 99))).toBe(
      false,
    );
  });

  it("reports a room as invalid when an opening has fallen off its wall", () => {
    // The default door sits on the south wall; a much narrower room leaves it
    // hanging past the corner.
    expect(isValidRoom(withRoomLength(DEFAULT_ROOM, "widthMeters", 1))).toBe(
      false,
    );
  });

  it("replaces one dimension without mutating the original", () => {
    const updated = withRoomLength(DEFAULT_ROOM, "widthMeters", 5);

    expect(primaryRoomPart(updated).widthMeters).toBe(5);
    expect(primaryRoomPart(updated).depthMeters).toBe(
      primaryRoomPart(DEFAULT_ROOM).depthMeters,
    );
    // Fourteen feet, which is where the default started.
    expect(primaryRoomPart(DEFAULT_ROOM).widthMeters).toBe(
      metersFromInches(168),
    );
  });

  it("replaces the openings without mutating the original", () => {
    const updated = withOpenings(DEFAULT_ROOM, [
      createOpening("passage", "p1", DEFAULT_ROOM),
    ]);

    expect(updated.openings).toHaveLength(1);
    expect(DEFAULT_ROOM.openings).toHaveLength(2);
  });

  it("computes floor area from width and depth only", () => {
    const room = withRoomPart(
      DEFAULT_ROOM,
      primaryRoomPart(DEFAULT_ROOM).id,
      (part) => ({ ...part, widthMeters: 4, depthMeters: 3 }),
    );

    expect(roomFloorAreaSquareMeters(room)).toBeCloseTo(12, 10);
  });

  it("counts overlapping rectangular parts once", () => {
    const first = primaryRoomPart(DEFAULT_ROOM);
    const room = {
      ...DEFAULT_ROOM,
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
    const same = withRoomLength(DEFAULT_ROOM, "heightMeters", 3);

    expect(roomFloorAreaSquareMeters(same)).toBe(
      roomFloorAreaSquareMeters(DEFAULT_ROOM),
    );
  });
});
