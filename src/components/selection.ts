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
  | { readonly kind: "instance"; readonly id: string }
  /** Several pieces at once, to be moved or removed together. Always 2+. */
  | { readonly kind: "instances"; readonly ids: readonly string[] }
  | { readonly kind: "product"; readonly id: string }
  /** A product being entered that does not exist yet. */
  | { readonly kind: "new-product" }
  | null;

/** The selected pieces, for the canvas, which only knows about furniture. */
export function selectedInstanceIds(selection: Selection): readonly string[] {
  return selection?.kind === "instance"
    ? [selection.id]
    : selection?.kind === "instances"
      ? selection.ids
      : [];
}

/** One, several, or none, as the selection type spells each. */
export function instanceSelection(ids: readonly string[]): Selection {
  const [first] = ids;
  return first === undefined
    ? null
    : ids.length === 1
      ? { kind: "instance", id: first }
      : { kind: "instances", ids };
}

export function isSelected(
  selection: Selection,
  kind: NonNullable<Selection>["kind"],
  id: string,
): boolean {
  if (kind === "instance" && selection?.kind === "instances") {
    return selection.ids.includes(id);
  }
  return (
    selection !== null &&
    selection.kind === kind &&
    "id" in selection &&
    selection.id === id
  );
}
