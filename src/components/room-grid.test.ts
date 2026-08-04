import { describe, expect, it } from "vitest";
import { createRoom, withParts } from "@/domain/room";
import { roomGridLines } from "./room-grid";

describe("roomGridLines", () => {
  it("uses one origin and rhythm across every room part", () => {
    const room = withParts(
      createRoom("room-1", "Guest room", { xMeters: 0, zMeters: 0 }),
      [
        {
          id: "room-1-part-1",
          origin: { xMeters: 0, zMeters: 0 },
          widthMeters: 4,
          depthMeters: 4,
          rotationRadians: 0,
          openWalls: [],
        },
        {
          id: "room-1-part-2",
          origin: { xMeters: 2.5, zMeters: 2.5 },
          widthMeters: 3,
          depthMeters: 2.5,
          rotationRadians: 0,
          openWalls: [],
        },
      ],
    );

    expect(roomGridLines(room)).toEqual([
      {
        from: { xMeters: 1, zMeters: 0 },
        to: { xMeters: 1, zMeters: 5 },
      },
      {
        from: { xMeters: 2, zMeters: 0 },
        to: { xMeters: 2, zMeters: 5 },
      },
      {
        from: { xMeters: 3, zMeters: 0 },
        to: { xMeters: 3, zMeters: 5 },
      },
      {
        from: { xMeters: 4, zMeters: 0 },
        to: { xMeters: 4, zMeters: 5 },
      },
      {
        from: { xMeters: 5, zMeters: 0 },
        to: { xMeters: 5, zMeters: 5 },
      },
      {
        from: { xMeters: 0, zMeters: 1 },
        to: { xMeters: 5.5, zMeters: 1 },
      },
      {
        from: { xMeters: 0, zMeters: 2 },
        to: { xMeters: 5.5, zMeters: 2 },
      },
      {
        from: { xMeters: 0, zMeters: 3 },
        to: { xMeters: 5.5, zMeters: 3 },
      },
      {
        from: { xMeters: 0, zMeters: 4 },
        to: { xMeters: 5.5, zMeters: 4 },
      },
    ]);
  });

  it("keeps its lines on the floor's meters when the room does not start on one", () => {
    const room = withParts(
      createRoom("room-1", "Guest room", { xMeters: 0.4, zMeters: 0.75 }),
      [
        {
          id: "room-1-part-1",
          origin: { xMeters: 0.4, zMeters: 0.75 },
          widthMeters: 2.2,
          depthMeters: 1.5,
          rotationRadians: 0,
          openWalls: [],
        },
      ],
    );

    expect(roomGridLines(room)).toEqual([
      {
        from: { xMeters: 1, zMeters: 0.75 },
        to: { xMeters: 1, zMeters: 2.25 },
      },
      {
        from: { xMeters: 2, zMeters: 0.75 },
        to: { xMeters: 2, zMeters: 2.25 },
      },
      { from: { xMeters: 0.4, zMeters: 1 }, to: { xMeters: 2.6, zMeters: 1 } },
      { from: { xMeters: 0.4, zMeters: 2 }, to: { xMeters: 2.6, zMeters: 2 } },
    ]);
  });

  it("draws the same lines wherever a part is dragged", () => {
    const at = (xMeters: number, zMeters: number) =>
      withParts(createRoom("room-1", "Guest room", { xMeters, zMeters }), [
        {
          id: "room-1-part-1",
          origin: { xMeters, zMeters },
          widthMeters: 3,
          depthMeters: 3,
          rotationRadians: 0,
          openWalls: [],
        },
      ]);

    // North-west used to shift the whole rhythm; south-east used to leave it
    // alone. Both now leave the meters where they were.
    const crossings = (room: ReturnType<typeof at>) =>
      roomGridLines(room)
        .filter((line) => line.from.xMeters === line.to.xMeters)
        .map((line) => line.from.xMeters);

    expect(crossings(at(0, 0))).toEqual([1, 2]);
    expect(crossings(at(0.5, 0))).toEqual([1, 2, 3]);
    expect(crossings(at(-0.5, 0))).toEqual([0, 1, 2]);
  });

  it("refuses a non-positive grid spacing", () => {
    const room = createRoom("room-1", "Guest room", {
      xMeters: 0,
      zMeters: 0,
    });

    expect(roomGridLines(room, 0)).toEqual([]);
  });
});
