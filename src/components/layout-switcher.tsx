"use client";

import { Switcher } from "@/components/switcher";
import { formatCents, type Cents } from "@/domain/units";
import type { Layout } from "@/domain/project";

export type LayoutSwitcherProps = {
  layouts: readonly Layout[];
  activeId: string;
  /** What each arrangement costs, so switching is a comparison. */
  totalsById: ReadonlyMap<string, Cents>;
  onSwitch: (id: string) => void;
  onRename: (layout: Layout, name: string) => void;
  onDuplicate: (layout: Layout) => void;
  onRemove: (layout: Layout) => void;
  /** Starts one with nothing placed. */
  onCreate: () => void;
};

/**
 * Which arrangement is being worked on, and what each one costs.
 *
 * An arrangement can be copied — a variation starts from what you have and
 * changes one thing — or started with nothing placed, for when the next idea
 * shares no furniture with the last. Both are offered: the copy on the row it
 * copies, the empty one at the bottom.
 */
export function LayoutSwitcher({
  layouts,
  activeId,
  totalsById,
  onSwitch,
  onRename,
  onDuplicate,
  onRemove,
  onCreate,
}: LayoutSwitcherProps) {
  const byId = new Map(layouts.map((layout) => [layout.id, layout]));
  const find = (id: string): Layout | undefined => byId.get(id);

  return (
    <Switcher
      label="Layouts"
      nameLabel="Layout name"
      items={layouts.map((layout) => {
        const total = totalsById.get(layout.id);
        return {
          id: layout.id,
          name: layout.name,
          detail: total === undefined ? undefined : formatCents(total),
        };
      })}
      activeId={activeId}
      onSwitch={onSwitch}
      onRename={(item, name) => {
        const layout = find(item.id);
        if (layout !== undefined) {
          onRename(layout, name);
        }
      }}
      onDuplicate={(item) => {
        const layout = find(item.id);
        if (layout !== undefined) {
          onDuplicate(layout);
        }
      }}
      onRemove={(item) => {
        const layout = find(item.id);
        if (layout !== undefined) {
          onRemove(layout);
        }
      }}
      onCreate={onCreate}
      createLabel="New layout"
    />
  );
}
