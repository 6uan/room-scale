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

  it("refuses a non-positive grid spacing", () => {
    const room = createRoom("room-1", "Guest room", {
      xMeters: 0,
      zMeters: 0,
    });

    expect(roomGridLines(room, 0)).toEqual([]);
  });
});
