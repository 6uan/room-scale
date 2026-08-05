import { describe, expect, it } from "vitest";
import { metersFromInches, roundToDisplayUnit } from "@/domain/units";
import {
  ROOM_LENGTH_LIMITS,
  createRoom,
  partsOnRoomEdge,
  primaryRoomPart,
  resizeRoomEdge,
  resizeRoomPartEdge,
  roomEdgePosition,
  withParts,
  type Room,
} from "./room";

/** Four metres by three, with its north-west corner at the origin. */
const ROOM: Room = {
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

const part = (room: Room) => primaryRoomPart(room);

describe("roomEdgePosition", () => {
  it("says where each wall stands", () => {
    expect(roomEdgePosition(ROOM, "west")).toBe(0);
    expect(roomEdgePosition(ROOM, "east")).toBe(4);
    expect(roomEdgePosition(ROOM, "north")).toBe(0);
    expect(roomEdgePosition(ROOM, "south")).toBe(3);
  });
});

describe("resizeRoomEdge", () => {
  it("grows the room eastward without moving its west wall", () => {
    const wider = resizeRoomEdge(ROOM, "east", 5);

    expect(part(wider).widthMeters).toBe(5);
    expect(part(wider).origin.xMeters).toBe(0);
  });

  it("moves the origin when the west wall is the one dragged", () => {
    const wider = resizeRoomEdge(ROOM, "west", -1);

    // The east wall stayed at 4, so the room is five metres across now.
    expect(part(wider).origin.xMeters).toBe(-1);
    expect(part(wider).widthMeters).toBe(5);
    expect(roomEdgePosition(wider, "east")).toBe(4);
  });

  it("does the same on the other axis", () => {
    expect(part(resizeRoomEdge(ROOM, "south", 4)).depthMeters).toBe(4);

    const taller = resizeRoomEdge(ROOM, "north", -2);
    expect(part(taller).origin.zMeters).toBe(-2);
    expect(part(taller).depthMeters).toBe(5);
    expect(roomEdgePosition(taller, "south")).toBe(3);
  });

  it("shrinks as well as grows", () => {
    expect(part(resizeRoomEdge(ROOM, "east", 2)).widthMeters).toBe(2);
    expect(part(resizeRoomEdge(ROOM, "west", 1)).widthMeters).toBe(3);
  });

  it("will not turn a room inside out", () => {
    const smallest = ROOM_LENGTH_LIMITS.widthMeters.minMeters;

    // Dragging the east wall past the west one, and the other way round.
    expect(part(resizeRoomEdge(ROOM, "east", -10)).widthMeters).toBe(smallest);
    const squashed = resizeRoomEdge(ROOM, "west", 99);
    expect(part(squashed).widthMeters).toBe(smallest);
    expect(roomEdgePosition(squashed, "east")).toBe(4);
  });

  it("leaves the other axis alone", () => {
    const wider = resizeRoomEdge(ROOM, "east", 6);

    expect(part(wider).depthMeters).toBe(part(ROOM).depthMeters);
    expect(part(wider).origin.zMeters).toBe(part(ROOM).origin.zMeters);
  });
});

describe("roundToDisplayUnit", () => {
  it("rounds to the nearest inch for a reader working in inches", () => {
    const dragged = metersFromInches(37.4);

    expect(roundToDisplayUnit(dragged, "imperial")).toBeCloseTo(
      metersFromInches(37),
      10,
    );
  });

  it("rounds to the nearest centimeter for a reader working in metric", () => {
    expect(roundToDisplayUnit(1.234, "metric")).toBeCloseTo(1.23, 10);
  });

  it("leaves a number that is already whole where it is", () => {
    const whole = metersFromInches(96);

    expect(roundToDisplayUnit(whole, "imperial")).toBeCloseTo(whole, 10);
  });

  it("rounds a negative the same way", () => {
    expect(roundToDisplayUnit(metersFromInches(-12.6), "imperial")).toBeCloseTo(
      metersFromInches(-13),
      10,
    );
  });
});

describe("resizing a room built from several sections", () => {
  /**
   * An L: a wide arm across the north, and a narrower one hanging south from
   * its western half.
   *
   *   0        4        8
   * 0 +-----------------+
   *   |       wide      |
   * 3 +--------+--------+
   *   |  tall  |
   * 7 +--------+
   */
  const L: Room = withParts(ROOM, [
    {
      id: "wide",
      origin: { xMeters: 0, zMeters: 0 },
      widthMeters: 8,
      depthMeters: 3,
      rotationRadians: 0,
      openWalls: [],
    },
    {
      id: "tall",
      origin: { xMeters: 0, zMeters: 3 },
      widthMeters: 4,
      depthMeters: 4,
      rotationRadians: 0,
      openWalls: [],
    },
  ]);
  const section = (room: Room, id: string) =>
    room.parts.find((one) => one.id === id)!;

  it("moves every section standing on the edge, and only those", () => {
    const wider = resizeRoomEdge(L, "west", -2);

    // Both sections have their west side on the outline's west edge.
    expect(section(wider, "wide").origin.xMeters).toBe(-2);
    expect(section(wider, "wide").widthMeters).toBe(10);
    expect(section(wider, "tall").origin.xMeters).toBe(-2);
    expect(section(wider, "tall").widthMeters).toBe(6);
  });

  it("leaves a section round the corner exactly as it was measured", () => {
    const deeper = resizeRoomEdge(L, "south", 9);

    // Only the southern arm reaches the outline's south edge.
    expect(section(deeper, "tall").depthMeters).toBe(6);
    expect(section(deeper, "wide")).toEqual(section(L, "wide"));
  });

  it("moves only the arm that reaches the eastern edge", () => {
    const narrower = resizeRoomEdge(L, "east", 6);

    expect(section(narrower, "wide").widthMeters).toBe(6);
    expect(section(narrower, "tall")).toEqual(section(L, "tall"));
  });

  it("names the sections standing on each edge", () => {
    expect(partsOnRoomEdge(L, "north").map((part) => part.id)).toEqual([
      "wide",
    ]);
    expect(partsOnRoomEdge(L, "west").map((part) => part.id)).toEqual([
      "wide",
      "tall",
    ]);
    expect(partsOnRoomEdge(L, "south").map((part) => part.id)).toEqual([
      "tall",
    ]);
  });

  it("still resizes a room of one rectangle exactly as it always did", () => {
    // The single section is on all four of its own edges, so nothing about
    // this path changes for the room every apartment is mostly made of.
    expect(resizeRoomEdge(ROOM, "east", 5)).toEqual(
      resizeRoomPartEdge(ROOM, primaryRoomPart(ROOM).id, "east", 5),
    );
  });

  it("falls back to the first section when every one of them is turned", () => {
    const turned = withParts(ROOM, [
      { ...primaryRoomPart(ROOM), rotationRadians: Math.PI / 4 },
    ]);

    expect(resizeRoomEdge(turned, "east", 5)).toEqual(
      resizeRoomPartEdge(turned, primaryRoomPart(turned).id, "east", 5),
    );
  });
});
