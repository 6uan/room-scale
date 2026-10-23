import { describe, expect, it } from "vitest";
import { LIVING_ROOM, LIVING_ROOM_FLOOR } from "./fixtures";
import { withRoomMoved, withRooms } from "./floor";

const floor = withRooms(
  LIVING_ROOM_FLOOR,
  ["a", "b", "c"].map((id) => ({ ...LIVING_ROOM, id, name: id })),
);
const order = (next: typeof floor) => next.rooms.map((room) => room.id);

describe("withRoomMoved", () => {
  it("puts a room before another, up or down the list", () => {
    expect(order(withRoomMoved(floor, "c", "a"))).toEqual(["c", "a", "b"]);
    expect(order(withRoomMoved(floor, "a", "c"))).toEqual(["b", "a", "c"]);
  });

  it("puts a room last when there is nothing to put it before", () => {
    expect(order(withRoomMoved(floor, "a", null))).toEqual(["b", "c", "a"]);
  });

  it("changes nothing but the order", () => {
    const moved = withRoomMoved(floor, "c", "a");
    expect(moved.rooms[0]).toBe(floor.rooms[2]);
    expect(moved.wallThicknessMeters).toBe(floor.wallThicknessMeters);
  });

  it("leaves the floor alone for a room before itself, or one not there", () => {
    expect(withRoomMoved(floor, "b", "b")).toBe(floor);
    expect(withRoomMoved(floor, "missing", "a")).toBe(floor);
    expect(withRoomMoved(floor, "a", "missing")).toBe(floor);
  });
});
