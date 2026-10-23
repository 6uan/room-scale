/**
 * The IndexedDB database itself.
 *
 * One table holding one record per project, and a second holding the facts
 * that are about this browser rather than any project in it: which one is
 * open, and how imperial lengths are read. Layouts, which are several arrangements of the same apartment, live
 * inside the document rather than as separate rows.
 *
 * Dexie's `version(2)` below is the shape of the tables. It is a different
 * number from `SCHEMA_VERSION` in `project-schema.ts`, which is the shape of
 * the document inside a row. Adding a field to a project does not change the
 * table, so these two move independently.
 */

import Dexie, { type EntityTable } from "dexie";
import type { ImperialLengths } from "@/domain/units";

/** Stored loosely on purpose: what comes back out is parsed, not trusted. */
export type ProjectRow = {
  id: string;
  version: number;
  updatedAt: number;
  project: unknown;
};

/**
 * The settings table: facts about this browser rather than any project — which
 * project to open next time, and how the reader likes imperial lengths read.
 */
export type SettingsRow = {
  id:
    | typeof OPEN_PROJECT_KEY
    | typeof IMPERIAL_LENGTHS_KEY
    | typeof PRODUCT_LENGTHS_KEY
    | typeof UNDERLAY_OPACITY_KEY;
  /** On the open-project row. */
  projectId?: string;
  /** On the imperial-lengths and product-lengths rows. */
  imperialLengths?: ImperialLengths;
  /** On the underlay-opacity row: how much of the plan image shows, 0 to 1. */
  underlayOpacity?: number;
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

export const IMPERIAL_LENGTHS_KEY = "imperial-lengths";

/** How a product's own size is read in imperial, kept apart from the apartment's. */
export const PRODUCT_LENGTHS_KEY = "product-lengths";

/** How strongly the plan image behind the grid is drawn, as this reader likes it. */
export const UNDERLAY_OPACITY_KEY = "underlay-opacity";

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
