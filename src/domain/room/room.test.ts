import { describe, expect, it } from "vitest";
import { metersFromFeetAndInches } from "@/domain/units";
import { createOpening } from "./openings";
import {
  DEFAULT_ROOM,
  ROOM_LENGTH_LIMITS,
  checkRoomLength,
  isValidRoom,
  roomFloorAreaSquareMeters,
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
    expect(checkRoomLength(4, "wallThicknessMeters")).toBe("too-large");
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

    expect(updated.widthMeters).toBe(5);
    expect(updated.depthMeters).toBe(DEFAULT_ROOM.depthMeters);
    expect(DEFAULT_ROOM.widthMeters).toBe(4.2);
  });

  it("replaces the openings without mutating the original", () => {
    const updated = withOpenings(DEFAULT_ROOM, [
      createOpening("passage", "p1", DEFAULT_ROOM),
    ]);

    expect(updated.openings).toHaveLength(1);
    expect(DEFAULT_ROOM.openings).toHaveLength(2);
  });

  it("computes floor area from width and depth only", () => {
    const room = { ...DEFAULT_ROOM, widthMeters: 4, depthMeters: 3 };

    expect(roomFloorAreaSquareMeters(room)).toBeCloseTo(12, 10);
  });

  it("measures floor area inside the walls, so wall thickness cannot change it", () => {
    const thick = withRoomLength(DEFAULT_ROOM, "wallThicknessMeters", 0.4);

    expect(roomFloorAreaSquareMeters(thick)).toBe(
      roomFloorAreaSquareMeters(DEFAULT_ROOM),
    );
  });
});
