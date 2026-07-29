/**
 * A layout: one arrangement of the furniture in the apartment.
 *
 * Trying the sofa against the north wall and then facing the window are two
 * arrangements of the same home and the same catalogue. A layout holds only the
 * placements, because that is the only thing that differs between them.
 *
 * This is what the split in
 * [ADR 0003](../../../docs/adr/0003-separate-products-from-instances.md) was
 * for. Products are shared across every layout — one price, one link, one
 * purchase status — so marking the rug as owned in one arrangement marks it
 * owned in all of them, which is true: you only buy it once. Instances belong
 * to a layout, so moving a sofa in one leaves the other alone.
 *
 * Instance ids are unique within a layout and mean nothing outside it. Two
 * arrangements may each hold an `instance-1`; they are different copies of
 * possibly different products, and nothing ever compares them across layouts.
 */

import type { FurnitureInstance } from "@/domain/furniture";

export type Layout = {
  readonly id: string;
  /** What it is called in the switcher: "Sofa facing the window". */
  readonly name: string;
  readonly instances: readonly FurnitureInstance[];
};

/**
 * The layout a project falls back to when its active one has gone.
 *
 * A stored project always holds at least one layout — the schema refuses one
 * with none — so this exists to keep the accessors total rather than to be
 * used.
 */
export const EMPTY_LAYOUT: Layout = {
  id: "layout-1",
  name: "First try",
  instances: [],
};

export function createLayout(id: string, name: string): Layout {
  return { id, name, instances: [] };
}

/**
 * A copy under a new name, holding the same furniture in the same places.
 *
 * Duplicating is how a variation starts: keep what you have, change one thing,
 * and still have the original to go back to. The instances are copied as they
 * are, ids included, because an id means nothing outside the layout holding it.
 */
export function duplicateLayout(
  layout: Layout,
  id: string,
  name: string,
): Layout {
  return { id, name, instances: [...layout.instances] };
}

export function renameLayout(layout: Layout, name: string): Layout {
  return { ...layout, name };
}

export function withLayoutInstances(
  layout: Layout,
  instances: readonly FurnitureInstance[],
): Layout {
  return { ...layout, instances };
}

/**
 * A name for a new layout that is not already taken.
 *
 * "Second try", then "Third try", then numbers — a list of arrangements called
 * "Copy of copy of" is a list nobody can read.
 */
export function nextLayoutName(existing: readonly Layout[]): string {
  const taken = new Set(existing.map((layout) => layout.name));
  const ordinals = ["Second try", "Third try", "Fourth try", "Fifth try"];

  for (const name of ordinals) {
    if (!taken.has(name)) {
      return name;
    }
  }

  let counter = existing.length + 1;
  while (taken.has(`Layout ${counter}`)) {
    counter += 1;
  }
  return `Layout ${counter}`;
}
