import { describe, expect, it } from "vitest";
import { roomPartHandles } from "./room-plan-canvas";

describe("roomPartHandles", () => {
  it("puts native resize handles around the selected part", () => {
    const handles = roomPartHandles({
      id: "part-2",
      origin: { xMeters: 3, zMeters: 4 },
      widthMeters: 2,
      depthMeters: 1,
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
});
