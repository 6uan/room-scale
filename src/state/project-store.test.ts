import { beforeEach, describe, expect, it } from "vitest";
import { createProject, type Project } from "@/domain/project";
import { createRoom, withRooms, type Floor } from "@/domain/room";
import { resetProjectStore, useProjectStore } from "./project-store";

function store() {
  return useProjectStore.getState();
}

/** The floor with one more room on it, so an edit is one readable call. */
function floorWithRoom(floor: Floor, name: string): Floor {
  return withRooms(floor, [
    ...floor.rooms,
    createRoom(`room-${name}`, name, { xMeters: 0, zMeters: 0 }),
  ]);
}

function roomNames(project: Project): readonly string[] {
  return project.floor.rooms.map((room) => room.name);
}

describe("the project store", () => {
  beforeEach(() => {
    resetProjectStore();
  });

  it("has nothing to undo before anything is edited", () => {
    expect(store().canUndo).toBe(false);
    expect(store().canRedo).toBe(false);
  });

  it("takes an edit back", () => {
    const before = roomNames(store().project);
    store().setFloor(floorWithRoom(store().project.floor, "Study"));

    expect(store().canUndo).toBe(true);
    store().undo();

    expect(roomNames(store().project)).toEqual(before);
  });

  it("puts an undone edit back", () => {
    store().setFloor(floorWithRoom(store().project.floor, "Study"));
    store().undo();

    store().redo();

    expect(roomNames(store().project)).toContain("Study");
  });

  it("collapses a drag into one step back", () => {
    const before = roomNames(store().project);
    for (const name of ["a", "b", "c"]) {
      store().setFloor(floorWithRoom(createProject().floor, name), "drag");
    }

    store().undo();

    expect(roomNames(store().project)).toEqual(before);
  });

  it("separates two drags once the first has ended", () => {
    store().setFloor(floorWithRoom(store().project.floor, "First"), "drag");
    store().endGesture();
    store().setFloor(floorWithRoom(store().project.floor, "Second"), "drag");

    store().undo();

    expect(roomNames(store().project)).toContain("First");
    expect(roomNames(store().project)).not.toContain("Second");
  });

  it("does not record a change of display unit", () => {
    store().setDisplayUnit("metric");

    expect(store().canUndo).toBe(false);
  });

  it("keeps the display unit when an edit is taken back", () => {
    store().setFloor(floorWithRoom(store().project.floor, "Study"));
    store().setDisplayUnit("metric");

    store().undo();

    expect(store().project.displayUnit).toBe("metric");
    expect(roomNames(store().project)).not.toContain("Study");
  });

  it("forgets the history when a stored project is loaded", () => {
    store().setFloor(floorWithRoom(store().project.floor, "Study"));

    store().adopt(createProject());

    expect(store().canUndo).toBe(false);
  });

  it("keeps the history when a file is opened, so the wrong file is undoable", () => {
    store().setFloor(floorWithRoom(store().project.floor, "Study"));

    store().adopt(createProject(), { undoable: true });
    store().undo();

    expect(roomNames(store().project)).toContain("Study");
  });
});
