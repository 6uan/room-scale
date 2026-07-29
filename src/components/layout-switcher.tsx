"use client";

import { formatCents, type Cents } from "@/domain/units";
import type { Layout } from "@/domain/project";

export type LayoutSwitcherProps = {
  layouts: readonly Layout[];
  activeId: string;
  /** What each arrangement costs, so switching is a comparison. */
  totalsById: ReadonlyMap<string, Cents>;
  onSwitch: (id: string) => void;
  onRename: (layout: Layout, name: string) => void;
  onDuplicate: () => void;
  onRemove: (layout: Layout) => void;
};

/**
 * Which arrangement is being worked on, and what each one costs.
 *
 * The price sits in the switcher rather than only on the overview, because the
 * question a second layout exists to answer is "which of these should I buy",
 * and an answer you have to navigate to is one you will not check.
 *
 * Duplicating is the verb that matters. A variation starts from what you have
 * and changes one thing; starting from an empty floor is not a comparison.
 */
export function LayoutSwitcher({
  layouts,
  activeId,
  totalsById,
  onSwitch,
  onRename,
  onDuplicate,
  onRemove,
}: LayoutSwitcherProps) {
  const active = layouts.find((layout) => layout.id === activeId) ?? layouts[0];

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="layout" className="sr-only">
        Layout
      </label>
      <select
        id="layout"
        value={active?.id ?? ""}
        onChange={(event) => onSwitch(event.target.value)}
        className="rounded-md border border-black/15 bg-transparent px-2 py-1 text-xs dark:border-white/20"
      >
        {layouts.map((layout) => {
          const total = totalsById.get(layout.id);
          return (
            <option key={layout.id} value={layout.id}>
              {layout.name}
              {total === undefined ? "" : ` — ${formatCents(total)}`}
            </option>
          );
        })}
      </select>

      {active === undefined ? null : (
        <input
          type="text"
          aria-label="Layout name"
          value={active.name}
          onChange={(event) => onRename(active, event.target.value)}
          className="w-40 rounded-md border border-black/15 bg-transparent px-2 py-1 text-xs dark:border-white/20"
        />
      )}

      <button
        type="button"
        onClick={onDuplicate}
        className="rounded-md border border-black/15 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
      >
        Duplicate
      </button>

      {/* The last arrangement cannot go: a project always has one. */}
      {active === undefined || layouts.length < 2 ? null : (
        <button
          type="button"
          onClick={() => onRemove(active)}
          aria-label={`Delete ${active.name}`}
          className="rounded-md px-2 py-1 text-xs opacity-60 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
        >
          Delete
        </button>
      )}
    </div>
  );
}
