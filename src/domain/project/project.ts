/**
 * A project: one apartment, the furniture being considered for it, and how the
 * person planning it prefers to read measurements.
 *
 * This is the whole of what gets saved. Keeping it as one plain, serializable
 * value means persistence has a single thing to write and export has a single
 * thing to hand over, rather than each feature inventing its own storage.
 *
 * Furniture hangs off a layout rather than off the project, because there is
 * more than one way to arrange the same apartment and the point is to keep them
 * both. The apartment and the catalogue are shared; only the placements differ.
 */

import type { FurnitureInstance, FurnitureProduct } from "@/domain/furniture";
import { DEFAULT_FLOOR, type Floor } from "@/domain/room";
import type { DisplayUnit } from "@/domain/units";
import {
  EMPTY_LAYOUT,
  createLayout,
  withLayoutInstances,
  type Layout,
} from "./layout";
import type { PlanUnderlay } from "./underlay";

export type Project = {
  readonly floor: Floor;
  /** The listing's plan under the canvas, or null once measured for real. */
  readonly underlay: PlanUnderlay | null;
  readonly products: readonly FurnitureProduct[];
  /** Arrangements of those products on that floor. Always at least one. */
  readonly layouts: readonly Layout[];
  /** The one being worked on. Saved, so a project opens where it was left. */
  readonly activeLayoutId: string;
  /** A reading preference, not a measurement. Everything stored is meters. */
  readonly displayUnit: DisplayUnit;
};

/** What a new project starts as, before anything has been measured. */
export function createProject(): Project {
  const first = createLayout(EMPTY_LAYOUT.id, EMPTY_LAYOUT.name);
  return {
    floor: DEFAULT_FLOOR,
    underlay: null,
    products: [],
    layouts: [first],
    activeLayoutId: first.id,
    displayUnit: "imperial",
  };
}

export function withUnderlay(
  project: Project,
  underlay: PlanUnderlay | null,
): Project {
  return { ...project, underlay };
}

/**
 * The layout being worked on.
 *
 * Total by construction: a project holds at least one layout, and an active id
 * pointing at nothing falls back to the first rather than to nothing at all.
 */
export function activeLayout(project: Project): Layout {
  return (
    project.layouts.find((layout) => layout.id === project.activeLayoutId) ??
    project.layouts[0] ??
    EMPTY_LAYOUT
  );
}

/** What is standing in the apartment right now. */
export function activeInstances(
  project: Project,
): readonly FurnitureInstance[] {
  return activeLayout(project).instances;
}

export function withLayouts(
  project: Project,
  layouts: readonly Layout[],
): Project {
  return { ...project, layouts };
}

export function withActiveLayout(project: Project, id: string): Project {
  return { ...project, activeLayoutId: id };
}

/** Replaces one layout by id, leaving the order alone. */
export function withLayout(project: Project, next: Layout): Project {
  return {
    ...project,
    layouts: project.layouts.map((layout) =>
      layout.id === next.id ? next : layout,
    ),
  };
}

export function withFloor(project: Project, floor: Floor): Project {
  return { ...project, floor };
}

export function withProducts(
  project: Project,
  products: readonly FurnitureProduct[],
): Project {
  return { ...project, products };
}

/**
 * Replaces what is placed, in the layout being worked on.
 *
 * Everything that moves furniture goes through here, so nothing outside this
 * module has to know that arrangements exist — moving a sofa is moving a sofa
 * whether or not there is a second arrangement to compare it against.
 */
export function withInstances(
  project: Project,
  instances: readonly FurnitureInstance[],
): Project {
  return withLayout(
    project,
    withLayoutInstances(activeLayout(project), instances),
  );
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
