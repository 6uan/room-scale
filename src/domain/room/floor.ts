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

import type { FloorExtent, FloorPoint } from "@/domain/geometry";
import { metersFromInches } from "@/domain/units";
import {
  ROOM_LENGTH_LIMITS,
  createRoom,
  primaryRoomPart,
  resizeRoomEdge,
  resizeRoomPartEdge,
  roomBounds,
  roomFloorAreaSquareMeters,
  roomPartContains,
  withRoomPart,
  type Room,
  type RoomEdge,
  type RoomPart,
} from "./room";

export type Floor = {
  /**
   * Two thicknesses, not one: the shell is thicker than the partitions, and
   * it is visible in every plan ever drawn. Which walls are which is derived
   * from the rooms — a wall is interior where another room stands on its far
   * side — so nobody types it twice. See `walls.ts`.
   *
   * These are **defaults**. A room may declare its own; see `Room`. Read them
   * through `exteriorThicknessMeters` and `interiorThicknessMeters` rather
   * than directly, so an override is never quietly skipped.
   */
  readonly exteriorWallThicknessMeters: number;
  readonly interiorWallThicknessMeters: number;
  readonly rooms: readonly Room[];
};

/**
 * An apartment nobody has measured yet.
 *
 * It used to ship a 14'×12' living room with a door and a window already in
 * it, and that was a fiction: you landed on measurements nobody took, in a
 * room nobody lives in, and the first real job was deleting it. Two numbers
 * are all a new floor can honestly assert — how thick its walls are going to
 * be — and even those are only defaults waiting to be corrected.
 */
export const DEFAULT_FLOOR: Floor = {
  // 8 inches for the shell: a masonry or double-stud exterior wall, which is
  // what an apartment is actually wrapped in. It read 4.5" for a while, which
  // was a migration artifact rather than a measurement — the one old number
  // copied into both slots — and it made every plan draw a stud partition
  // where its outside wall belongs.
  exteriorWallThicknessMeters: metersFromInches(8),
  // 4.5 inches — a 2x4 stud wall with drywall on both faces.
  interiorWallThicknessMeters: metersFromInches(4.5),
  rooms: [],
};

/**
 * What a wall is allowed to be, in meters.
 *
 * Two centimeters is a partition of glass or a folding screen; sixty is a
 * castle. Anything outside that is a typo, and the point of a limit is to
 * catch the decimal point somebody lost rather than to have an opinion about
 * construction.
 */
export const WALL_THICKNESS_LIMITS = { minMeters: 0.02, maxMeters: 0.6 };

/** What this room's shell is built of: its own number, or the apartment's. */
export function exteriorThicknessMeters(floor: Floor, room: Room | null) {
  return room?.exteriorWallThicknessMeters ?? floor.exteriorWallThicknessMeters;
}

/** What this room's partitions are built of: its own number, or the floor's. */
export function interiorThicknessMeters(floor: Floor, room: Room | null) {
  return room?.interiorWallThicknessMeters ?? floor.interiorWallThicknessMeters;
}

/**
 * The partition standing between two rooms: **the thicker of what they each
 * declare.**
 *
 * There is one wall between two rooms and two numbers claiming it, so
 * something has to pick. Three rules were available and this is the one that
 * holds up:
 *
 * - **The mean** invents a number nobody typed and no tape would ever find. A
 *   6" wall against a 4" one is not a 5" wall; it is one of the two.
 * - **The host room's** is not symmetric, and there is no host. Which of two
 *   rooms owns the wall between them is arbitrary, so the same pair of rooms
 *   would snap to a different gap depending on which one was dragged, and the
 *   drawing would change when you selected a different room.
 * - **The thicker** is symmetric, is always a number somebody actually
 *   measured and entered, and errs the safe way. If it is wrong, the wall is
 *   drawn fatter than it is and the rooms sit further apart than they are —
 *   which reports furniture as not fitting when it just fits, never the
 *   reverse. A tool whose whole point is dimensional honesty should fail
 *   toward "check this again", not toward "it'll be fine".
 *
 * `room` may be null for a room being drawn, which has no override yet.
 */
export function partitionThicknessMeters(
  floor: Floor,
  room: Room | null,
  other: Room,
): number {
  return Math.max(
    interiorThicknessMeters(floor, room),
    interiorThicknessMeters(floor, other),
  );
}

/** The fattest wall anywhere on the floor, defaults and overrides together. */
export function maxWallThicknessMeters(floor: Floor): number {
  return Math.max(
    floor.exteriorWallThicknessMeters,
    floor.interiorWallThicknessMeters,
    ...floor.rooms.flatMap((room) => [
      exteriorThicknessMeters(floor, room),
      interiorThicknessMeters(floor, room),
    ]),
  );
}

/** A floor point in one room's own frame, measured from its north-west corner. */
export function pointInRoom(room: Room, point: FloorPoint): FloorPoint {
  const origin = roomBounds(room).origin;
  return {
    xMeters: point.xMeters - origin.xMeters,
    zMeters: point.zMeters - origin.zMeters,
  };
}

/** The same point put back into floor coordinates. */
export function pointOnFloor(room: Room, point: FloorPoint): FloorPoint {
  const origin = roomBounds(room).origin;
  return {
    xMeters: point.xMeters + origin.xMeters,
    zMeters: point.zMeters + origin.zMeters,
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

  const bounds = floor.rooms.map(roomBounds);
  const lefts = bounds.map((room) => room.origin.xMeters);
  const tops = bounds.map((room) => room.origin.zMeters);
  const rights = bounds.map((room) => room.origin.xMeters + room.widthMeters);
  const bottoms = bounds.map((room) => room.origin.zMeters + room.depthMeters);

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
  return floor.rooms.filter((room) =>
    room.parts.some((part) => roomPartContains(part, point)),
  );
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
    (total, room) => total + roomFloorAreaSquareMeters(room),
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
  const bounds = roomBounds(room);

  // Each neighbour is approached across its own partition, which is the
  // thicker of what the two rooms declare. A floor of one thickness — which
  // is almost every floor — makes every candidate the same as it always was.
  const faces = (axis: "x" | "z") =>
    others.flatMap((one) =>
      squareParts(one).map((part) => ({
        start: partAxisStart(part, axis),
        length: partAxisLength(part, axis),
        thickness: partitionThicknessMeters(floor, room, one),
      })),
    );

  return {
    xMeters: snapAxis(origin.xMeters, bounds.widthMeters, faces("x")),
    zMeters: snapAxis(origin.zMeters, bounds.depthMeters, faces("z")),
  };
}

/**
 * The parts that offer a wall to snap to: the ones square to the plan.
 *
 * A turned part's edges do not lie on any axis line, so pretending its
 * bounding box is a wall would snap things flush against air. Meeting a
 * diagonal wall exactly is done by typing the number, which stays exact.
 */
function squareParts(room: Room): readonly RoomPart[] {
  return room.parts.filter((part) => part.rotationRadians === 0);
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

  const room = createRoom(id, name, { xMeters: west, zMeters: north });
  const part = primaryRoomPart(room);
  return withRoomPart(room, part.id, (one) => ({
    ...one,
    widthMeters: Math.max(minimum, (xs[1] ?? 0) - west),
    depthMeters: Math.max(minimum, (zs[1] ?? 0) - north),
  }));
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
 * `moving` is the room whose edge this is — left out while a room is being
 * drawn, because a room that does not exist yet has nothing to declare and
 * takes the floor's thickness. It also keeps a room being redrawn from
 * snapping to itself.
 */
export function snapRoomEdge(
  floor: Floor,
  axis: "x" | "z",
  value: number,
  moving?: Room,
): number {
  const others = floor.rooms.filter((one) => one.id !== moving?.id);

  const candidates = others.flatMap((room) => {
    const thickness = partitionThicknessMeters(floor, moving ?? null, room);
    return squareParts(room).flatMap((part) => {
      const start = partAxisStart(part, axis);
      const end = start + partAxisLength(part, axis);
      return [start - thickness, end + thickness, start, end];
    });
  });

  return nearestSnap(value, candidates);
}

/**
 * Resizes one room edge with the same neighboring-face snap used while drawing.
 *
 * Canvas handles and inspector scrubbers both call this so pointer resizing has
 * one spatial rule. Typed dimensions deliberately keep using `withRoomLength`:
 * a number somebody entered is exact rather than an approximate pointer intent.
 */
export function snapRoomResize(
  floor: Floor,
  room: Room,
  edge: RoomEdge,
  positionMeters: number,
): Room {
  const axis = edge === "west" || edge === "east" ? "x" : "z";
  return resizeRoomEdge(
    room,
    edge,
    snapRoomEdge(floor, axis, positionMeters, room),
  );
}

/**
 * Resizes one part against every other visible part edge.
 *
 * Parts in the same room meet directly because no wall exists at their seam.
 * Parts in another room keep the floor's wall thickness, matching ordinary
 * room resizing.
 *
 * The part being resized must be square to the plan: `positionMeters` is an
 * axis position, which a turned edge never lies on. A turned part resizes
 * through `resizeRoomPartEdgeToPoint`, unsnapped.
 */
export function snapRoomPartResize(
  floor: Floor,
  room: Room,
  partId: string,
  edge: RoomEdge,
  positionMeters: number,
): Room {
  const axis = edge === "west" || edge === "east" ? "x" : "z";
  return resizeRoomPartEdge(
    room,
    partId,
    edge,
    snapPartEdge(floor, room, partId, axis, positionMeters),
  );
}

/**
 * A dragged part origin, snapped flush to its siblings and neighbouring rooms.
 *
 * A turned part is left exactly where the hand put it: its own edges are not
 * axis lines, so none of the axis candidates would mean a shared wall.
 */
export function snapRoomPartOrigin(
  floor: Floor,
  room: Room,
  part: RoomPart,
  origin: FloorPoint,
): FloorPoint {
  if (part.rotationRadians !== 0) {
    return origin;
  }
  return {
    xMeters: snapPartOriginAxis(
      floor,
      room,
      part.id,
      "x",
      origin.xMeters,
      part.widthMeters,
    ),
    zMeters: snapPartOriginAxis(
      floor,
      room,
      part.id,
      "z",
      origin.zMeters,
      part.depthMeters,
    ),
  };
}

function snapPartEdge(
  floor: Floor,
  mine: Room,
  partId: string,
  axis: "x" | "z",
  value: number,
): number {
  const candidates = floor.rooms.flatMap((room) => {
    const thickness = partitionThicknessMeters(floor, mine, room);
    return squareParts(room).flatMap((part) => {
      if (room.id === mine.id && part.id === partId) {
        return [];
      }
      const start = partAxisStart(part, axis);
      const end = start + partAxisLength(part, axis);
      // Sections of the same room meet directly: no wall stands at a seam.
      return room.id === mine.id
        ? [start, end]
        : [start - thickness, end + thickness, start, end];
    });
  });
  return nearestSnap(value, candidates);
}

function snapPartOriginAxis(
  floor: Floor,
  mine: Room,
  partId: string,
  axis: "x" | "z",
  value: number,
  length: number,
): number {
  const candidates = floor.rooms.flatMap((room) => {
    const thickness = partitionThicknessMeters(floor, mine, room);
    return squareParts(room).flatMap((part) => {
      if (room.id === mine.id && part.id === partId) {
        return [];
      }
      const start = partAxisStart(part, axis);
      const theirs = partAxisLength(part, axis);
      return room.id === mine.id
        ? [start + theirs, start - length, start, start + theirs - length]
        : [
            start + theirs + thickness,
            start - thickness - length,
            start,
            start + theirs - length,
          ];
    });
  });
  return nearestSnap(value, candidates);
}

function partAxisStart(part: RoomPart, axis: "x" | "z"): number {
  return axis === "x" ? part.origin.xMeters : part.origin.zMeters;
}

function partAxisLength(part: RoomPart, axis: "x" | "z"): number {
  return axis === "x" ? part.widthMeters : part.depthMeters;
}

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

/** One axis of the snap: the candidates, nearest first, or the value as given. */
function snapAxis(
  value: number,
  length: number,
  others: readonly { start: number; length: number; thickness: number }[],
): number {
  const candidates = others.flatMap(({ start, length: theirs, thickness }) => [
    // Sharing a wall: a thickness past their far edge, or before their near one.
    start + theirs + thickness,
    start - thickness - length,
    // Lining up: the same near edge, or the same far edge.
    start,
    start + theirs - length,
  ]);

  return nearestSnap(value, candidates);
}
