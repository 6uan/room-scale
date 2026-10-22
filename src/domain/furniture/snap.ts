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
 * Against another piece there are three things worth landing on: touching
 * it, edge to edge; lining up with it, edge over edge — two nightstands
 * flush with the head of the bed; and centring on it, middle over middle —
 * a lamp on the middle of the console. Touching is offered first, so it
 * wins a tie.
 *
 * How close is close is the caller's to say, in meters, because it is
 * really a distance on the screen: a few pixels, whatever the zoom, so a
 * piece can be put down freely when the plan is large on the screen and is
 * still caught when it is small.
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
  reachMeters: number = SNAP_METERS,
): FloorPoint {
  return snapBox(
    floor,
    furniture.filter((other) => other.instance.id !== placed.instance.id),
    boundingBox({ ...footprintRect(placed), center: position }),
    position,
    reachMeters,
  );
}

/**
 * How far a group of pieces moved together would land from where it was
 * let go: the group's outline, snapped as if it were one piece.
 *
 * A sectional is four seats and five sides moved as one, and what goes
 * against the wall is the sectional, not the seat that happened to be
 * grabbed. So the rectangle around every member is what is offered to the
 * walls and to the pieces outside the group — never to the members
 * themselves, which move with it and would only catch it on its own edges.
 * Every member then moves by the same amount, so what was flush stays flush.
 */
export function snapGroupDelta(
  floor: Floor,
  furniture: readonly PlacedFurniture[],
  memberIds: readonly string[],
  delta: FloorPoint,
  reachMeters: number = SNAP_METERS,
): FloorPoint {
  const members = furniture.filter(({ instance }) =>
    memberIds.includes(instance.id),
  );
  if (members.length === 0) {
    return delta;
  }
  const boxes = members.map((member) => boundingBox(footprintRect(member)));
  const moved: Box = {
    minX: Math.min(...boxes.map((box) => box.minX)) + delta.xMeters,
    maxX: Math.max(...boxes.map((box) => box.maxX)) + delta.xMeters,
    minZ: Math.min(...boxes.map((box) => box.minZ)) + delta.zMeters,
    maxZ: Math.max(...boxes.map((box) => box.maxZ)) + delta.zMeters,
  };
  const center = boxCenter(moved);
  const landed = snapBox(
    floor,
    furniture.filter(({ instance }) => !memberIds.includes(instance.id)),
    moved,
    center,
    reachMeters,
  );
  return {
    xMeters: delta.xMeters + (landed.xMeters - center.xMeters),
    zMeters: delta.zMeters + (landed.zMeters - center.zMeters),
  };
}

/**
 * Where a box let go here would land, as its center. The center is passed
 * in rather than taken from the box, so the reach is measured from the
 * number the caller holds and not from one a corner round-trip has nudged.
 */
function snapBox(
  floor: Floor,
  others: readonly PlacedFurniture[],
  box: Box,
  position: FloorPoint,
  reachMeters: number,
): FloorPoint {
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

  for (const other of others) {
    const theirs = boundingBox(footprintRect(other));
    touch(theirs.minX, theirs.minZ);
    touch(theirs.maxX, theirs.maxZ);
    // Lining up: the same near edge, or the same far edge.
    xCandidates.push(theirs.minX + halfWidth, theirs.maxX - halfWidth);
    zCandidates.push(theirs.minZ + halfDepth, theirs.maxZ - halfDepth);
    // Centring: middle over middle.
    xCandidates.push((theirs.minX + theirs.maxX) / 2);
    zCandidates.push((theirs.minZ + theirs.maxZ) / 2);
  }

  return {
    xMeters: nearestSnap(position.xMeters, xCandidates, reachMeters),
    zMeters: nearestSnap(position.zMeters, zCandidates, reachMeters),
  };
}

type Box = {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
};

function boxCenter(box: Box): FloorPoint {
  return {
    xMeters: (box.minX + box.maxX) / 2,
    zMeters: (box.minZ + box.maxZ) / 2,
  };
}

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
function nearestSnap(
  value: number,
  candidates: readonly number[],
  reachMeters: number,
): number {
  let best = value;
  let nearest = reachMeters;
  for (const candidate of candidates) {
    const distance = Math.abs(candidate - value);
    if (distance < nearest) {
      best = candidate;
      nearest = distance;
    }
  }
  return best;
}

/** Where a held axis is, or null when nothing is holding it. */
export type SnapHold = {
  readonly x: number | null;
  readonly z: number | null;
};

export const NO_HOLD: SnapHold = { x: null, z: null };

/**
 * A snap that holds on once it has landed.
 *
 * Landing takes the ordinary reach — a few pixels — but leaving takes more:
 * once a piece is on the wall it stays on the wall until the pointer has
 * pulled clearly away, by `holdReachMeters`, which is bigger. Without this a
 * piece set in a corner shivers on and off the corner with every pixel of
 * hand movement, and a dimension that reads 0 then 0.3 then 0 is not one
 * anybody trusts.
 *
 * Per axis: a fresh landing sets the hold; a raw value still within the
 * hold's reach stays held; anything further lets go. `raw` is where the
 * pointer put it, `landed` where the ordinary snap would.
 */
export function heldSnap(
  raw: FloorPoint,
  landed: FloorPoint,
  hold: SnapHold,
  holdReachMeters: number,
): { readonly value: FloorPoint; readonly hold: SnapHold } {
  const x = holdAxis(raw.xMeters, landed.xMeters, hold.x, holdReachMeters);
  const z = holdAxis(raw.zMeters, landed.zMeters, hold.z, holdReachMeters);
  return {
    value: { xMeters: x.value, zMeters: z.value },
    hold: { x: x.hold, z: z.hold },
  };
}

function holdAxis(
  raw: number,
  landed: number,
  hold: number | null,
  reach: number,
): { readonly value: number; readonly hold: number | null } {
  if (landed !== raw) {
    return { value: landed, hold: landed };
  }
  if (hold !== null && Math.abs(raw - hold) < reach) {
    return { value: hold, hold };
  }
  return { value: raw, hold: null };
}
