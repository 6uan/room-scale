/**
 * The apartment: rectangular rooms laid out on one floor.
 *
 * A room is a building block — a rectangle with a name, a size, and a place to
 * stand. The floor holds them and the things true of all of them: how thick the
 * walls are, and the routes that have to stay walkable across them.
 *
 * ## Positions, not adjacency
 *
 * Each room carries its own origin, and nothing stops two of them overlapping.
 * Deriving shared walls from which rooms touch would be truer to a real plan
 * and far more work, and it would make every room's position depend on its
 * neighbours — move the hall and the bedroom follows it across the floor.
 *
 * Two blocks in the same place is a mistake, and it is reported in the same
 * list as every other mistake rather than being a state the editor refuses to
 * enter. That is the difference between building blocks and a jigsaw.
 *
 * ## One set of coordinates
 *
 * Everything on the floor — a room's corner, a piece of furniture, the end of a
 * walkway — is in floor coordinates. A room's origin is its north-west corner,
 * and its own walls and openings are placed relative to that, but nothing else
 * is: furniture belongs to the floor, and which room it is in is worked out
 * from where it sits.
 */

import type { FloorExtent, FloorPoint, OrientedRect } from "@/domain/geometry";
import { DEFAULT_ROOM, type Room } from "./room";
import type { Walkway } from "./walkways";

export type Floor = {
  /** One thickness for the whole apartment: it has one kind of wall. */
  readonly wallThicknessMeters: number;
  readonly rooms: readonly Room[];
  /** Routes that have to stay clear. They cross rooms, so they live here. */
  readonly walkways: readonly Walkway[];
};

/** One living room, which is where every apartment plan starts. */
export const DEFAULT_FLOOR: Floor = {
  // 4.5 inches: a 2x4 stud wall with drywall on both faces.
  wallThicknessMeters: 0.1143,
  rooms: [DEFAULT_ROOM],
  // Empty: a route is a fact about how a particular home is walked through, and
  // guessing one would put a band across a plan nobody asked for.
  walkways: [],
};

/** Where a new block goes: east of everything already on the floor. */
export function nextRoomOrigin(floor: Floor): FloorPoint {
  if (floor.rooms.length === 0) {
    return { xMeters: 0, zMeters: 0 };
  }
  const { origin, extent } = floorBounds(floor);
  return {
    xMeters: origin.xMeters + extent.widthMeters + floor.wallThicknessMeters,
    zMeters: origin.zMeters,
  };
}

/** The floor rectangle of one room, in floor coordinates. */
export function roomRect(room: Room): OrientedRect {
  return {
    center: {
      xMeters: room.origin.xMeters + room.widthMeters / 2,
      zMeters: room.origin.zMeters + room.depthMeters / 2,
    },
    widthMeters: room.widthMeters,
    depthMeters: room.depthMeters,
    // Rooms are square to the plan during the MVP. A turned room would change
    // nothing here and a great deal in the drawing.
    rotationRadians: 0,
  };
}

/** A floor point in one room's own frame, measured from its north-west corner. */
export function pointInRoom(room: Room, point: FloorPoint): FloorPoint {
  return {
    xMeters: point.xMeters - room.origin.xMeters,
    zMeters: point.zMeters - room.origin.zMeters,
  };
}

/** The same point put back into floor coordinates. */
export function pointOnFloor(room: Room, point: FloorPoint): FloorPoint {
  return {
    xMeters: point.xMeters + room.origin.xMeters,
    zMeters: point.zMeters + room.origin.zMeters,
  };
}

/**
 * The smallest rectangle holding every room, plus where it starts.
 *
 * This is what the plan view fits into its viewport. An empty floor has no
 * extent, and nothing to draw.
 */
export function floorBounds(floor: Floor): {
  readonly origin: FloorPoint;
  readonly extent: FloorExtent;
} {
  if (floor.rooms.length === 0) {
    return {
      origin: { xMeters: 0, zMeters: 0 },
      extent: { widthMeters: 0, depthMeters: 0 },
    };
  }

  const lefts = floor.rooms.map((room) => room.origin.xMeters);
  const tops = floor.rooms.map((room) => room.origin.zMeters);
  const rights = floor.rooms.map(
    (room) => room.origin.xMeters + room.widthMeters,
  );
  const bottoms = floor.rooms.map(
    (room) => room.origin.zMeters + room.depthMeters,
  );

  const west = Math.min(...lefts);
  const north = Math.min(...tops);

  return {
    origin: { xMeters: west, zMeters: north },
    extent: {
      widthMeters: Math.max(...rights) - west,
      depthMeters: Math.max(...bottoms) - north,
    },
  };
}

/** Every room a point falls inside. Usually one; two means they overlap. */
export function roomsAt(floor: Floor, point: FloorPoint): readonly Room[] {
  return floor.rooms.filter((room) => {
    const local = pointInRoom(room, point);
    return (
      local.xMeters >= 0 &&
      local.xMeters <= room.widthMeters &&
      local.zMeters >= 0 &&
      local.zMeters <= room.depthMeters
    );
  });
}

export function withRooms(floor: Floor, rooms: readonly Room[]): Floor {
  return { ...floor, rooms };
}

export function withFloorWalkways(
  floor: Floor,
  walkways: readonly Walkway[],
): Floor {
  return { ...floor, walkways };
}

/** Replaces one room by id, leaving the order alone. */
export function withRoom(floor: Floor, next: Room): Floor {
  return {
    ...floor,
    rooms: floor.rooms.map((room) => (room.id === next.id ? next : room)),
  };
}

/**
 * The total floor area of the apartment.
 *
 * Overlapping rooms are counted twice, which is wrong — and the overlap is
 * already reported as the mistake it is, so the number correcting itself would
 * hide the thing worth fixing.
 */
export function floorAreaSquareMeters(floor: Floor): number {
  return floor.rooms.reduce(
    (total, room) => total + room.widthMeters * room.depthMeters,
    0,
  );
}
