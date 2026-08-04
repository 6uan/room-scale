/** A room built from one or more rectangular parts, any of which may be turned. */

import type {
  AxisAlignedRect,
  FloorPoint,
  OrientedRect,
  TurnedRect,
} from "@/domain/geometry";
import {
  turnedRectAsOriented,
  turnedRectContains,
  turnedRectCorners,
  turnedRectFloorPoint,
  turnedRectLocalPoint,
  turnedUnionArea,
  turnedUnionBounds,
} from "@/domain/geometry";
import {
  checkLength,
  metersFromInches,
  type LengthLimits,
  type LengthProblem,
} from "@/domain/units";
import { checkOpening, type Opening, type WallSide } from "./openings";

/**
 * One rectangular section of a room.
 *
 * The stored origin is the part's own north-west corner — always a physical
 * point a tape measure could find, wherever the turn has carried it. Editing
 * the angle spins the part about its center (`withRoomPartRotation`), and the
 * corner is recomputed to follow. Walls, openings, and resizing all live in
 * the part's local frame, which the rotation carries whole.
 *
 * `openWalls` are the sides left without a wall on purpose — a balcony's
 * railing, the open side of a living area. The floor still ends there: an
 * open edge bounds the room exactly as a wall does, it just is not drawn as
 * one and cannot carry a door or a window.
 */
export type RoomPart = TurnedRect & {
  readonly id: string;
  readonly openWalls: readonly WallSide[];
};

export type Room = {
  readonly id: string;
  readonly name: string;
  readonly heightMeters: number;
  readonly parts: readonly RoomPart[];
  readonly openings: readonly Opening[];
  /**
   * This room's own wall thicknesses, or null to take the floor's.
   *
   * Almost every room takes the floor's, which is why the floor still carries
   * both numbers and why the control for these is folded away. The rooms that
   * do not are real, though: a bathroom's plumbing wall is fatter than the
   * partitions around it, and a room built into a chimney breast is fatter
   * still. Typing that once per apartment would be typing the wrong number
   * everywhere else.
   */
  readonly exteriorWallThicknessMeters: number | null;
  readonly interiorWallThicknessMeters: number | null;
};

export type RoomDimension = "widthMeters" | "depthMeters" | "heightMeters";
export type RoomPartDimension = "widthMeters" | "depthMeters";

export const ROOM_DIMENSIONS: readonly RoomDimension[] = [
  "widthMeters",
  "depthMeters",
  "heightMeters",
];

export const ROOM_LENGTH_LIMITS: Record<RoomDimension, LengthLimits> = {
  widthMeters: { minMeters: 0.5, maxMeters: 30 },
  depthMeters: { minMeters: 0.5, maxMeters: 30 },
  heightMeters: { minMeters: 1.5, maxMeters: 6 },
};

export const ROOM_ORIGIN_LIMITS: LengthLimits = {
  minMeters: -60,
  maxMeters: 60,
};

/**
 * How tall a room is until somebody measures it: eight feet.
 *
 * The one thing a new room can be given that is a fair guess rather than a
 * fiction — every other dimension comes off a tape, and a plan view cannot
 * show this one anyway. What used to sit here was a whole furnished living
 * room, which is why `DEFAULT_ROOM` is gone; see `DEFAULT_FLOOR`.
 */
export const DEFAULT_ROOM_HEIGHT_METERS = metersFromInches(96);

export function createRoomPart(
  id: string,
  origin: FloorPoint,
  widthMeters = metersFromInches(120),
  depthMeters = metersFromInches(120),
): RoomPart {
  return {
    id,
    origin,
    widthMeters,
    depthMeters,
    rotationRadians: 0,
    openWalls: [],
  };
}

/** Marks one wall of a part open or walled again. */
export function withRoomPartWallOpen(
  room: Room,
  partId: string,
  wall: WallSide,
  open: boolean,
): Room {
  return withRoomPart(room, partId, (part) => ({
    ...part,
    openWalls: open
      ? [...part.openWalls.filter((one) => one !== wall), wall]
      : part.openWalls.filter((one) => one !== wall),
  }));
}

export function createRoom(id: string, name: string, origin: FloorPoint): Room {
  return {
    id,
    name,
    heightMeters: DEFAULT_ROOM_HEIGHT_METERS,
    parts: [createRoomPart(`${id}-part-1`, origin)],
    openings: [],
    // A new room is built out of whatever the apartment is built out of. An
    // override is a thing somebody measured and meant, never a starting point.
    exteriorWallThicknessMeters: null,
    interiorWallThicknessMeters: null,
  };
}

/**
 * The same room with one of its wall thicknesses overridden, or handed back to
 * the floor's default when the value is null.
 */
export function withRoomWallThickness(
  room: Room,
  kind: "exterior" | "interior",
  meters: number | null,
): Room {
  return kind === "exterior"
    ? { ...room, exteriorWallThicknessMeters: meters }
    : { ...room, interiorWallThicknessMeters: meters };
}

export function primaryRoomPart(room: Room): RoomPart {
  const part = room.parts[0];
  if (part === undefined) {
    throw new Error(`Room ${room.id} has no parts`);
  }
  return part;
}

export function roomPart(room: Room, partId: string): RoomPart | undefined {
  return room.parts.find((part) => part.id === partId);
}

/**
 * An id no section of this room is using.
 *
 * Counted past the ones already taken rather than from the length, so removing
 * a middle section and adding another does not hand out an id that is still on
 * screen. Ids outlive positions: an opening remembers the part it sits on.
 */
export function nextPartId(room: Room): string {
  let number = room.parts.length + 1;
  while (room.parts.some((part) => part.id === `${room.id}-part-${number}`)) {
    number += 1;
  }
  return `${room.id}-part-${number}`;
}

export function roomBounds(room: Room): AxisAlignedRect {
  return (
    turnedUnionBounds(room.parts) ?? {
      origin: { xMeters: 0, zMeters: 0 },
      widthMeters: 0,
      depthMeters: 0,
    }
  );
}

/** The part described by its center, for the theorems and the drawing. */
export function roomPartRect(part: RoomPart): OrientedRect {
  return turnedRectAsOriented(part);
}

export function roomPartCorners(part: RoomPart): readonly FloorPoint[] {
  return turnedRectCorners(part);
}

export function roomPartContains(part: RoomPart, point: FloorPoint): boolean {
  return turnedRectContains(part, point);
}

/** A floor point in the part's own frame, measured from its anchor corner. */
export function pointInRoomPart(part: RoomPart, point: FloorPoint): FloorPoint {
  return turnedRectLocalPoint(part, point);
}

/** The same point put back into floor coordinates. */
export function pointOnRoomPart(part: RoomPart, local: FloorPoint): FloorPoint {
  return turnedRectFloorPoint(part, local);
}

export function checkRoomLength(
  meters: number,
  dimension: RoomDimension,
): LengthProblem | null {
  return checkLength(meters, ROOM_LENGTH_LIMITS[dimension]);
}

export function isValidRoom(room: Room): boolean {
  return (
    room.parts.length > 0 &&
    checkRoomLength(room.heightMeters, "heightMeters") === null &&
    room.parts.every(
      (part) =>
        checkRoomLength(part.widthMeters, "widthMeters") === null &&
        checkRoomLength(part.depthMeters, "depthMeters") === null,
    ) &&
    room.openings.every((opening) => checkOpening(room, opening) === null)
  );
}

/** Compatibility editor for the first part and the room-level height. */
export function withRoomLength(
  room: Room,
  dimension: RoomDimension,
  meters: number,
): Room {
  if (dimension === "heightMeters") {
    return { ...room, heightMeters: meters };
  }
  return withRoomPartLength(room, primaryRoomPart(room).id, dimension, meters);
}

export function withRoomPartLength(
  room: Room,
  partId: string,
  dimension: RoomPartDimension,
  meters: number,
): Room {
  return withRoomPart(room, partId, (part) => ({
    ...part,
    [dimension]: meters,
  }));
}

export function withRoomPartOrigin(
  room: Room,
  partId: string,
  origin: FloorPoint,
): Room {
  return withRoomPart(room, partId, (part) => ({ ...part, origin }));
}

/**
 * Turns one part in place: its center holds still and the anchor corner is
 * recomputed to follow, the way a turned sofa spins where it stands. The X
 * and Y fields keep reading a physical corner — it travels with the turn.
 */
export function withRoomPartRotation(
  room: Room,
  partId: string,
  rotationRadians: number,
): Room {
  return withRoomPart(room, partId, (part) => {
    const half = {
      xMeters: part.widthMeters / 2,
      zMeters: part.depthMeters / 2,
    };
    const center = pointOnRoomPart(part, half);
    const turned = { ...part, rotationRadians };
    const moved = pointOnRoomPart(turned, half);
    return {
      ...turned,
      origin: {
        xMeters: part.origin.xMeters + (center.xMeters - moved.xMeters),
        zMeters: part.origin.zMeters + (center.zMeters - moved.zMeters),
      },
    };
  });
}

export function withRoomPart(
  room: Room,
  partId: string,
  change: (part: RoomPart) => RoomPart,
): Room {
  return {
    ...room,
    parts: room.parts.map((part) => (part.id === partId ? change(part) : part)),
  };
}

export function withParts(room: Room, parts: readonly RoomPart[]): Room {
  return { ...room, parts };
}

export function withOpenings(room: Room, openings: readonly Opening[]): Room {
  return { ...room, openings };
}

/** Moves the entire room so its union bounds begin at `origin`. */
export function withOrigin(room: Room, origin: FloorPoint): Room {
  const current = roomBounds(room).origin;
  const dx = origin.xMeters - current.xMeters;
  const dz = origin.zMeters - current.zMeters;
  return {
    ...room,
    parts: room.parts.map((part) => ({
      ...part,
      origin: {
        xMeters: part.origin.xMeters + dx,
        zMeters: part.origin.zMeters + dz,
      },
    })),
  };
}

export type RoomEdge = "north" | "east" | "south" | "west";

export function resizeRoomPartEdge(
  room: Room,
  partId: string,
  edge: RoomEdge,
  positionMeters: number,
): Room {
  return withRoomPart(room, partId, (part) =>
    resizePartEdge(part, edge, positionMeters),
  );
}

export function resizeRoomEdge(
  room: Room,
  edge: RoomEdge,
  positionMeters: number,
): Room {
  return resizeRoomPartEdge(
    room,
    primaryRoomPart(room).id,
    edge,
    positionMeters,
  );
}

/**
 * Resizes one edge of a turned part to where a floor point lands in its own
 * frame. The edges keep their local names — "west" is the edge the anchor
 * corner sits on however the part is turned — and moving the west or north
 * edge slides the anchor along the turned axis so the rest of the part stays
 * put, exactly as it does for an unturned one.
 */
export function resizeRoomPartEdgeToPoint(
  room: Room,
  partId: string,
  edge: RoomEdge,
  point: FloorPoint,
  roundMeters: (meters: number) => number = (meters) => meters,
): Room {
  return withRoomPart(room, partId, (part) => {
    const local = pointInRoomPart(part, point);
    const smallest = ROOM_LENGTH_LIMITS.widthMeters.minMeters;
    switch (edge) {
      case "west": {
        const shift = Math.min(
          roundMeters(local.xMeters),
          part.widthMeters - smallest,
        );
        return {
          ...part,
          origin: pointOnRoomPart(part, { xMeters: shift, zMeters: 0 }),
          widthMeters: part.widthMeters - shift,
        };
      }
      case "east":
        return {
          ...part,
          widthMeters: Math.max(smallest, roundMeters(local.xMeters)),
        };
      case "north": {
        const shift = Math.min(
          roundMeters(local.zMeters),
          part.depthMeters - smallest,
        );
        return {
          ...part,
          origin: pointOnRoomPart(part, { xMeters: 0, zMeters: shift }),
          depthMeters: part.depthMeters - shift,
        };
      }
      case "south":
        return {
          ...part,
          depthMeters: Math.max(smallest, roundMeters(local.zMeters)),
        };
    }
  });
}

function resizePartEdge(
  part: RoomPart,
  edge: RoomEdge,
  positionMeters: number,
): RoomPart {
  const smallest = ROOM_LENGTH_LIMITS.widthMeters.minMeters;
  switch (edge) {
    case "west": {
      const east = part.origin.xMeters + part.widthMeters;
      const xMeters = Math.min(positionMeters, east - smallest);
      return {
        ...part,
        origin: { ...part.origin, xMeters },
        widthMeters: east - xMeters,
      };
    }
    case "east":
      return {
        ...part,
        widthMeters: Math.max(smallest, positionMeters - part.origin.xMeters),
      };
    case "north": {
      const south = part.origin.zMeters + part.depthMeters;
      const zMeters = Math.min(positionMeters, south - smallest);
      return {
        ...part,
        origin: { ...part.origin, zMeters },
        depthMeters: south - zMeters,
      };
    }
    case "south":
      return {
        ...part,
        depthMeters: Math.max(smallest, positionMeters - part.origin.zMeters),
      };
  }
}

export function roomEdgePosition(room: Room, edge: RoomEdge): number {
  const bounds = roomBounds(room);
  switch (edge) {
    case "west":
      return bounds.origin.xMeters;
    case "east":
      return bounds.origin.xMeters + bounds.widthMeters;
    case "north":
      return bounds.origin.zMeters;
    case "south":
      return bounds.origin.zMeters + bounds.depthMeters;
  }
}

export function roomFloorAreaSquareMeters(room: Room): number {
  return turnedUnionArea(room.parts);
}
