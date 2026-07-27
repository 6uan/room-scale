/**
 * The IndexedDB database itself.
 *
 * One table holding one record per project. There is only ever one project for
 * now — layouts, which are several arrangements of the same room, live inside
 * the document rather than as separate rows.
 *
 * Dexie's `version(1)` below is the shape of the tables. It is a different
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

export type RoomScaleDatabase = Dexie & {
  projects: EntityTable<ProjectRow, "id">;
};

export const DATABASE_NAME = "roomscale";

/** The single project, until multiple projects are a thing anyone asked for. */
export const CURRENT_PROJECT_ID = "current";

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
  return database;
}

let shared: RoomScaleDatabase | null = null;

/** The application's database. Opened once, lazily, never on the server. */
export function sharedDatabase(): RoomScaleDatabase {
  shared ??= createDatabase();
  return shared;
}
