/**
 * What is selected in the workspace.
 *
 * One idea covers rooms, openings, furniture, and products, because the panel on
 * the right shows whatever is selected and has to be told which kind of thing
 * that is. Selection is a fact about this session, never about the project, so
 * it is held in the workspace and never saved.
 */

export type Selection =
  | { readonly kind: "room"; readonly id: string }
  | {
      readonly kind: "room-part";
      readonly roomId: string;
      readonly id: string;
    }
  | {
      readonly kind: "opening";
      readonly roomId: string;
      readonly id: string;
    }
  /** A group of sections, picked up as one thing. */
  | {
      readonly kind: "section-group";
      readonly roomId: string;
      readonly id: string;
    }
  | { readonly kind: "instance"; readonly id: string }
  /** Several things at once, to be moved or removed together. Always 2+. */
  | {
      readonly kind: "group";
      readonly instanceIds: readonly string[];
      readonly roomIds: readonly string[];
    }
  | { readonly kind: "product"; readonly id: string }
  /** A product being entered that does not exist yet. */
  | { readonly kind: "new-product" }
  /** The plan image behind the grid. */
  | { readonly kind: "underlay" }
  | null;

/** The selected pieces, on their own or as part of a group. */
export function selectedInstanceIds(selection: Selection): readonly string[] {
  return selection?.kind === "instance"
    ? [selection.id]
    : selection?.kind === "group"
      ? selection.instanceIds
      : [];
}

/** The rooms in a group. A room selected on its own is not a group. */
export function groupedRoomIds(selection: Selection): readonly string[] {
  return selection?.kind === "group" ? selection.roomIds : [];
}

/**
 * None, one thing, or a group, as the selection type spells each.
 *
 * One piece or one room on its own is that thing's own selection, so its
 * panel opens rather than a group of one.
 */
export function groupSelection(
  instanceIds: readonly string[],
  roomIds: readonly string[],
): Selection {
  const [firstInstance] = instanceIds;
  const [firstRoom] = roomIds;
  if (instanceIds.length + roomIds.length === 0) {
    return null;
  }
  if (
    instanceIds.length === 1 &&
    firstInstance !== undefined &&
    roomIds.length === 0
  ) {
    return { kind: "instance", id: firstInstance };
  }
  if (
    roomIds.length === 1 &&
    firstRoom !== undefined &&
    instanceIds.length === 0
  ) {
    return { kind: "room", id: firstRoom };
  }
  return { kind: "group", instanceIds, roomIds };
}

export function isSelected(
  selection: Selection,
  kind: NonNullable<Selection>["kind"],
  id: string,
): boolean {
  if (selection?.kind === "group") {
    return kind === "instance"
      ? selection.instanceIds.includes(id)
      : kind === "room"
        ? selection.roomIds.includes(id)
        : false;
  }
  return (
    selection !== null &&
    selection.kind === kind &&
    "id" in selection &&
    selection.id === id
  );
}
