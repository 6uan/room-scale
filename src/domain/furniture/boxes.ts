/**
 * Placed furniture as solids, for the perspective view.
 *
 * Each piece that is not set aside becomes one box: its product's width,
 * depth and height, standing on the floor at the piece's position, turned as
 * it is turned on the plan. Worked out here rather than in the scene, as the
 * room shell is, so it can be tested without a renderer and the scene never
 * has an opinion about where a sofa is.
 *
 * The box is the footprint the validation already measures, stood up — so
 * whatever the perspective view shows of a piece is exactly what was checked
 * against the walls, and a prettier model later goes inside it, not around it.
 */

import type { FloorPoint } from "@/domain/geometry";
import type { PlacedFurniture } from "./instance";

export type FurnitureBox = {
  readonly instanceId: string;
  /** The middle of the piece on the floor. */
  readonly center: FloorPoint;
  /** Along the piece's own X before it is turned: the product's width. */
  readonly widthMeters: number;
  /** Along its own Z: the product's depth. */
  readonly depthMeters: number;
  readonly heightMeters: number;
  /** The piece's turn, in the floor's sense: its +X toward +Z. */
  readonly angleRadians: number;
};

export function furnitureBoxes(
  furniture: readonly PlacedFurniture[],
): readonly FurnitureBox[] {
  return furniture
    .filter(({ instance }) => instance.hidden !== true)
    .map(({ instance, product }) => ({
      instanceId: instance.id,
      center: instance.position,
      widthMeters: product.footprint.widthMeters,
      depthMeters: product.footprint.depthMeters,
      heightMeters: product.heightMeters,
      angleRadians: instance.rotationRadians,
    }));
}
