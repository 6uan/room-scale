/**
 * Groups: several placed pieces that are picked up together.
 *
 * A bed with its two nightstands, a dining table with its chairs, a sofa and
 * the rug under it. Moving them one at a time is how the rug ends up an inch
 * off the sofa, so a group is selected as one and moved as one — and listed
 * as one, under a name, so a room with thirty pieces in it reads as six
 * things.
 *
 * A group is stored with the layout, because it is about this arrangement:
 * the same chairs may belong to a different table in another one. It holds
 * instance ids only — nothing about where the pieces are, which the pieces
 * know themselves. A piece belongs to at most one group, and a group with
 * nothing left in it is gone.
 */

import type { FurnitureInstance } from "@/domain/furniture";

export type PieceGroup = {
  readonly id: string;
  /** "Group 1", or whatever it was renamed to: "Bed and nightstands". */
  readonly name: string;
  /** In the order the pieces stand in the list. Never empty. */
  readonly instanceIds: readonly string[];
};

/** The group one piece is in, if any. */
export function groupOf(
  groups: readonly PieceGroup[],
  instanceId: string,
): PieceGroup | undefined {
  return groups.find((group) => group.instanceIds.includes(instanceId));
}

/**
 * A new group of these pieces, taking each out of whatever group it was in.
 * A piece in one group cannot be in another, and a group emptied by that is
 * dropped rather than left as a name with nothing under it.
 */
export function withGroup(
  groups: readonly PieceGroup[],
  id: string,
  instanceIds: readonly string[],
): readonly PieceGroup[] {
  const taken = new Set(instanceIds);
  const rest = groups
    .map((group) => ({
      ...group,
      instanceIds: group.instanceIds.filter((one) => !taken.has(one)),
    }))
    .filter((group) => group.instanceIds.length > 0);
  return [...rest, { id, name: nextGroupName(groups), instanceIds }];
}

export function withoutGroup(
  groups: readonly PieceGroup[],
  id: string,
): readonly PieceGroup[] {
  return groups.filter((group) => group.id !== id);
}

export function withGroupName(
  groups: readonly PieceGroup[],
  id: string,
  name: string,
): readonly PieceGroup[] {
  return groups.map((group) => (group.id === id ? { ...group, name } : group));
}

/**
 * The groups with pieces that are no longer placed taken out of them, and
 * any group that leaves empty dropped. Run whenever the instances change, so
 * a group can never name a piece that is not there.
 */
export function groupsOf(
  groups: readonly PieceGroup[],
  instances: readonly FurnitureInstance[],
): readonly PieceGroup[] {
  const placed = new Set(instances.map((instance) => instance.id));
  const pruned = groups
    .map((group) => ({
      ...group,
      instanceIds: group.instanceIds.filter((one) => placed.has(one)),
    }))
    .filter((group) => group.instanceIds.length > 0);
  return pruned.length === groups.length &&
    pruned.every(
      (group, index) =>
        group.instanceIds.length === groups[index]?.instanceIds.length,
    )
    ? groups
    : pruned;
}

/** "Group 2", then "Group 3": counted, and moved past any number already taken. */
export function nextGroupName(existing: readonly PieceGroup[]): string {
  const taken = new Set(existing.map((group) => group.name));
  let counter = existing.length + 1;
  while (taken.has(`Group ${counter}`)) {
    counter += 1;
  }
  return `Group ${counter}`;
}
