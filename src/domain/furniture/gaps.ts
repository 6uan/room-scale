/**
 * How far a piece stands from the walls around it.
 *
 * A plan is read in gaps — six inches off the wall, a foot between the bed
 * and the dresser — and a position measured from the apartment's corner is
 * not that number. This turns one into the other, so the gap can be drawn on
 * the plan while a piece is dragged and typed into the panel when it is not.
 *
 * The piece is measured by its bounding box, which for a turned piece is the
 * nearest point of it, against the room it overlaps most. On each side the
 * face is the nearest edge of an axis-aligned part of that room with nothing
 * of the room's own floor beyond it: a seam between two sections of an L is
 * not a wall and is passed over. A turned section has no face along either
 * axis and is left out.
 */

import {
  orientedRectCorners,
  type FloorPoint,
  type OrientedRect,
} from "@/domain/geometry";
import {
  roomContains,
  roomFootprintOverlapArea,
  type Floor,
  type Room,
} from "@/domain/room";
import { footprintRect, moveInstance, type PlacedFurniture } from "./instance";
import type { FurnitureInstance } from "./instance";

export type GapSide = "west" | "east" | "north" | "south";

export const GAP_SIDES: readonly GapSide[] = ["west", "east", "north", "south"];

export type WallGap = {
  readonly side: GapSide;
  /** What the gap runs to: the room's wall, or another piece in the way. */
  readonly to: "wall" | "piece";
  /** From the piece's nearest edge to the wall face. Negative when through it. */
  readonly gapMeters: number;
  /** Where the face is, on the axis the gap runs along. */
  readonly faceMeters: number;
  /** Where the piece's edge is, on that axis. */
  readonly edgeMeters: number;
  /** The middle of the piece on the other axis, where the gap is drawn. */
  readonly alongMeters: number;
};

/** The room a piece stands in: the one its footprint overlaps most, if any. */
export function roomUnder(floor: Floor, rect: OrientedRect): Room | null {
  let best: { room: Room; area: number } | null = null;
  for (const room of floor.rooms) {
    const area = roomFootprintOverlapArea(room, rect);
    if (area > 0.000001 && (best === null || area > best.area)) {
      best = { room, area };
    }
  }
  return best?.room ?? null;
}

export function wallGaps(
  floor: Floor,
  placed: PlacedFurniture,
): readonly WallGap[] {
  const rect = footprintRect(placed);
  const room = roomUnder(floor, rect);
  if (room === null) {
    return [];
  }
  const box = boundingBox(rect);
  const center = rect.center;

  return GAP_SIDES.flatMap((side) => {
    const face = nearestFace(room, side, box, center);
    if (face === null) {
      return [];
    }
    const edge =
      side === "west"
        ? box.minX
        : side === "east"
          ? box.maxX
          : side === "north"
            ? box.minZ
            : box.maxZ;
    const gap = side === "west" || side === "north" ? edge - face : face - edge;
    return [
      {
        side,
        to: "wall" as const,
        gapMeters: gap,
        faceMeters: face,
        edgeMeters: edge,
        alongMeters:
          side === "west" || side === "east" ? center.zMeters : center.xMeters,
      },
    ];
  });
}

/**
 * The gaps to whatever is nearest on each side: the wall, or another piece
 * standing in the way before it.
 *
 * This is the clearance — the fish tank to the bed, not the fish tank to the
 * wall behind the bed. A piece counts as in the way when it lies across from
 * this one on that side: beyond the edge, and overlapping it on the other
 * axis, so a nightstand beside the bed is not "in the way" of the bed going
 * north. The wall gaps for the panel are `wallGaps`; this one is for reading.
 */
export function nearestGaps(
  floor: Floor,
  furniture: readonly PlacedFurniture[],
  placed: PlacedFurniture,
): readonly WallGap[] {
  const rect = footprintRect(placed);
  const box = boundingBox(rect);
  const gaps = wallGaps(floor, placed);

  return gaps.map((gap) => {
    const horizontal = gap.side === "west" || gap.side === "east";
    const outward = gap.side === "west" || gap.side === "north" ? -1 : 1;
    let best = gap;

    for (const other of furniture) {
      if (other.instance.id === placed.instance.id) {
        continue;
      }
      const theirs = boundingBox(footprintRect(other));
      const acrossOverlap = horizontal
        ? theirs.minZ < box.maxZ && theirs.maxZ > box.minZ
        : theirs.minX < box.maxX && theirs.maxX > box.minX;
      if (!acrossOverlap) {
        continue;
      }
      // Their edge facing this piece.
      const face = horizontal
        ? outward < 0
          ? theirs.maxX
          : theirs.minX
        : outward < 0
          ? theirs.maxZ
          : theirs.minZ;
      const distance = (face - gap.edgeMeters) * outward;
      if (distance < 0 || distance >= best.gapMeters) {
        continue;
      }
      // Drawn where the two actually overlap, not at this piece's middle: a
      // line to a nightstand that only reaches under half the bed has to
      // land on the nightstand, not beside it in the air.
      const overlapStart = horizontal
        ? Math.max(theirs.minZ, box.minZ)
        : Math.max(theirs.minX, box.minX);
      const overlapEnd = horizontal
        ? Math.min(theirs.maxZ, box.maxZ)
        : Math.min(theirs.maxX, box.maxX);
      best = {
        ...gap,
        to: "piece",
        gapMeters: distance,
        faceMeters: face,
        alongMeters: (overlapStart + overlapEnd) / 2,
      };
    }
    return best;
  });
}

/** The piece moved so that its gap on one side is exactly this. */
export function withWallGap(
  floor: Floor,
  placed: PlacedFurniture,
  side: GapSide,
  gapMeters: number,
): FurnitureInstance {
  const gap = wallGaps(floor, placed).find((one) => one.side === side);
  if (gap === undefined) {
    return placed.instance;
  }
  const delta = gapMeters - gap.gapMeters;
  const { position } = placed.instance;
  switch (side) {
    case "west":
      return moveInstance(placed.instance, {
        ...position,
        xMeters: position.xMeters + delta,
      });
    case "east":
      return moveInstance(placed.instance, {
        ...position,
        xMeters: position.xMeters - delta,
      });
    case "north":
      return moveInstance(placed.instance, {
        ...position,
        zMeters: position.zMeters + delta,
      });
    case "south":
      return moveInstance(placed.instance, {
        ...position,
        zMeters: position.zMeters - delta,
      });
  }
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

/** A hair past a face, to ask whether the room's floor carries on there. */
const BEYOND_METERS = 0.001;

/**
 * The nearest face on one side: the closest edge of an axis-aligned part,
 * across from the piece's middle, with none of the room's floor beyond it.
 * Faces the piece has already crossed count too, so a piece through a wall
 * reads as a negative gap rather than measuring to the far side of the room.
 */
function nearestFace(
  room: Room,
  side: GapSide,
  box: Box,
  center: FloorPoint,
): number | null {
  const horizontal = side === "west" || side === "east";
  const outward = side === "west" || side === "north" ? -1 : 1;
  let best: number | null = null;

  for (const part of room.parts) {
    if (part.rotationRadians !== 0) {
      continue;
    }
    // Only a part the piece is across from: one whose span on the other axis
    // covers the piece's middle. A wing of an L off to the side has faces, but
    // not ones the piece would hit going straight.
    const spanStart = horizontal ? part.origin.zMeters : part.origin.xMeters;
    const spanLength = horizontal ? part.depthMeters : part.widthMeters;
    const across = horizontal ? center.zMeters : center.xMeters;
    if (across < spanStart || across > spanStart + spanLength) {
      continue;
    }

    const start = horizontal ? part.origin.xMeters : part.origin.zMeters;
    const length = horizontal ? part.widthMeters : part.depthMeters;
    const face = outward < 0 ? start : start + length;

    const beyond: FloorPoint = horizontal
      ? { xMeters: face + outward * BEYOND_METERS, zMeters: center.zMeters }
      : { xMeters: center.xMeters, zMeters: face + outward * BEYOND_METERS };
    if (roomContains(room, beyond)) {
      continue;
    }

    const edge = horizontal
      ? outward < 0
        ? box.minX
        : box.maxX
      : outward < 0
        ? box.minZ
        : box.maxZ;
    const distance = (face - edge) * outward;
    if (best === null || distance < (best - edge) * outward) {
      best = face;
    }
  }
  return best;
}
