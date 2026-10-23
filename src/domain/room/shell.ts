/**
 * The room as a solid: floor slabs and wall slabs, in floor coordinates,
 * ready to be stood up.
 *
 * This is the perspective view's whole input, and it is computed here rather
 * than in the scene so that it can be tested without a renderer, and so the
 * scene never has an opinion about where a wall is. Everything comes from
 * the same functions the plan draws with: a part's polygon for its floor,
 * `wallStretches` for which lengths of each side actually carry a wall, and
 * the room's own height for how far up they go. One Three.js unit is one
 * meter, X runs east and Z runs south, exactly as on the plan, so a point
 * here is a point there.
 */

import type { FloorPoint } from "@/domain/geometry";
import type { Floor } from "./floor";
import {
  checkOpening,
  openingEndpoints,
  openingHeights,
  partWallSides,
  wallOutwardNormalOnFloor,
} from "./openings";
import {
  partWallSegment,
  pointOnRoomPart,
  roomBounds,
  roomContains,
  roomPartPolygon,
  type Room,
} from "./room";
import { wallStretches } from "./walls";

export type FloorSlab = {
  readonly roomId: string;
  readonly partId: string;
  /** The part's outline on the floor, in floor coordinates. */
  readonly polygon: readonly FloorPoint[];
};

/**
 * One straight run of wall, as a box.
 *
 * `center` is the box's center on the floor, already pushed outward by half
 * the thickness: the wall stands outside the floor it bounds, which is what
 * keeps the room's inside dimensions the ones that were measured. `angle`
 * turns the box's length axis from east to the wall's direction, about Y,
 * the same sense as a part's rotation.
 */
export type WallSlab = {
  readonly roomId: string;
  readonly partId: string;
  readonly center: FloorPoint;
  readonly lengthMeters: number;
  readonly thicknessMeters: number;
  readonly heightMeters: number;
  /**
   * How far up the box starts: zero for a run of wall, the head of an
   * opening for the lintel over it, the floor for the wall under a window.
   */
  readonly baseMeters: number;
  readonly angleRadians: number;
  /**
   * Whether there is floor on the other side: a wall between two rooms, or
   * round a closet. The perspective view lets you see through these always,
   * so a room is never hidden behind the one in front of it.
   */
  readonly interior: boolean;
};

export type RoomShell = {
  readonly floors: readonly FloorSlab[];
  readonly walls: readonly WallSlab[];
};

export function apartmentShell(floor: Floor): RoomShell {
  const shells = floor.rooms.map((room) => roomShell(floor, room));
  return {
    floors: shells.flatMap((shell) => shell.floors),
    walls: shells.flatMap((shell) => shell.walls),
  };
}

export function roomShell(floor: Floor, room: Room): RoomShell {
  const cuts = openingCuts(floor);
  const floors: FloorSlab[] = room.parts.map((part) => ({
    roomId: room.id,
    partId: part.id,
    polygon: roomPartPolygon(part),
  }));

  const walls: WallSlab[] = room.parts.flatMap((part) =>
    partWallSides(part).flatMap((wall) => {
      const segment = partWallSegment(part, wall);
      const from = pointOnRoomPart(part, segment.from);
      const to = pointOnRoomPart(part, segment.to);
      const length = Math.hypot(
        to.xMeters - from.xMeters,
        to.zMeters - from.zMeters,
      );
      if (length === 0) {
        return [];
      }
      const direction = {
        dx: (to.xMeters - from.xMeters) / length,
        dz: (to.zMeters - from.zMeters) / length,
      };
      const outward = wallOutwardNormalOnFloor(part, wall);

      return wallStretches(floor, room, part, wall)
        .filter((stretch) => stretch.kind === "wall")
        .flatMap((stretch) => {
          const half = stretch.thicknessMeters / 2;
          const interior = floorBeyond(
            floor,
            from,
            direction,
            outward,
            (stretch.startMeters + stretch.endMeters) / 2,
            stretch.thicknessMeters,
          );
          const piece = (
            startMeters: number,
            endMeters: number,
            baseMeters: number,
            topMeters: number,
          ): WallSlab => {
            const mid = (startMeters + endMeters) / 2;
            return {
              roomId: room.id,
              partId: part.id,
              center: {
                xMeters: from.xMeters + direction.dx * mid + outward.dx * half,
                zMeters: from.zMeters + direction.dz * mid + outward.dz * half,
              },
              lengthMeters: endMeters - startMeters,
              thicknessMeters: stretch.thicknessMeters,
              heightMeters: topMeters - baseMeters,
              baseMeters,
              angleRadians: Math.atan2(direction.dz, direction.dx),
              interior,
            };
          };
          return cutWall(
            stretch.startMeters,
            stretch.endMeters,
            room.heightMeters,
            cutsAlong(cuts, from, direction, outward, stretch),
            piece,
          );
        });
    }),
  );

  return { floors, walls };
}

/** An opening as a hole: its doorway line on the floor, and how high it runs. */
type OpeningCut = {
  readonly start: FloorPoint;
  readonly end: FloorPoint;
  readonly sillMeters: number;
  readonly headMeters: number;
};

/**
 * Every opening on the floor that can be drawn, as a hole. One that cannot
 * stand where it is — off its wall, on an open side — is left uncut rather
 * than cut somewhere it is not.
 */
function openingCuts(floor: Floor): readonly OpeningCut[] {
  return floor.rooms.flatMap((room) =>
    room.openings.flatMap((opening) => {
      const problem = checkOpening(room, opening);
      if (
        problem === "not-a-number" ||
        problem === "off-wall" ||
        problem === "open-wall"
      ) {
        return [];
      }
      // Endpoints come relative to the room's corner, as the plan reads them;
      // the shell is in floor coordinates, so the corner goes back on.
      const { start, end } = openingEndpoints(room, opening);
      const corner = roomBounds(room).origin;
      const onFloor = (point: FloorPoint) => ({
        xMeters: point.xMeters + corner.xMeters,
        zMeters: point.zMeters + corner.zMeters,
      });
      return [
        {
          start: onFloor(start),
          end: onFloor(end),
          ...openingHeights(opening),
        },
      ];
    }),
  );
}

/**
 * The openings that pass through one stretch of wall, as ranges along it.
 *
 * Found by where they are rather than whose they are: an opening's doorway
 * line lies on the inside face of its own wall, and on a wall shared with
 * the next room that face is one thickness from the other room's — so any
 * opening whose line runs along this stretch, no farther off than the wall
 * is thick, goes through it. That is how a door cut in a shared wall opens
 * both rooms' copies of it, windows included, without either knowing whose
 * door it is.
 */
function cutsAlong(
  cuts: readonly OpeningCut[],
  from: FloorPoint,
  direction: { dx: number; dz: number },
  outward: { dx: number; dz: number },
  stretch: { startMeters: number; endMeters: number; thicknessMeters: number },
): readonly { start: number; end: number; sill: number; head: number }[] {
  const along = (point: FloorPoint) =>
    (point.xMeters - from.xMeters) * direction.dx +
    (point.zMeters - from.zMeters) * direction.dz;
  const off = (point: FloorPoint) =>
    Math.abs(
      (point.xMeters - from.xMeters) * outward.dx +
        (point.zMeters - from.zMeters) * outward.dz,
    );
  const reach = stretch.thicknessMeters + EPSILON;
  return cuts.flatMap((cut) => {
    if (off(cut.start) > reach || off(cut.end) > reach) {
      return [];
    }
    const a = along(cut.start);
    const b = along(cut.end);
    const start = Math.max(Math.min(a, b), stretch.startMeters);
    const end = Math.min(Math.max(a, b), stretch.endMeters);
    return end - start > EPSILON
      ? [{ start, end, sill: cut.sillMeters, head: cut.headMeters }]
      : [];
  });
}

/**
 * A stretch of wall with holes in it, as boxes: full height between the
 * holes, a lintel over each from its head to the ceiling, and under a window
 * the wall up to its sill. Nothing is drawn where nothing is left — a head at
 * the ceiling has no lintel, a door has no sill wall.
 */
function cutWall<T>(
  startMeters: number,
  endMeters: number,
  heightMeters: number,
  cuts: readonly { start: number; end: number; sill: number; head: number }[],
  piece: (start: number, end: number, base: number, top: number) => T,
): T[] {
  const pieces: T[] = [];
  let cursor = startMeters;
  for (const cut of [...cuts].sort((a, b) => a.start - b.start)) {
    if (cut.start - cursor > EPSILON) {
      pieces.push(piece(cursor, cut.start, 0, heightMeters));
    }
    cursor = Math.max(cursor, cut.end);
    const sill = Math.min(Math.max(cut.sill, 0), heightMeters);
    const head = Math.min(Math.max(cut.head, sill), heightMeters);
    if (sill > EPSILON) {
      pieces.push(piece(cut.start, cut.end, 0, sill));
    }
    if (heightMeters - head > EPSILON) {
      pieces.push(piece(cut.start, cut.end, head, heightMeters));
    }
  }
  if (endMeters - cursor > EPSILON) {
    pieces.push(piece(cursor, endMeters, 0, heightMeters));
  }
  return pieces;
}

/**
 * Whether any room's floor lies just past a wall's outer face, at the middle
 * of the stretch: another room one wall thickness away, or this room's own
 * floor carrying on beyond a closet's wall.
 */
function floorBeyond(
  floor: Floor,
  from: FloorPoint,
  direction: { dx: number; dz: number },
  outward: { dx: number; dz: number },
  alongMeters: number,
  thicknessMeters: number,
): boolean {
  const past = thicknessMeters + BEYOND_WALL_METERS;
  const point = {
    xMeters: from.xMeters + direction.dx * alongMeters + outward.dx * past,
    zMeters: from.zMeters + direction.dz * alongMeters + outward.dz * past,
  };
  return floor.rooms.some((room) => roomContains(room, point));
}

/** A hair past the outer face, to ask whether there is floor there. */
const BEYOND_WALL_METERS = 0.01;

const EPSILON = 1e-6;
