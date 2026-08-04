"use client";

import { Copy, Trash2 } from "lucide-react";
import { IconButton, LabelledButton } from "@/components/icon-button";
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
    <div className="flex min-w-0 items-center gap-1.5">
      {/* One field, not two: the name you are working under is typed in place,
          and the menu beside it is how you get to another one. */}
      <div className="flex min-w-0 items-center rounded-lg bg-black/[0.05] pr-0.5 dark:bg-white/[0.07]">
        {active === undefined ? null : (
          <input
            type="text"
            aria-label="Layout name"
            value={active.name}
            onChange={(event) => onRename(active, event.target.value)}
            className="w-36 min-w-0 bg-transparent px-2.5 py-1 text-xs font-medium outline-none"
          />
        )}
        <label htmlFor="layout" className="sr-only">
          Layout
        </label>
        <select
          id="layout"
          value={active?.id ?? ""}
          onChange={(event) => onSwitch(event.target.value)}
          className="max-w-32 cursor-pointer truncate bg-transparent py-1 pr-1 text-xs opacity-60 outline-none hover:opacity-100"
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
      </div>

      {/* Words, not a lone glyph: a copy icon says "copy" and says nothing
          about what — and what is being copied here is the whole arrangement,
          which is not a thing anybody expects a clipboard to hold. */}
      <LabelledButton label="Duplicate" icon={Copy} onClick={onDuplicate} />

      {/* The last arrangement cannot go: a project always has one. */}
      {active === undefined || layouts.length < 2 ? null : (
        <IconButton
          label={`Delete ${active.name}`}
          icon={Trash2}
          tone="danger"
          onClick={() => onRemove(active)}
        />
      )}
    </div>
  );
}
