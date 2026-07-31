import { describe, expect, it } from "vitest";
import {
  createProject,
  nextId,
  withDisplayUnit,
  withProducts,
  withFloor,
} from "./project";
import { primaryRoomPart } from "@/domain/room";

describe("project", () => {
  it("starts with an apartment, no furniture, and a reading preference", () => {
    const project = createProject();

    expect(project.products).toEqual([]);
    expect(project.displayUnit).toBe("imperial");
    expect(project.floor.rooms).toHaveLength(1);
    const room = project.floor.rooms[0];
    expect(room && primaryRoomPart(room).widthMeters).toBeGreaterThan(0);
  });

  it("replaces each part without mutating the original", () => {
    const project = createProject();

    expect(withDisplayUnit(project, "metric").displayUnit).toBe("metric");
    expect(withProducts(project, []).products).toEqual([]);
    expect(
      withFloor(project, { ...project.floor, rooms: [] }).floor.rooms,
    ).toEqual([]);
    expect(project.displayUnit).toBe("imperial");
  });
});

describe("nextId", () => {
  it("numbers from one when nothing exists", () => {
    expect(nextId("product", [])).toBe("product-1");
  });

  it("skips ids already in use", () => {
    expect(nextId("opening", ["opening-1"])).toBe("opening-2");
  });

  it("does not reuse an id after something in the middle was removed", () => {
    // A counter restarted from the list length would return "opening-2" here
    // and collide with the one that is still there.
    expect(nextId("opening", ["opening-1", "opening-3"])).toBe("opening-4");
  });

  it("steps past a run of taken ids", () => {
    const used = ["a-1", "a-2", "a-3", "a-4", "a-5"];

    expect(nextId("a", used)).toBe("a-6");
  });

  it("ignores ids belonging to another prefix", () => {
    expect(nextId("product", ["opening-1", "opening-2"])).toBe("product-3");
  });
});
