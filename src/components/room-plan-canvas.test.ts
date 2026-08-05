import { describe, expect, it } from "vitest";
import {
  ROTATE_HANDLE_CLEARANCE_PIXELS,
  roomHandles,
  roomPartHandles,
  rotateHandlePixel,
  underlayFrame,
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

describe("roomHandles", () => {
  const room = {
    id: "room-1",
    name: "Living room",
    heightMeters: 2.4,
    openings: [],
    wallThicknessMeters: null,
    parts: [
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
    ],
  };

  it("gives one rectangle the eight handles it has always had", () => {
    expect(roomHandles({ ...room, parts: [room.parts[0]!] })).toHaveLength(8);
  });

  it("gives a room of several sections its four outline walls", () => {
    const handles = roomHandles(room);

    expect(handles).toHaveLength(4);
    expect(handles.map((handle) => handle.edges.join())).toEqual([
      "north",
      "east",
      "south",
      "west",
    ]);
  });

  it("puts each grab on a wall that is really there", () => {
    const handles = roomHandles(room);
    const on = (edge: string) =>
      handles.find((handle) => handle.edges.join() === edge)?.at;

    // The east handle belongs to the wide arm, which is the only section
    // reaching that far, so it sits half way down that arm rather than half
    // way down an outline whose lower half is open floor.
    expect(on("east")).toEqual({ xMeters: 8, zMeters: 1.5 });
    // The south handle belongs to the tall arm, for the same reason.
    expect(on("south")).toEqual({ xMeters: 2, zMeters: 7 });
    // Two sections share the west edge; the grab goes on the wider run.
    expect(on("west")).toEqual({ xMeters: 0, zMeters: 5 });
  });

  it("offers no corner handles, because a corner can be nobody's", () => {
    // The inside corner of an L hangs in open floor, and a handle floating
    // off the drawing is a worse answer than not offering one.
    expect(roomHandles(room).every((handle) => handle.edges.length === 1)).toBe(
      true,
    );
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

describe("underlayFrame", () => {
  it("puts the image exactly where its floor rectangle projects", () => {
    const frame = underlayFrame(
      {
        imageDataUrl: "data:image/png;base64,x",
        imageWidthPixels: 800,
        imageHeightPixels: 600,
        metersPerPixel: 0.01,
        origin: { xMeters: -4, zMeters: -3 },
        visible: true,
      },
      { pixelsPerMeter: 50, originX: 300, originY: 200 },
    );

    expect(frame.left).toBe(300 + -4 * 50);
    expect(frame.top).toBe(200 + -3 * 50);
    expect(frame.width).toBe(800 * 0.01 * 50);
    expect(frame.height).toBe(600 * 0.01 * 50);
  });
});
