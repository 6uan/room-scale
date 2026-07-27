/**
 * The shopping list, derived from the room.
 *
 * A checklist line is a product and the number of copies of it standing in the
 * room. Nothing here is stored: quantities come from counting instances and
 * totals come from adding lines up, every time they are asked for. A stored
 * total is a total that can disagree with the furniture, and the whole point of
 * this list is that it cannot.
 *
 * Products are deduplicated by id before anything is counted, so a catalogue
 * that somehow holds the same product twice still produces one line and one
 * price rather than double-charging for it.
 */

import {
  countPlaced,
  type FurnitureInstance,
  type FurnitureProduct,
} from "@/domain/furniture";
import { sumCents, type Cents } from "@/domain/units";

export type ChecklistLine = {
  readonly product: FurnitureProduct;
  /** How many copies are placed. Never typed in; always counted. */
  readonly quantity: number;
  /** The price of this product times the number placed. */
  readonly lineCents: Cents;
};

export type Checklist = {
  /** One line per product with something in the room, in catalogue order. */
  readonly lines: readonly ChecklistLine[];
  /** What everything in the room costs. */
  readonly totalCents: Cents;
  /** What has been ordered or is already owned — money out of the door. */
  readonly committedCents: Cents;
  /** What is still only being considered: the bill if you buy the rest. */
  readonly remainingCents: Cents;
  /**
   * Catalogue products with nothing placed. They cost nothing yet, and are
   * kept so that a product cannot quietly vanish by not being in the room.
   */
  readonly unplaced: readonly FurnitureProduct[];
};

export const EMPTY_CHECKLIST: Checklist = {
  lines: [],
  totalCents: 0,
  committedCents: 0,
  remainingCents: 0,
  unplaced: [],
};

export function buildChecklist(
  products: readonly FurnitureProduct[],
  instances: readonly FurnitureInstance[],
): Checklist {
  const unique = dedupeById(products);
  const counted = unique.map((product) => ({
    product,
    quantity: countPlaced(instances, product.id),
  }));

  const lines: readonly ChecklistLine[] = counted
    .filter(({ quantity }) => quantity > 0)
    .map(({ product, quantity }) => ({
      product,
      quantity,
      lineCents: product.priceCents * quantity,
    }));

  const totalCents = sumCents(lines.map((line) => line.lineCents));
  const committedCents = sumCents(
    lines.filter(isCommitted).map((line) => line.lineCents),
  );

  return {
    lines,
    totalCents,
    committedCents,
    remainingCents: totalCents - committedCents,
    unplaced: counted
      .filter(({ quantity }) => quantity === 0)
      .map(({ product }) => product),
  };
}

/**
 * Whether a line's money has already gone.
 *
 * Ordered counts alongside owned: retailers take payment when the order is
 * placed, so a sofa on a lorry is spent money that simply has not arrived yet.
 * Only what is still being considered is money you could decide not to spend.
 */
function isCommitted(line: ChecklistLine): boolean {
  return (
    line.product.purchaseStatus === "ordered" ||
    line.product.purchaseStatus === "owned"
  );
}

/** Keeps the first of each id, so catalogue order survives. */
function dedupeById(
  products: readonly FurnitureProduct[],
): readonly FurnitureProduct[] {
  const seen = new Set<string>();
  return products.filter((product) => {
    if (seen.has(product.id)) {
      return false;
    }
    seen.add(product.id);
    return true;
  });
}
