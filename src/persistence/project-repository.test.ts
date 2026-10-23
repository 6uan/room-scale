import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renameProject, withDisplayUnit } from "@/domain/project";
import { withRoom, withRoomLength } from "@/domain/room";
import {
  CURRENT_PROJECT_ID,
  QUARANTINE_ID,
  createDatabase,
  type RoomScaleDatabase,
} from "./project-database";
import {
  clearProject,
  deleteProject,
  listProjects,
  loadImperialLengths,
  loadProductLengths,
  loadProject,
  openProjectId,
  saveImperialLengths,
  saveProductLengths,
  saveProject,
  saveProjectUnlessNewer,
  setOpenProjectId,
} from "./project-repository";
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
    await expect(loadProject(database)).resolves.toEqual({
      status: "empty",
      id: CURRENT_PROJECT_ID,
    });
  });

  it("reads back what was saved", async () => {
    const project = withDisplayUnit(projectWithLivingRoom(), "metric");
    await saveProject(project, CURRENT_PROJECT_ID, 1_700_000_000_000, database);

    await expect(loadProject(database)).resolves.toEqual({
      status: "loaded",
      id: CURRENT_PROJECT_ID,
      project,
      updatedAt: 1_700_000_000_000,
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
    await saveProject(edited, CURRENT_PROJECT_ID, 1_700_000_000_000, database);

    const result = await loadProject(database);
    expect(
      result.status === "loaded" &&
        result.project.floor.rooms[0]?.parts[0]?.widthMeters,
    ).toBe(5.5);
  });

  it("keeps the newest save rather than accumulating rows", async () => {
    await saveProject(projectWithLivingRoom(), CURRENT_PROJECT_ID, 1, database);
    await saveProject(
      withDisplayUnit(projectWithLivingRoom(), "metric"),
      CURRENT_PROJECT_ID,
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
      id: CURRENT_PROJECT_ID,
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
    await saveProject(projectWithLivingRoom(), CURRENT_PROJECT_ID, 1, database);
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
      id: CURRENT_PROJECT_ID,
      reason: "from-a-newer-version",
    });
  });
});

describe("several projects", () => {
  it("opens the first project until told otherwise", async () => {
    await expect(openProjectId(database)).resolves.toBe(CURRENT_PROJECT_ID);
  });

  it("loads whichever project was last opened", async () => {
    await saveProject(projectWithLivingRoom(), CURRENT_PROJECT_ID, 1, database);
    const second = renameProject(projectWithLivingRoom(), "Project 2");
    await saveProject(second, "project-2", 2, database);
    await setOpenProjectId("project-2", database);

    await expect(loadProject(database)).resolves.toEqual({
      status: "loaded",
      id: "project-2",
      project: second,
      updatedAt: 2,
    });
  });

  it("lists every readable project, most recently saved first", async () => {
    await saveProject(projectWithLivingRoom(), CURRENT_PROJECT_ID, 1, database);
    await saveProject(
      renameProject(projectWithLivingRoom(), "Project 2"),
      "project-2",
      2,
      database,
    );
    await database.projects.put({
      id: QUARANTINE_ID,
      version: 1,
      updatedAt: 3,
      project: { room: "not a room" },
    });

    await expect(listProjects(database)).resolves.toEqual([
      { id: "project-2", name: "Project 2", updatedAt: 2 },
      { id: CURRENT_PROJECT_ID, name: "Project 1", updatedAt: 1 },
    ]);
  });

  it("deletes one project and leaves the others", async () => {
    await saveProject(projectWithLivingRoom(), CURRENT_PROJECT_ID, 1, database);
    await saveProject(projectWithLivingRoom(), "project-2", 2, database);

    await deleteProject("project-2", database);

    await expect(listProjects(database)).resolves.toHaveLength(1);
  });
});

describe("saveProjectUnlessNewer", () => {
  it("writes when nothing newer has been stored since the read", async () => {
    await saveProject(projectWithLivingRoom(), CURRENT_PROJECT_ID, 1, database);

    const outcome = await saveProjectUnlessNewer(
      withDisplayUnit(projectWithLivingRoom(), "metric"),
      CURRENT_PROJECT_ID,
      1,
      2,
      database,
    );

    expect(outcome).toEqual({ saved: true, updatedAt: 2 });
    const stored = await loadProject(database);
    expect(stored.status === "loaded" && stored.project.displayUnit).toBe(
      "metric",
    );
  });

  it("refuses to write over a row another tab wrote after the read", async () => {
    // Read at 1; another tab wrote at 5; this tab's save is based on 1.
    await saveProject(
      withDisplayUnit(projectWithLivingRoom(), "metric"),
      CURRENT_PROJECT_ID,
      5,
      database,
    );

    const outcome = await saveProjectUnlessNewer(
      projectWithLivingRoom(),
      CURRENT_PROJECT_ID,
      1,
      6,
      database,
    );

    expect(outcome).toEqual({ saved: false, updatedAt: 5 });
    const stored = await loadProject(database);
    expect(stored.status === "loaded" && stored.project.displayUnit).toBe(
      "metric",
    );
  });
});

describe("clearProject", () => {
  it("returns storage to a first visit", async () => {
    await saveProject(projectWithLivingRoom(), CURRENT_PROJECT_ID, 1, database);
    await clearProject(database);

    await expect(loadProject(database)).resolves.toEqual({
      status: "empty",
      id: CURRENT_PROJECT_ID,
    });
  });
});

describe("how imperial lengths are read", () => {
  it("is feet and inches until told otherwise, and remembers being told", async () => {
    expect(await loadImperialLengths(database)).toBe("feet-and-inches");
    await saveImperialLengths("inches", database);
    expect(await loadImperialLengths(database)).toBe("inches");
  });

  it("is kept apart from which project is open", async () => {
    await setOpenProjectId("project-2", database);
    await saveImperialLengths("inches", database);
    expect(await openProjectId(database)).toBe("project-2");
    expect(await loadImperialLengths(database)).toBe("inches");
  });

  it("reads a row it does not recognise as the default", async () => {
    await database.settings.put({
      id: "imperial-lengths",
      imperialLengths: "furlongs" as "inches",
    });
    expect(await loadImperialLengths(database)).toBe("feet-and-inches");
  });
});

describe("how a product's own size is read", () => {
  it("is inches until told otherwise, and apart from the apartment's", async () => {
    expect(await loadProductLengths(database)).toBe("inches");
    await saveProductLengths("feet-and-inches", database);
    await saveImperialLengths("inches", database);
    expect(await loadProductLengths(database)).toBe("feet-and-inches");
    expect(await loadImperialLengths(database)).toBe("inches");
  });
});
