/**
 * Loading and saving the project.
 *
 * The only place that turns a stored row into a `Project` and back. Everything
 * above this works with the domain type and never sees a version number.
 */

import type { Project } from "@/domain/project";
import {
  CURRENT_PROJECT_ID,
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
  | { readonly status: "empty" }
  | { readonly status: "loaded"; readonly project: Project }
  /** Something is there but could not be read. It has been kept, not deleted. */
  | { readonly status: "unreadable"; readonly reason: ReadFailure };

export async function loadProject(
  database: RoomScaleDatabase = sharedDatabase(),
): Promise<LoadResult> {
  const row = await database.projects.get(CURRENT_PROJECT_ID);
  if (row === undefined) {
    return { status: "empty" };
  }

  const result = readStoredProject(row);
  if (result.ok) {
    return { status: "loaded", project: result.project };
  }

  // Copy it aside before anything the person does can overwrite it. A project
  // we cannot parse is still the only record of an afternoon's measuring.
  await database.projects.put({ ...row, id: QUARANTINE_ID });

  return { status: "unreadable", reason: result.reason };
}

export async function saveProject(
  project: Project,
  updatedAt: number = Date.now(),
  database: RoomScaleDatabase = sharedDatabase(),
): Promise<void> {
  await database.projects.put(
    toStoredProject(CURRENT_PROJECT_ID, project, updatedAt),
  );
}

/** Used by tests and, later, by "start over" in the interface. */
export async function clearProject(
  database: RoomScaleDatabase = sharedDatabase(),
): Promise<void> {
  await database.projects.delete(CURRENT_PROJECT_ID);
}
