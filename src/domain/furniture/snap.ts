/**
 * Where a dragged piece would land if it were let go here: against the nearest
 * wall or the nearest other piece, if one is close.
 *
 * A sofa goes against a wall, a nightstand goes against the bed, a console
 * goes against a wall — most furniture is placed by pushing it until it
 * touches something, and a drag that stops a finger's width short leaves a
 * gap the plan reports as a measurement. So the piece's edges are offered to
 * every wall face on the floor and every edge of every other piece, on each
 * axis independently, and the nearest within `SNAP_METERS` wins. Further
 * than that it stays exactly where it was put.
 *
 * Against another piece there are two things worth landing on: touching it,
 * edge to edge, and lining up with it, edge over edge — two nightstands
 * flush with the head of the bed. Touching is offered first, so it wins a
 * tie.
 *
 * The wall faces are those of every axis-aligned room part. A turned part
 * has no face along either axis to snap to, and is left out rather than
 * approximated. A piece that is itself turned snaps by its bounding box, as
 * does a turned neighbour: what touches is the nearest point of each.
 */

import {
  orientedRectCorners,
  type FloorPoint,
  type OrientedRect,
} from "@/domain/geometry";
import {
  SNAP_METERS,
  isWallDividing,
  wallThicknessMeters,
  type Floor,
  type WallSide,
} from "@/domain/room";
import type { PlacedFurniture } from "./instance";
import { footprintRect } from "./instance";

export function snapInstancePosition(
  floor: Floor,
  furniture: readonly PlacedFurniture[],
  placed: PlacedFurniture,
  position: FloorPoint,
): FloorPoint {
  const box = boundingBox({ ...footprintRect(placed), center: position });
  const halfWidth = (box.maxX - box.minX) / 2;
  const halfDepth = (box.maxZ - box.minZ) / 2;

  // A candidate is a center the piece could land on: its own edge against a
  // face, or lined up with a neighbour's edge.
  const xCandidates: number[] = [];
  const zCandidates: number[] = [];
  const touch = (xFace: number | null, zFace: number | null) => {
    if (xFace !== null) {
      xCandidates.push(xFace + halfWidth, xFace - halfWidth);
    }
    if (zFace !== null) {
      zCandidates.push(zFace + halfDepth, zFace - halfDepth);
    }
  };

  for (const room of floor.rooms) {
    const thickness = wallThicknessMeters(floor, room);
    for (const part of room.parts) {
      if (part.rotationRadians !== 0) {
        continue;
      }
      // A dividing wall — a closet's — has a band standing outside the
      // section's edge. A piece inside the closet lands on the edge; a piece
      // in the room lands on the band's outer face, and neither is offered
      // the centre that would put it in the wall.
      const faces: readonly [WallSide, number, "x" | "z", -1 | 1][] = [
        ["west", part.origin.xMeters, "x", -1],
        ["east", part.origin.xMeters + part.widthMeters, "x", 1],
        ["north", part.origin.zMeters, "z", -1],
        ["south", part.origin.zMeters + part.depthMeters, "z", 1],
      ];
      for (const [wall, face, axis, outward] of faces) {
        const half = axis === "x" ? halfWidth : halfDepth;
        const candidates = axis === "x" ? xCandidates : zCandidates;
        if (isWallDividing(part, wall)) {
          candidates.push(
            face - outward * half,
            face + outward * (thickness + half),
          );
        } else {
          candidates.push(face + half, face - half);
        }
      }
    }
  }

  for (const other of furniture) {
    if (other.instance.id === placed.instance.id) {
      continue;
    }
    const theirs = boundingBox(footprintRect(other));
    touch(theirs.minX, theirs.minZ);
    touch(theirs.maxX, theirs.maxZ);
    // Lining up: the same near edge, or the same far edge.
    xCandidates.push(theirs.minX + halfWidth, theirs.maxX - halfWidth);
    zCandidates.push(theirs.minZ + halfDepth, theirs.maxZ - halfDepth);
  }

  return {
    xMeters: nearestSnap(position.xMeters, xCandidates),
    zMeters: nearestSnap(position.zMeters, zCandidates),
  };
}

type Box = {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
};

function boundingBox(rect: OrientedRect): Box {
  const corners = orientedRectCorners(rect);
  const xs = corners.map((corner) => corner.xMeters);
  const zs = corners.map((corner) => corner.zMeters);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

/** The nearest candidate within reach, or the value as given. First wins a tie. */
function nearestSnap(value: number, candidates: readonly number[]): number {
  let best = value;
  let nearest = SNAP_METERS;
  for (const candidate of candidates) {
    const distance = Math.abs(candidate - value);
    if (distance < nearest) {
      best = candidate;
      nearest = distance;
    }
  }
  return best;
}
