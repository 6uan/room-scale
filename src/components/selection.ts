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
      readonly kind: "opening";
      readonly roomId: string;
      readonly id: string;
    }
  | { readonly kind: "instance"; readonly id: string }
  | { readonly kind: "product"; readonly id: string }
  /** A product being entered that does not exist yet. */
  | { readonly kind: "new-product" }
  | null;

/** The selected instance, for the canvas, which only knows about furniture. */
export function selectedInstanceId(selection: Selection): string | null {
  return selection?.kind === "instance" ? selection.id : null;
}

export function isSelected(
  selection: Selection,
  kind: NonNullable<Selection>["kind"],
  id: string,
): boolean {
  return (
    selection !== null &&
    selection.kind === kind &&
    "id" in selection &&
    selection.id === id
  );
}
