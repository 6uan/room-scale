/**
 * Loading and saving projects.
 *
 * The only place that turns a stored row into a `Project` and back. Everything
 * above this works with the domain type and never sees a version number.
 *
 * Several projects sit side by side, each under its own id, and one of them is
 * open. Which one is a fact about the collection, so it is kept in the
 * settings table rather than on any project.
 */

import type { Project } from "@/domain/project";
import {
  CURRENT_PROJECT_ID,
  OPEN_PROJECT_KEY,
  QUARANTINE_ID,
  sharedDatabase,
  type RoomScaleDatabase,
} from "./project-database";
import {
  readStoredProject,
  toStoredProject,
  type ReadFailure,
} from "./project-schema";

export type LoadResult =
  /** Nothing saved yet — a first visit. */
  | { readonly status: "empty"; readonly id: string }
  | {
      readonly status: "loaded";
      readonly id: string;
      readonly project: Project;
      /** When the row was written, to tell a later write from another tab. */
      readonly updatedAt: number;
    }
  /** Something is there but could not be read. It has been kept, not deleted. */
  | {
      readonly status: "unreadable";
      readonly id: string;
      readonly reason: ReadFailure;
    };

/** Enough of a project to list it without reading all of it into memory. */
export type ProjectSummary = {
  readonly id: string;
  readonly name: string;
  readonly updatedAt: number;
};

/** The project that was open last time, or the only one there ever was. */
export async function openProjectId(
  database: RoomScaleDatabase = sharedDatabase(),
): Promise<string> {
  const row = await database.settings.get(OPEN_PROJECT_KEY);
  return row?.projectId ?? CURRENT_PROJECT_ID;
}

/** Marks which project to open next time. */
export async function setOpenProjectId(
  id: string,
  database: RoomScaleDatabase = sharedDatabase(),
): Promise<void> {
  await database.settings.put({ id: OPEN_PROJECT_KEY, projectId: id });
}

/** Loads the open project, or the one asked for. */
export async function loadProject(
  database: RoomScaleDatabase = sharedDatabase(),
  id?: string,
): Promise<LoadResult> {
  const projectId = id ?? (await openProjectId(database));
  const row = await database.projects.get(projectId);
  if (row === undefined) {
    return { status: "empty", id: projectId };
  }

  const result = readStoredProject(row);
  if (result.ok) {
    return {
      status: "loaded",
      id: projectId,
      project: result.project,
      updatedAt: row.updatedAt,
    };
  }

  // Copy it aside before anything the person does can overwrite it. A project
  // we cannot parse is still the only record of an afternoon's measuring.
  await database.projects.put({ ...row, id: QUARANTINE_ID });

  return { status: "unreadable", id: projectId, reason: result.reason };
}

export async function saveProject(
  project: Project,
  id: string = CURRENT_PROJECT_ID,
  updatedAt: number = Date.now(),
  database: RoomScaleDatabase = sharedDatabase(),
): Promise<void> {
  await database.projects.put(toStoredProject(id, project, updatedAt));
}

export type SaveOutcome =
  | { readonly saved: true; readonly updatedAt: number }
  /** Somebody else — another tab — wrote this project after we read it. */
  | { readonly saved: false; readonly updatedAt: number };

/**
 * Saves, unless the row has been written since `basedOnUpdatedAt`.
 *
 * Two tabs on one project each hold their own copy, and the one that saves
 * last would silently win — a tab opened before a room was drawn, nudged
 * once, erased the room. Checked and written in one transaction, so the
 * check cannot go stale between the two.
 */
export async function saveProjectUnlessNewer(
  project: Project,
  id: string,
  basedOnUpdatedAt: number,
  updatedAt: number = Date.now(),
  database: RoomScaleDatabase = sharedDatabase(),
): Promise<SaveOutcome> {
  return database.transaction("rw", database.projects, async () => {
    const row = await database.projects.get(id);
    if (row !== undefined && row.updatedAt > basedOnUpdatedAt) {
      return { saved: false, updatedAt: row.updatedAt };
    }
    await database.projects.put(toStoredProject(id, project, updatedAt));
    return { saved: true, updatedAt };
  });
}

/**
 * Every project that can be opened, most recently touched first.
 *
 * The quarantined copy is not a project, and a row that does not read is not
 * offered: there is nothing to show for it but a failure.
 */
export async function listProjects(
  database: RoomScaleDatabase = sharedDatabase(),
): Promise<readonly ProjectSummary[]> {
  const rows = await database.projects.toArray();
  return rows
    .filter((row) => row.id !== QUARANTINE_ID)
    .flatMap((row) => {
      const result = readStoredProject(row);
      return result.ok
        ? [{ id: row.id, name: result.project.name, updatedAt: row.updatedAt }]
        : [];
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteProject(
  id: string,
  database: RoomScaleDatabase = sharedDatabase(),
): Promise<void> {
  await database.projects.delete(id);
}

/** Forgets everything stored. Used by tests. */
export async function clearProject(
  database: RoomScaleDatabase = sharedDatabase(),
): Promise<void> {
  await database.projects.clear();
  await database.settings.clear();
}
