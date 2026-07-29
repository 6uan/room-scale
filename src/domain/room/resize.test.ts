import { describe, expect, it } from "vitest";
import { metersFromInches, roundToDisplayUnit } from "@/domain/units";
import {
  ROOM_LENGTH_LIMITS,
  createRoom,
  resizeRoomEdge,
  roomEdgePosition,
  type Room,
} from "./room";

/** Four metres by three, with its north-west corner at the origin. */
const ROOM: Room = {
  ...createRoom("room-1", "Living room", { xMeters: 0, zMeters: 0 }),
  widthMeters: 4,
  depthMeters: 3,
};

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

    expect(wider.widthMeters).toBe(5);
    expect(wider.origin.xMeters).toBe(0);
  });

  it("moves the origin when the west wall is the one dragged", () => {
    const wider = resizeRoomEdge(ROOM, "west", -1);

    // The east wall stayed at 4, so the room is five metres across now.
    expect(wider.origin.xMeters).toBe(-1);
    expect(wider.widthMeters).toBe(5);
    expect(roomEdgePosition(wider, "east")).toBe(4);
  });

  it("does the same on the other axis", () => {
    expect(resizeRoomEdge(ROOM, "south", 4).depthMeters).toBe(4);

    const taller = resizeRoomEdge(ROOM, "north", -2);
    expect(taller.origin.zMeters).toBe(-2);
    expect(taller.depthMeters).toBe(5);
    expect(roomEdgePosition(taller, "south")).toBe(3);
  });

  it("shrinks as well as grows", () => {
    expect(resizeRoomEdge(ROOM, "east", 2).widthMeters).toBe(2);
    expect(resizeRoomEdge(ROOM, "west", 1).widthMeters).toBe(3);
  });

  it("will not turn a room inside out", () => {
    const smallest = ROOM_LENGTH_LIMITS.widthMeters.minMeters;

    // Dragging the east wall past the west one, and the other way round.
    expect(resizeRoomEdge(ROOM, "east", -10).widthMeters).toBe(smallest);
    const squashed = resizeRoomEdge(ROOM, "west", 99);
    expect(squashed.widthMeters).toBe(smallest);
    expect(roomEdgePosition(squashed, "east")).toBe(4);
  });

  it("leaves the other axis alone", () => {
    const wider = resizeRoomEdge(ROOM, "east", 6);

    expect(wider.depthMeters).toBe(ROOM.depthMeters);
    expect(wider.origin.zMeters).toBe(ROOM.origin.zMeters);
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
