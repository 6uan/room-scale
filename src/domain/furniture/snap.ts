/**
 * Where a dragged piece would land if it were let go here: against the nearest
 * wall, if one is close.
 *
 * A sofa goes against a wall, a bed's head goes against a wall, a console goes
 * against a wall — most furniture is placed by pushing it until it touches
 * one, and a drag that stops a finger's width short leaves a gap the plan
 * reports as a measurement. So the piece's edges are offered to every wall
 * face on the floor, on each axis independently, and the nearest within
 * `SNAP_METERS` wins. Further than that it stays exactly where it was put.
 *
 * The faces are those of every axis-aligned room part. A turned part has no
 * face along either axis to snap to, and is left out rather than approximated.
 * A piece that is itself turned snaps by its bounding box, which is what
 * "touching the wall" means for a corner: the nearest point of it meets the
 * face.
 */

import { orientedRectCorners, type FloorPoint } from "@/domain/geometry";
import { SNAP_METERS, type Floor } from "@/domain/room";
import type { PlacedFurniture } from "./instance";
import { footprintRect } from "./instance";

export function snapInstancePosition(
  floor: Floor,
  placed: PlacedFurniture,
  position: FloorPoint,
): FloorPoint {
  const corners = orientedRectCorners({
    ...footprintRect(placed),
    center: position,
  });
  const xs = corners.map((corner) => corner.xMeters);
  const zs = corners.map((corner) => corner.zMeters);
  const halfWidth = (Math.max(...xs) - Math.min(...xs)) / 2;
  const halfDepth = (Math.max(...zs) - Math.min(...zs)) / 2;

  const xFaces: number[] = [];
  const zFaces: number[] = [];
  for (const room of floor.rooms) {
    for (const part of room.parts) {
      if (part.rotationRadians !== 0) {
        continue;
      }
      xFaces.push(part.origin.xMeters, part.origin.xMeters + part.widthMeters);
      zFaces.push(part.origin.zMeters, part.origin.zMeters + part.depthMeters);
    }
  }

  return {
    xMeters: snapAxis(position.xMeters, halfWidth, xFaces),
    zMeters: snapAxis(position.zMeters, halfDepth, zFaces),
  };
}

/** The center that puts either edge of the piece on the nearest face. */
function snapAxis(
  center: number,
  halfExtent: number,
  faces: readonly number[],
): number {
  let best = center;
  let nearest = SNAP_METERS;
  for (const face of faces) {
    for (const candidate of [face + halfExtent, face - halfExtent]) {
      const distance = Math.abs(candidate - center);
      if (distance < nearest) {
        best = candidate;
        nearest = distance;
      }
    }
  }
  return best;
}
