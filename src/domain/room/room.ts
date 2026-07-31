/** A room built from one or more axis-aligned rectangular parts. */

import type { AxisAlignedRect, FloorPoint } from "@/domain/geometry";
import { rectUnionArea, rectUnionBounds } from "@/domain/geometry";
import {
  checkLength,
  metersFromInches,
  type LengthLimits,
  type LengthProblem,
} from "@/domain/units";
import { checkOpening, type Opening } from "./openings";

export type RoomPart = AxisAlignedRect & {
  readonly id: string;
};

export type Room = {
  readonly id: string;
  readonly name: string;
  readonly heightMeters: number;
  readonly parts: readonly RoomPart[];
  readonly openings: readonly Opening[];
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

const DEFAULT_PART: RoomPart = {
  id: "room-1-part-1",
  origin: {
    xMeters: -metersFromInches(84),
    zMeters: -metersFromInches(72),
  },
  widthMeters: metersFromInches(168),
  depthMeters: metersFromInches(144),
};

export const DEFAULT_ROOM: Room = {
  id: "room-1",
  name: "Living room",
  heightMeters: metersFromInches(96),
  parts: [DEFAULT_PART],
  openings: [
    {
      id: "door-1",
      kind: "door",
      partId: DEFAULT_PART.id,
      wall: "south",
      centerMeters: metersFromInches(36),
      widthMeters: metersFromInches(32),
      hinge: "start",
      swing: "inward",
    },
    {
      id: "window-1",
      kind: "window",
      partId: DEFAULT_PART.id,
      wall: "north",
      centerMeters: metersFromInches(84),
      widthMeters: metersFromInches(48),
    },
  ],
};

export function createRoomPart(
  id: string,
  origin: FloorPoint,
  widthMeters = metersFromInches(120),
  depthMeters = metersFromInches(120),
): RoomPart {
  return { id, origin, widthMeters, depthMeters };
}

export function createRoom(id: string, name: string, origin: FloorPoint): Room {
  return {
    id,
    name,
    heightMeters: DEFAULT_ROOM.heightMeters,
    parts: [createRoomPart(`${id}-part-1`, origin)],
    openings: [],
  };
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

export function roomBounds(room: Room): AxisAlignedRect {
  return (
    rectUnionBounds(room.parts) ?? {
      origin: { xMeters: 0, zMeters: 0 },
      widthMeters: 0,
      depthMeters: 0,
    }
  );
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
  return rectUnionArea(room.parts);
}
