/**
 * Openings in the room's walls: doors, windows, and open passages.
 *
 * An opening sits on one wall, measured along that wall from its start corner
 * to the opening's center. Start corners are picked so the measurement always
 * runs the way a plan is read: north and south walls are measured from their
 * west end, east and west walls from their north end.
 *
 * Walls are named in the part's own frame — its north wall is at local z = 0
 * whichever way the part is turned — so an opening's center and width mean
 * exactly the same tape measurement on a diagonal wall as on a square one.
 * Only the step between the part's frame and the floor knows about rotation.
 */

import type { FloorPoint } from "@/domain/geometry";
import {
  partWallLengthMeters,
  partWallSegment,
  pointInRoomPart,
  pointOnRoomPart,
  primaryRoomPart,
  roomBounds,
  roomPart,
  roomPartContains,
  roomPartCut,
  type PartCorner,
  type Room,
  type RoomPart,
} from "./room";

/** The four sides a rectangle always has, whatever is cut off its corners. */
export type AxisWallSide = "north" | "east" | "south" | "west";

/**
 * Every wall a part can have.
 *
 * A clipped corner leaves a chamfer, and a chamfer is a wall like any other:
 * it is drawn, it carries a thickness, and a door can be cut through it. So it
 * is named the way the corner it replaced is named, and everything addressed
 * by `(part, wall, distance along)` — every door and window in the apartment —
 * keeps working without knowing which kind of wall it sits on.
 */
export type WallSide = AxisWallSide | PartCorner;

export const AXIS_WALL_SIDES: readonly AxisWallSide[] = [
  "north",
  "east",
  "south",
  "west",
];

/** Round the compass, so a list of walls reads the way the plan is drawn. */
export const WALL_SIDES: readonly WallSide[] = [
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
];

/**
 * The walls this part actually has: its four sides, less any a cut has eaten
 * whole, plus a chamfer for every corner that is clipped.
 *
 * A part with no cuts has exactly the four it always had.
 */
export function partWallSides(part: RoomPart): readonly WallSide[] {
  return WALL_SIDES.filter((wall) => partWallLengthMeters(part, wall) > 0);
}

export type OpeningKind = "door" | "window" | "passage";

/** Which jamb the door is hung on, in the wall's own direction. */
export type DoorHinge = "start" | "end";

export type DoorSwing = "inward" | "outward";

type OpeningPlacement = {
  readonly id: string;
  /** The rectangular part whose wall carries this opening. */
  readonly partId: string;
  readonly wall: WallSide;
  readonly centerMeters: number;
  readonly widthMeters: number;
};

export type Door = OpeningPlacement & {
  readonly kind: "door";
  readonly hinge: DoorHinge;
  readonly swing: DoorSwing;
};

/** Named to stay out of the way of the DOM's `Window`. */
export type WindowOpening = OpeningPlacement & { readonly kind: "window" };

export type Passage = OpeningPlacement & { readonly kind: "passage" };

export type Opening = Door | WindowOpening | Passage;

/** Narrower than this is a hole, not an opening anyone walks or looks through. */
export const MIN_OPENING_METERS = 0.3;

/** Starting sizes: a 32 inch door, a 48 inch window, a 36 inch passage. */
export const DEFAULT_OPENING_WIDTH_METERS: Record<OpeningKind, number> = {
  door: 0.8128,
  window: 1.2192,
  passage: 0.9144,
};

/** A direction on the floor plane, as a unit vector. */
export type FloorVector = { readonly dx: number; readonly dz: number };

export function wallLengthMeters(
  room: Room,
  wall: WallSide,
  partId = primaryRoomPart(room).id,
): number {
  const part = roomPart(room, partId) ?? primaryRoomPart(room);
  return partWallLengthMeters(part, wall);
}

/** Where the opening starts and ends, measured along its wall. */
export function openingRangeMeters(opening: OpeningPlacement): {
  startMeters: number;
  endMeters: number;
} {
  const half = opening.widthMeters / 2;
  return {
    startMeters: opening.centerMeters - half,
    endMeters: opening.centerMeters + half,
  };
}

export type OpeningProblem =
  | "not-a-number"
  | "too-narrow"
  | "off-wall"
  /** The wall was left open: there is nothing to cut a hole through. */
  | "open-wall";

export function checkOpening(
  room: Room,
  opening: Opening,
): OpeningProblem | null {
  if (
    !Number.isFinite(opening.centerMeters) ||
    !Number.isFinite(opening.widthMeters)
  ) {
    return "not-a-number";
  }
  const part = roomPart(room, opening.partId);
  // A wall of no length is not a narrow wall. A corner that was never clipped
  // offers no chamfer, so there is nowhere on the section for this to be —
  // which is a different sentence from "this hole is too small to walk through".
  if (part !== undefined && partWallLengthMeters(part, opening.wall) <= 0) {
    return "off-wall";
  }
  if (opening.widthMeters < MIN_OPENING_METERS) {
    return "too-narrow";
  }
  const { startMeters, endMeters } = openingRangeMeters(opening);
  if (
    part === undefined ||
    startMeters < 0 ||
    endMeters > wallLengthMeters(room, opening.wall, opening.partId) ||
    !openingSegmentIsExterior(room, opening)
  ) {
    return "off-wall";
  }
  if (part.openWalls.includes(opening.wall)) {
    return "open-wall";
  }
  return null;
}

/** The direction a square wall runs, from its start corner toward its end. */
export function wallDirection(wall: AxisWallSide): FloorVector {
  return wall === "north" || wall === "south"
    ? { dx: 1, dz: 0 }
    : { dx: 0, dz: 1 };
}

/** The unit vector pointing out of the part, in the part's own frame. */
export function wallOutwardNormal(wall: AxisWallSide): FloorVector {
  switch (wall) {
    case "north":
      return { dx: 0, dz: -1 };
    case "south":
      return { dx: 0, dz: 1 };
    case "west":
      return { dx: -1, dz: 0 };
    case "east":
      return { dx: 1, dz: 0 };
  }
}

/**
 * The direction any wall runs, in the part's own frame.
 *
 * A square side is written out rather than derived, so an uncut wall keeps
 * exactly the unit vector it always had; a chamfer is the segment between its
 * two ends, normalized.
 */
function localWallDirection(part: RoomPart, wall: WallSide): FloorVector {
  if (isAxisWall(wall)) {
    return wallDirection(wall);
  }
  const { from, to } = partWallSegment(part, wall);
  const dx = to.xMeters - from.xMeters;
  const dz = to.zMeters - from.zMeters;
  const length = Math.hypot(dx, dz);
  return length === 0 ? { dx: 0, dz: 0 } : { dx: dx / length, dz: dz / length };
}

/**
 * The unit vector pointing out of the part through any wall, in its own frame.
 *
 * A chamfer's normal comes off the cut's own two legs rather than off the
 * direction it is measured in: the four chamfers are not all measured the way
 * the outline is wound, and a normal derived from the measurement would point
 * two of them back into the room.
 */
function localWallNormal(part: RoomPart, wall: WallSide): FloorVector {
  if (isAxisWall(wall)) {
    return wallOutwardNormal(wall);
  }
  // A corner that is not cut has no chamfer to face out of, and still has to
  // answer with a direction rather than a zero: nothing sits on a wall of no
  // length, but the drawing asks about it anyway. Equal legs point it out of
  // the corner at 45°, which is where a chamfer there would face.
  const cut = roomPartCut(part, wall) ?? { widthMeters: 1, depthMeters: 1 };
  const { widthMeters: alongWidth, depthMeters: alongDepth } = cut;
  const length = Math.hypot(alongWidth, alongDepth);
  const out = (dx: number, dz: number): FloorVector => ({
    dx: dx / length,
    dz: dz / length,
  });
  switch (wall) {
    case "north-west":
      return out(-alongDepth, -alongWidth);
    case "north-east":
      return out(alongDepth, -alongWidth);
    case "south-east":
      return out(alongDepth, alongWidth);
    case "south-west":
      return out(-alongDepth, alongWidth);
  }
}

/** The same normal carried onto the floor, turned the way its part is. */
export function wallOutwardNormalOnFloor(
  part: RoomPart,
  wall: WallSide,
): FloorVector {
  const local = localWallNormal(part, wall);
  const cos = Math.cos(part.rotationRadians);
  const sin = Math.sin(part.rotationRadians);
  return {
    dx: local.dx * cos - local.dz * sin,
    dz: local.dx * sin + local.dz * cos,
  };
}

function isAxisWall(wall: WallSide): wall is AxisWallSide {
  return (
    wall === "north" || wall === "east" || wall === "south" || wall === "west"
  );
}

export type WallFrame = {
  readonly from: FloorPoint;
  readonly to: FloorPoint;
  /** Unit, from the start corner toward the end. */
  readonly direction: FloorVector;
  /** Unit, pointing out of the part through the wall. */
  readonly normal: FloorVector;
  readonly lengthMeters: number;
};

/**
 * One wall of a part, in the part's own frame.
 *
 * Everything that has to place something on a wall — an opening, a band of
 * wall thickness, a railing — reads it from here, so a chamfer left by a
 * clipped corner is drawn and measured by exactly the arithmetic a square side
 * is. The rotation is applied once, outside, where the frame meets the floor.
 */
export function partWallFrame(part: RoomPart, wall: WallSide): WallFrame {
  const { from, to } = partWallSegment(part, wall);
  return {
    from,
    to,
    direction: localWallDirection(part, wall),
    normal: localWallNormal(part, wall),
    lengthMeters: partWallLengthMeters(part, wall),
  };
}

/** A wall point in the part's own frame, `alongMeters` from its start corner. */
function localWallPoint(
  part: RoomPart,
  wall: WallSide,
  alongMeters: number,
): FloorPoint {
  const { from } = partWallSegment(part, wall);
  const direction = localWallDirection(part, wall);
  return {
    xMeters: from.xMeters + direction.dx * alongMeters,
    zMeters: from.zMeters + direction.dz * alongMeters,
  };
}

/** A point on the inside face of a wall, `alongMeters` from its start corner. */
export function pointAlongWall(
  room: Room,
  wall: WallSide,
  alongMeters: number,
  partId = primaryRoomPart(room).id,
): FloorPoint {
  const part = roomPart(room, partId) ?? primaryRoomPart(room);
  const roomOrigin = roomBounds(room).origin;
  const floorPoint = pointOnRoomPart(
    part,
    localWallPoint(part, wall, alongMeters),
  );
  return {
    xMeters: floorPoint.xMeters - roomOrigin.xMeters,
    zMeters: floorPoint.zMeters - roomOrigin.zMeters,
  };
}

/**
 * How far along one wall a part-local point lies.
 *
 * The perpendicular coordinate is deliberately ignored: a pointer moving an
 * opening may stray away from the narrow wall band, but it still changes only
 * the measured distance along that wall.
 */
export function metersAlongWall(wall: AxisWallSide, point: FloorPoint): number {
  return wall === "north" || wall === "south" ? point.xMeters : point.zMeters;
}

/**
 * How far along one wall of a part a part-local point lies, measured from
 * where that wall actually starts.
 *
 * A clipped corner shortens the two sides meeting at it and moves where they
 * begin, so a distance along the north wall is measured from the end of the
 * chamfer rather than from a square corner that is no longer there — which is
 * where a tape run along that wall would start.
 */
export function metersAlongPartWall(
  part: RoomPart,
  wall: WallSide,
  point: FloorPoint,
): number {
  const { from } = partWallSegment(part, wall);
  if (isAxisWall(wall)) {
    return metersAlongWall(wall, point) - metersAlongWall(wall, from);
  }
  const direction = localWallDirection(part, wall);
  return (
    (point.xMeters - from.xMeters) * direction.dx +
    (point.zMeters - from.zMeters) * direction.dz
  );
}

/** Distance along an opening's own part wall from a room-local pointer. */
export function metersAlongOpeningWall(
  room: Room,
  opening: Opening,
  point: FloorPoint,
): number {
  const part = roomPart(room, opening.partId) ?? primaryRoomPart(room);
  const origin = roomBounds(room).origin;
  const local = pointInRoomPart(part, {
    xMeters: point.xMeters + origin.xMeters,
    zMeters: point.zMeters + origin.zMeters,
  });
  return metersAlongPartWall(part, opening.wall, local);
}

export type WallPlacement = {
  readonly partId: string;
  readonly wall: WallSide;
  readonly alongMeters: number;
};

/**
 * The wall near a room-local point, if one is within reach.
 *
 * Reach is supplied by the caller because a pointer target is measured on
 * screen: the canvas converts its fixed pixel tolerance to meters at the
 * current zoom. The wall's own length is still exact domain geometry.
 */
export function wallPlacementAt(
  room: Room,
  point: FloorPoint,
  reachMeters: number,
): WallPlacement | null {
  const bounds = roomBounds(room);
  const candidates = room.parts
    .flatMap((part) => {
      const local = pointInRoomPart(part, {
        xMeters: point.xMeters + bounds.origin.xMeters,
        zMeters: point.zMeters + bounds.origin.zMeters,
      });
      return partWallSides(part).map((wall) => {
        const alongMeters = metersAlongPartWall(part, wall, local);
        const length = wallLengthMeters(room, wall, part.id);
        const distanceMeters = distanceFromWall(part, wall, local);
        return {
          partId: part.id,
          wall,
          alongMeters,
          length,
          distanceMeters,
        };
      });
    })
    .filter(
      ({ partId, wall, alongMeters, length, distanceMeters }) =>
        distanceMeters <= reachMeters &&
        alongMeters >= 0 &&
        alongMeters <= length &&
        // An open edge offers nothing to cut a door through.
        !(roomPart(room, partId)?.openWalls.includes(wall) ?? false) &&
        wallPointIsExterior(room, partId, wall, alongMeters),
    )
    .sort((a, b) => a.distanceMeters - b.distanceMeters);

  const nearest = candidates[0];
  return nearest === undefined
    ? null
    : {
        partId: nearest.partId,
        wall: nearest.wall,
        alongMeters: nearest.alongMeters,
      };
}

/** The topmost opening under a room-local point, if there is one. */
export function openingAtPoint(
  room: Room,
  point: FloorPoint,
  reachMeters: number,
): Opening | null {
  const placement = wallPlacementAt(room, point, reachMeters);
  if (placement === null) {
    return null;
  }

  return (
    room.openings
      .filter(
        (opening) =>
          opening.partId === placement.partId &&
          opening.wall === placement.wall,
      )
      .filter((opening) => checkOpening(room, opening) === null)
      .filter((opening) => {
        const { startMeters, endMeters } = openingRangeMeters(opening);
        return (
          placement.alongMeters >= startMeters &&
          placement.alongMeters <= endMeters
        );
      })
      .at(-1) ?? null
  );
}

/**
 * The opening's two jambs on the inside face of its wall. `start` is the end
 * nearer the wall's start corner, which is also the `"start"` hinge.
 */
export function openingEndpoints(
  room: Room,
  opening: Opening,
): { start: FloorPoint; end: FloorPoint } {
  const { startMeters, endMeters } = openingRangeMeters(opening);
  return {
    start: pointAlongWall(room, opening.wall, startMeters, opening.partId),
    end: pointAlongWall(room, opening.wall, endMeters, opening.partId),
  };
}

/** A new opening of standard width, centered on its wall. */
export function createOpening(
  kind: OpeningKind,
  id: string,
  room: Room,
  wall: WallSide = "north",
  centerMeters?: number,
  partId = primaryRoomPart(room).id,
): Opening {
  const wallLength = wallLengthMeters(room, wall, partId);
  const widthMeters = Math.min(DEFAULT_OPENING_WIDTH_METERS[kind], wallLength);
  const half = widthMeters / 2;
  const placement = {
    id,
    partId,
    wall,
    centerMeters: clamp(
      centerMeters ?? wallLength / 2,
      half,
      wallLength - half,
    ),
    widthMeters,
  };

  switch (kind) {
    case "door":
      return { ...placement, kind, hinge: "start", swing: "inward" };
    case "window":
      return { ...placement, kind };
    case "passage":
      return { ...placement, kind };
  }
}

/**
 * Moves an opening to a different wall, keeping it on the wall it lands on.
 * Walls differ in length, so a center that was valid may not be.
 */
export function withOpeningWall(
  room: Room,
  opening: Opening,
  wall: WallSide,
): Opening {
  const wallLength = wallLengthMeters(room, wall, opening.partId);
  const widthMeters = Math.min(opening.widthMeters, wallLength);
  const half = widthMeters / 2;
  return {
    ...opening,
    wall,
    widthMeters,
    centerMeters: clamp(opening.centerMeters, half, wallLength - half),
  };
}

/** Moves an opening along its wall without letting either jamb leave it. */
export function moveOpening(
  room: Room,
  opening: Opening,
  centerMeters: number,
): Opening {
  const wallLength = wallLengthMeters(room, opening.wall, opening.partId);
  const half = opening.widthMeters / 2;
  return {
    ...opening,
    centerMeters: clamp(centerMeters, half, wallLength - half),
  };
}

export type OpeningJamb = "start" | "end";

/**
 * Moves one jamb while the opposite jamb stays where it is.
 *
 * Pointer editing cannot create a hole narrower than the domain minimum or
 * pull it beyond a corner. Numeric editing remains separate and exact.
 */
export function resizeOpeningJamb(
  room: Room,
  opening: Opening,
  jamb: OpeningJamb,
  alongMeters: number,
): Opening {
  const wallLength = wallLengthMeters(room, opening.wall, opening.partId);
  const { startMeters, endMeters } = openingRangeMeters(opening);
  const start =
    jamb === "start"
      ? clamp(alongMeters, 0, endMeters - MIN_OPENING_METERS)
      : startMeters;
  const end =
    jamb === "end"
      ? clamp(alongMeters, startMeters + MIN_OPENING_METERS, wallLength)
      : endMeters;

  return {
    ...opening,
    centerMeters: (start + end) / 2,
    widthMeters: end - start,
  };
}

/**
 * How far a part-local point stands outside one wall — negative when it is on
 * the room's side of it, which is how far in it stands.
 */
export function metersBeyondWall(
  part: RoomPart,
  wall: WallSide,
  point: FloorPoint,
): number {
  const { from } = partWallSegment(part, wall);
  const normal = localWallNormal(part, wall);
  return (
    (point.xMeters - from.xMeters) * normal.dx +
    (point.zMeters - from.zMeters) * normal.dz
  );
}

/** How far a part-local point stands off the line one wall runs along. */
function distanceFromWall(
  part: RoomPart,
  wall: WallSide,
  point: FloorPoint,
): number {
  return Math.abs(metersBeyondWall(part, wall, point));
}

/** A wall sample is exterior when another part does not continue through it. */
function wallPointIsExterior(
  room: Room,
  partId: string,
  wall: WallSide,
  alongMeters: number,
): boolean {
  const part = roomPart(room, partId);
  if (part === undefined) {
    return false;
  }
  const epsilon = 0.000001;
  const floorPoint = pointOnRoomPart(
    part,
    localWallPoint(part, wall, alongMeters),
  );
  const normal = wallOutwardNormalOnFloor(part, wall);
  const outside = {
    xMeters: floorPoint.xMeters + normal.dx * epsilon,
    zMeters: floorPoint.zMeters + normal.dz * epsilon,
  };
  return !room.parts.some(
    (other) => other.id !== part.id && roomPartContains(other, outside),
  );
}

function openingSegmentIsExterior(room: Room, opening: Opening): boolean {
  const range = openingRangeMeters(opening);
  return [range.startMeters, opening.centerMeters, range.endMeters].every(
    (alongMeters) =>
      wallPointIsExterior(room, opening.partId, opening.wall, alongMeters),
  );
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
