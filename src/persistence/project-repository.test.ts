import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withDisplayUnit } from "@/domain/project";
import { withRoom, withRoomLength } from "@/domain/room";
import {
  CURRENT_PROJECT_ID,
  QUARANTINE_ID,
  createDatabase,
  type RoomScaleDatabase,
} from "./project-database";
import { clearProject, loadProject, saveProject } from "./project-repository";
import { projectWithLivingRoom } from "@/domain/project/fixtures";

/**
 * Runs against `fake-indexeddb`, which is a real IndexedDB implementation
 * rather than a stub — so Dexie does the same work here as in a browser.
 */
let database: RoomScaleDatabase;
let databaseNumber = 0;

beforeEach(async () => {
  // A fresh database per test, so one test's stored project cannot leak.
  databaseNumber += 1;
  database = createDatabase(`roomscale-test-${databaseNumber}`);
  await database.open();
});

afterEach(async () => {
  database.close();
});

describe("loadProject", () => {
  it("reports a first visit as empty", async () => {
    await expect(loadProject(database)).resolves.toEqual({ status: "empty" });
  });

  it("reads back what was saved", async () => {
    const project = withDisplayUnit(projectWithLivingRoom(), "metric");
    await saveProject(project, 1_700_000_000_000, database);

    await expect(loadProject(database)).resolves.toEqual({
      status: "loaded",
      project,
    });
  });

  it("reads back a room that was edited", async () => {
    const project = projectWithLivingRoom();
    const [room] = project.floor.rooms;
    if (room === undefined) {
      throw new Error("a new project starts with one room");
    }
    const edited = {
      ...project,
      floor: withRoom(project.floor, withRoomLength(room, "widthMeters", 5.5)),
    };
    await saveProject(edited, 1_700_000_000_000, database);

    const result = await loadProject(database);
    expect(
      result.status === "loaded" &&
        result.project.floor.rooms[0]?.parts[0]?.widthMeters,
    ).toBe(5.5);
  });

  it("keeps the newest save rather than accumulating rows", async () => {
    await saveProject(projectWithLivingRoom(), 1, database);
    await saveProject(
      withDisplayUnit(projectWithLivingRoom(), "metric"),
      2,
      database,
    );

    const result = await loadProject(database);
    expect(result.status === "loaded" && result.project.displayUnit).toBe(
      "metric",
    );
    await expect(database.projects.count()).resolves.toBe(1);
  });

  it("reports a record it cannot read instead of throwing", async () => {
    await database.projects.put({
      id: CURRENT_PROJECT_ID,
      version: 1,
      updatedAt: 0,
      project: { room: "not a room" },
    });

    await expect(loadProject(database)).resolves.toEqual({
      status: "unreadable",
      reason: "unreadable",
    });
  });

  it("keeps an unreadable record instead of losing it", async () => {
    const damaged = {
      id: CURRENT_PROJECT_ID,
      version: 1,
      updatedAt: 0,
      project: { room: "not a room" },
    };
    await database.projects.put(damaged);

    await loadProject(database);

    // Quarantined under its own id, and still there after a later save.
    await saveProject(projectWithLivingRoom(), 1, database);
    await expect(database.projects.get(QUARANTINE_ID)).resolves.toMatchObject({
      project: { room: "not a room" },
    });
  });

  it("refuses a document from a newer build", async () => {
    await database.projects.put({
      id: CURRENT_PROJECT_ID,
      version: 99,
      updatedAt: 0,
      project: projectWithLivingRoom(),
    });

    await expect(loadProject(database)).resolves.toEqual({
      status: "unreadable",
      reason: "from-a-newer-version",
    });
  });
});

describe("clearProject", () => {
  it("returns storage to a first visit", async () => {
    await saveProject(projectWithLivingRoom(), 1, database);
    await clearProject(database);

    await expect(loadProject(database)).resolves.toEqual({ status: "empty" });
  });
});
