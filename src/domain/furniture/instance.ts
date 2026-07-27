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

import type { FloorPoint } from "@/domain/geometry";
import type { Room } from "@/domain/room";
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
