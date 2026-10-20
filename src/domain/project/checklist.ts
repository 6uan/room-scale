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
  isShown,
  placedFurniture,
  type FurnitureInstance,
  type FurnitureProduct,
} from "@/domain/furniture";
import type { Floor, Room } from "@/domain/room";
import { sumCents, type Cents } from "@/domain/units";
import { roomOfPiece } from "@/domain/validation";

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
  /** What is already owned — money out of the door. */
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
  // A piece set aside is not being bought: hidden means off the bill.
  const shown = instances.filter(isShown);
  const unique = dedupeById(products);
  const counted = unique.map((product) => ({
    product,
    quantity: countPlaced(shown, product.id),
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

/** Whether a line's money has already gone. */
function isCommitted(line: ChecklistLine): boolean {
  return line.product.purchaseStatus === "owned";
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

export type RoomChecklist = {
  /** Null for pieces standing on no room's floor. */
  readonly room: Room | null;
  readonly checklist: Checklist;
};

/**
 * The same list, dealt out by room.
 *
 * Furniture is bought for a home, but it is carried into a room, and a list
 * that reads "two aquariums" without saying which room each is for is a list
 * that has to be checked against the plan. Rooms come in floor order; what
 * stands outside every room comes last, and a room with nothing in it is left
 * out. Only rooms are grouped — the totals are still taken over the whole.
 */
export function checklistByRoom(
  products: readonly FurnitureProduct[],
  instances: readonly FurnitureInstance[],
  floor: Floor,
): readonly RoomChecklist[] {
  const byRoom = new Map<Room | null, FurnitureInstance[]>();
  for (const placed of placedFurniture(instances.filter(isShown), products)) {
    const room = roomOfPiece(floor, placed);
    byRoom.set(room, [...(byRoom.get(room) ?? []), placed.instance]);
  }

  return [...floor.rooms, null].flatMap((room) => {
    const inRoom = byRoom.get(room);
    return inRoom === undefined
      ? []
      : [{ room, checklist: buildChecklist(products, inRoom) }];
  });
}
