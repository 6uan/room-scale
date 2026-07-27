/**
 * A project: one room, the furniture being considered for it, and how the
 * person planning it prefers to read measurements.
 *
 * This is the whole of what gets saved. Keeping it as one plain, serializable
 * value means persistence has a single thing to write and export has a single
 * thing to hand over, rather than each feature inventing its own storage.
 *
 * Layouts — several arrangements of the same room — arrive later and will hang
 * off this, which is why the shape is a document rather than loose fields.
 */

import type { FurnitureProduct } from "@/domain/furniture";
import { DEFAULT_ROOM, type Room } from "@/domain/room";
import type { DisplayUnit } from "@/domain/units";

export type Project = {
  readonly room: Room;
  readonly products: readonly FurnitureProduct[];
  /** A reading preference, not a measurement. Everything stored is meters. */
  readonly displayUnit: DisplayUnit;
};

/** What a new project starts as, before anything has been measured. */
export function createProject(): Project {
  return {
    room: DEFAULT_ROOM,
    products: [],
    displayUnit: "imperial",
  };
}

export function withRoom(project: Project, room: Room): Project {
  return { ...project, room };
}

export function withProducts(
  project: Project,
  products: readonly FurnitureProduct[],
): Project {
  return { ...project, products };
}

export function withDisplayUnit(
  project: Project,
  displayUnit: DisplayUnit,
): Project {
  return { ...project, displayUnit };
}

/**
 * An id no existing item is using.
 *
 * Ids outlive the page now, so they cannot come from a counter that starts at
 * one on every reload — that would hand a second opening the same id as one
 * loaded from storage.
 */
export function nextId(prefix: string, usedIds: readonly string[]): string {
  const used = new Set(usedIds);
  let number = usedIds.length + 1;
  while (used.has(`${prefix}-${number}`)) {
    number += 1;
  }
  return `${prefix}-${number}`;
}
