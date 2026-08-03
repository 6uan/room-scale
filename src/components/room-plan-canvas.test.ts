import { describe, expect, it } from "vitest";
import {
  ROTATE_HANDLE_CLEARANCE_PIXELS,
  roomPartHandles,
  rotateHandlePixel,
} from "./room-plan-canvas";
import type { FloorPoint } from "@/domain/geometry";

describe("roomPartHandles", () => {
  it("puts native resize handles around the selected part", () => {
    const handles = roomPartHandles({
      id: "part-2",
      origin: { xMeters: 3, zMeters: 4 },
      widthMeters: 2,
      depthMeters: 1,
      rotationRadians: 0,
      openWalls: [],
    });

    expect(handles).toHaveLength(8);
    expect(handles).toContainEqual({
      edges: ["north", "west"],
      at: { xMeters: 3, zMeters: 4 },
    });
    expect(handles).toContainEqual({
      edges: ["south", "east"],
      at: { xMeters: 5, zMeters: 5 },
    });
  });

  it("keeps the handles on a turned part's actual corners", () => {
    const handles = roomPartHandles({
      id: "part-2",
      origin: { xMeters: 3, zMeters: 4 },
      widthMeters: 2,
      depthMeters: 1,
      rotationRadians: Math.PI / 2,
      openWalls: [],
    });

    // A quarter turn about the anchor: the width now runs south.
    const northWest = handles.find(
      (handle) => handle.edges.join() === "north,west",
    );
    expect(northWest?.at).toEqual({ xMeters: 3, zMeters: 4 });

    const southEast = handles.find(
      (handle) => handle.edges.join() === "south,east",
    );
    expect(southEast?.at.xMeters).toBeCloseTo(2, 10);
    expect(southEast?.at.zMeters).toBeCloseTo(6, 10);
  });
});

describe("rotateHandlePixel", () => {
  const toPixels = (point: FloorPoint) => ({
    x: point.xMeters * 10,
    y: point.zMeters * 10,
  });

  it("floats a fixed reach past the middle of the north wall", () => {
    const at = rotateHandlePixel(
      {
        id: "part-1",
        origin: { xMeters: 0, zMeters: 0 },
        widthMeters: 4,
        depthMeters: 2,
        rotationRadians: 0,
        openWalls: [],
      },
      toPixels,
      5,
    );

    expect(at.x).toBeCloseTo(20, 10);
    expect(at.y).toBeCloseTo(-(5 + ROTATE_HANDLE_CLEARANCE_PIXELS), 10);
  });

  it("follows the wall as the part turns", () => {
    const at = rotateHandlePixel(
      {
        id: "part-1",
        origin: { xMeters: 0, zMeters: 0 },
        widthMeters: 4,
        depthMeters: 2,
        rotationRadians: Math.PI / 2,
        openWalls: [],
      },
      toPixels,
      5,
    );

    // A quarter turn: the north wall now runs south, its outside facing east.
    expect(at.x).toBeCloseTo(5 + ROTATE_HANDLE_CLEARANCE_PIXELS, 10);
    expect(at.y).toBeCloseTo(20, 10);
  });
});
