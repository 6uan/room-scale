/**
 * The IndexedDB database itself.
 *
 * One table holding one record per project, and a second holding the one fact
 * that is about the collection rather than any project in it: which one is
 * open. Layouts, which are several arrangements of the same apartment, live
 * inside the document rather than as separate rows.
 *
 * Dexie's `version(2)` below is the shape of the tables. It is a different
 * number from `SCHEMA_VERSION` in `project-schema.ts`, which is the shape of
 * the document inside a row. Adding a field to a project does not change the
 * table, so these two move independently.
 */

import Dexie, { type EntityTable } from "dexie";

/** Stored loosely on purpose: what comes back out is parsed, not trusted. */
export type ProjectRow = {
  id: string;
  version: number;
  updatedAt: number;
  project: unknown;
};

/** One row, naming the project to open next time. */
export type SettingsRow = {
  id: typeof OPEN_PROJECT_KEY;
  projectId: string;
};

export type RoomScaleDatabase = Dexie & {
  projects: EntityTable<ProjectRow, "id">;
  settings: EntityTable<SettingsRow, "id">;
};

export const DATABASE_NAME = "roomscale";

/**
 * The project every install started with, back when there was only one. It
 * is the one opened when nothing says otherwise, so an existing install comes
 * back to the apartment it left.
 */
export const CURRENT_PROJECT_ID = "current";

export const OPEN_PROJECT_KEY = "open-project";

/**
 * Where a record that could not be read is put before anything overwrites it.
 * One slot, so a repeated failure cannot fill the disk.
 */
export const QUARANTINE_ID = "unreadable-backup";

export function createDatabase(
  name: string = DATABASE_NAME,
): RoomScaleDatabase {
  const database = new Dexie(name) as RoomScaleDatabase;
  database.version(1).stores({ projects: "id" });
  // Version 2 added the settings table. The projects table is untouched, so
  // an existing install upgrades without copying anything.
  database.version(2).stores({ projects: "id", settings: "id" });
  return database;
}

let shared: RoomScaleDatabase | null = null;

/** The application's database. Opened once, lazily, never on the server. */
export function sharedDatabase(): RoomScaleDatabase {
  shared ??= createDatabase();
  return shared;
}
