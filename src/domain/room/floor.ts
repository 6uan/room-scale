/**
 * The apartment: rectangular rooms laid out on one floor.
 *
 * A room is a building block — a rectangle with a name, a size, and a place to
 * stand. The floor holds them and the things true of all of them, such as how
 * thick the walls are.
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
 * Everything on the floor — a room's corner or a piece of furniture — is in
 * floor coordinates. A room's origin is its north-west corner, and its own
 * walls and openings are placed relative to that, but nothing else is:
 * furniture belongs to the floor, and which room it is in is worked out from
 * where it sits.
 */

import type { FloorExtent, FloorPoint, OrientedRect } from "@/domain/geometry";
import {
  DEFAULT_ROOM,
  ROOM_LENGTH_LIMITS,
  createRoom,
  type Room,
} from "./room";

export type Floor = {
  /** One thickness for the whole apartment: it has one kind of wall. */
  readonly wallThicknessMeters: number;
  readonly rooms: readonly Room[];
};

/** One living room, which is where every apartment plan starts. */
export const DEFAULT_FLOOR: Floor = {
  // 4.5 inches: a 2x4 stud wall with drywall on both faces.
  wallThicknessMeters: 0.1143,
  rooms: [DEFAULT_ROOM],
};

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

/**
 * How near a room has to be to share a wall before it is taken to mean it.
 *
 * Four inches: further than a fat finger on a trackpad, closer than anything
 * anybody types on purpose. Rooms are laid out by typing a number, and the
 * number that shares a wall is the neighbour's edge plus a wall thickness —
 * arithmetic nobody should have to do to get two rooms to touch.
 */
export const SNAP_METERS = 0.1016;

/**
 * The origin a room would take if it were let go here.
 *
 * Snaps to two things, on each axis independently: sharing a wall with a
 * neighbour, and lining up with one. Sharing wins, because it is the one that
 * makes an apartment rather than a diagram — two rooms a wall thickness apart
 * have their wall bands in exactly the same place, so one doorway cut in it
 * opens through both.
 *
 * Anything further than `SNAP_METERS` from either is left exactly where it was
 * put. A tool that will not let you place a room where you meant is worse than
 * one that makes you type.
 */
export function snapRoomOrigin(
  floor: Floor,
  room: Room,
  origin: FloorPoint,
): FloorPoint {
  const others = floor.rooms.filter((one) => one.id !== room.id);
  const thickness = floor.wallThicknessMeters;

  return {
    xMeters: snapAxis(
      origin.xMeters,
      room.widthMeters,
      others.map((one) => ({
        start: one.origin.xMeters,
        length: one.widthMeters,
      })),
      thickness,
    ),
    zMeters: snapAxis(
      origin.zMeters,
      room.depthMeters,
      others.map((one) => ({
        start: one.origin.zMeters,
        length: one.depthMeters,
      })),
      thickness,
    ),
  };
}

/**
 * A room from two opposite corners, as dragged out on the plan.
 *
 * Both corners snap independently — see `snapRoomEdge` — so a rectangle
 * dragged up against a neighbour shares its wall without anybody working out
 * the neighbour's edge plus a thickness. Then they are sorted into a
 * north-west origin and a size, because a drag runs in whatever direction the
 * hand went and a room does not.
 *
 * Held to the minimum a room is allowed to be. A rectangle two centimeters
 * across is a slip rather than a cupboard, and the alternative — refusing it —
 * would mean a drag that produced nothing and said nothing about why.
 */
export function drawnRoom(
  floor: Floor,
  id: string,
  name: string,
  from: FloorPoint,
  to: FloorPoint,
): Room {
  const xs = [
    snapRoomEdge(floor, "x", from.xMeters),
    snapRoomEdge(floor, "x", to.xMeters),
  ].sort((a, b) => a - b);
  const zs = [
    snapRoomEdge(floor, "z", from.zMeters),
    snapRoomEdge(floor, "z", to.zMeters),
  ].sort((a, b) => a - b);

  const west = xs[0] ?? 0;
  const north = zs[0] ?? 0;
  const minimum = ROOM_LENGTH_LIMITS.widthMeters.minMeters;

  return {
    ...createRoom(id, name, { xMeters: west, zMeters: north }),
    widthMeters: Math.max(minimum, (xs[1] ?? 0) - west),
    depthMeters: Math.max(minimum, (zs[1] ?? 0) - north),
  };
}

/**
 * Where one edge of a room being **drawn** would land.
 *
 * Different question from `snapRoomOrigin`, which moves a room of a known size:
 * a rectangle being dragged out has two corners that move independently, and
 * neither of them carries a length. So this snaps a single coordinate, and the
 * drawing snaps both of its corners with it.
 *
 * The candidates are a neighbour's own face — for a room drawn flush inside a
 * space — and a wall thickness beyond it, which is the one that shares a wall.
 * Sharing is listed first so it wins a tie, for the reason `snapRoomOrigin`
 * gives: two rooms a wall apart have their bands in the same place, so one
 * doorway cut in it opens through both.
 *
 * `exceptRoomId` keeps a room being redrawn from snapping to itself.
 */
export function snapRoomEdge(
  floor: Floor,
  axis: "x" | "z",
  value: number,
  exceptRoomId?: string,
): number {
  const thickness = floor.wallThicknessMeters;
  const others = floor.rooms.filter((one) => one.id !== exceptRoomId);

  const candidates = others.flatMap((room) => {
    const start = axis === "x" ? room.origin.xMeters : room.origin.zMeters;
    const end = start + (axis === "x" ? room.widthMeters : room.depthMeters);
    return [
      // Sharing a wall with it: a thickness clear of either face.
      start - thickness,
      end + thickness,
      // Flush against it, which is what a room drawn inside another wants.
      start,
      end,
    ];
  });

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

/** One axis of the snap: the candidates, nearest first, or the value as given. */
function snapAxis(
  value: number,
  length: number,
  others: readonly { start: number; length: number }[],
  thickness: number,
): number {
  const candidates = others.flatMap(({ start, length: theirs }) => [
    // Sharing a wall: a thickness past their far edge, or before their near one.
    start + theirs + thickness,
    start - thickness - length,
    // Lining up: the same near edge, or the same far edge.
    start,
    start + theirs - length,
  ]);

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
