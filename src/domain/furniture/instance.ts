/**
 * A furniture instance: one copy of a product, standing somewhere in the room.
 *
 * An instance holds only what is true of this copy in this spot — where it is
 * and which way it faces. Everything true of the thing itself, including its
 * size and its price, belongs to the product it references
 * (docs/adr/0003-separate-products-from-instances.md). Place a product twice
 * and there is one price and two positions.
 *
 * Position is the center of the footprint on the floor plane, and rotation is
 * about the vertical axis, per the coordinate rules in AGENTS.md.
 */

import {
  orientedRectContains,
  type FloorPoint,
  type OrientedRect,
} from "@/domain/geometry";
import type { Room } from "@/domain/room";
import { normalizeRadians } from "@/domain/units";
import type { FurnitureProduct } from "./product";

export type FurnitureInstance = {
  readonly id: string;
  readonly productId: string;
  /** The center of the footprint, in meters. */
  readonly position: FloorPoint;
  /** Radians about the vertical axis. Zero means the product's own width runs along X. */
  readonly rotationRadians: number;
};

/** An instance joined to the product it references. */
export type PlacedFurniture = {
  readonly instance: FurnitureInstance;
  readonly product: FurnitureProduct;
};

/**
 * Where a newly placed piece lands.
 *
 * The middle of the room, stepped diagonally so a second piece does not sit
 * exactly on top of the first. It is a starting point, not a suggestion —
 * moving things is the next step, and until then this at least leaves each
 * piece visible.
 */
const PLACEMENT_STEP_METERS = 0.35;

export function placementFor(room: Room, alreadyPlaced: number): FloorPoint {
  const offset = alreadyPlaced * PLACEMENT_STEP_METERS;
  return {
    xMeters: clamp(room.widthMeters / 2 + offset, 0, room.widthMeters),
    zMeters: clamp(room.depthMeters / 2 + offset, 0, room.depthMeters),
  };
}

export function createInstance(
  id: string,
  productId: string,
  position: FloorPoint,
): FurnitureInstance {
  return { id, productId, position, rotationRadians: 0 };
}

/**
 * Joins instances to their products, dropping any whose product is missing.
 *
 * Deleting a product that is still placed is refused rather than cascaded, so
 * this should not happen — but stored data can be edited by hand, and half a
 * pair is not something to render.
 */
export function placedFurniture(
  instances: readonly FurnitureInstance[],
  products: readonly FurnitureProduct[],
): readonly PlacedFurniture[] {
  const byId = new Map(products.map((product) => [product.id, product]));

  return instances.flatMap((instance) => {
    const product = byId.get(instance.productId);
    return product === undefined ? [] : [{ instance, product }];
  });
}

/**
 * The rectangle a placed piece occupies on the floor.
 *
 * Position is the center and the product's own width runs along the local X
 * axis, so this is the whole of what the instance and its product say about
 * where the thing physically is. Everything spatial — hit testing now,
 * intersection next — measures this and not the drawing.
 */
export function footprintRect({
  instance,
  product,
}: PlacedFurniture): OrientedRect {
  return {
    center: instance.position,
    widthMeters: product.footprint.widthMeters,
    depthMeters: product.footprint.depthMeters,
    rotationRadians: instance.rotationRadians,
  };
}

export function moveInstance(
  instance: FurnitureInstance,
  position: FloorPoint,
): FurnitureInstance {
  return { ...instance, position };
}

/** Turns a piece about its own center, kept inside one turn. */
export function turnInstance(
  instance: FurnitureInstance,
  rotationRadians: number,
): FurnitureInstance {
  return { ...instance, rotationRadians: normalizeRadians(rotationRadians) };
}

/**
 * The piece under a floor point, or null for empty floor.
 *
 * Later pieces win, because they are drawn last and so are the ones a person
 * sees on top of the pile.
 */
export function furnitureAt(
  furniture: readonly PlacedFurniture[],
  point: FloorPoint,
): PlacedFurniture | null {
  for (let index = furniture.length - 1; index >= 0; index -= 1) {
    const placed = furniture[index];
    if (
      placed !== undefined &&
      orientedRectContains(footprintRect(placed), point)
    ) {
      return placed;
    }
  }
  return null;
}

/**
 * Keeps a piece's center on the floor.
 *
 * Only the center: a piece may still hang over a wall, which is a real thing
 * to do by accident and the kind of thing validation is for. A center outside
 * the room is not a mistake worth representing.
 */
export function clampToFloor(room: Room, point: FloorPoint): FloorPoint {
  return {
    xMeters: clamp(point.xMeters, 0, room.widthMeters),
    zMeters: clamp(point.zMeters, 0, room.depthMeters),
  };
}

/** Replaces one instance by id, leaving the order — and so the stacking — alone. */
export function withInstance(
  instances: readonly FurnitureInstance[],
  next: FurnitureInstance,
): readonly FurnitureInstance[] {
  return instances.map((existing) =>
    existing.id === next.id ? next : existing,
  );
}

/**
 * A name per placed piece, numbered only where a product is placed more than
 * once. Two rugs have to be tellable apart to be selected or moved; a single
 * rug should not be called "Rug 1".
 */
export function placedNames(
  furniture: readonly PlacedFurniture[],
): readonly string[] {
  const totals = new Map<string, number>();
  for (const { product } of furniture) {
    totals.set(product.id, (totals.get(product.id) ?? 0) + 1);
  }

  const seen = new Map<string, number>();
  return furniture.map(({ product }) => {
    const ordinal = (seen.get(product.id) ?? 0) + 1;
    seen.set(product.id, ordinal);
    return (totals.get(product.id) ?? 0) > 1
      ? `${product.name} ${ordinal}`
      : product.name;
  });
}

/** How many copies of a product are placed. The quantity a budget counts. */
export function countPlaced(
  instances: readonly FurnitureInstance[],
  productId: string,
): number {
  return instances.filter((instance) => instance.productId === productId)
    .length;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
