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
/** A point on a wall's face: along it from its middle, and up from the floor. */
export type WallPoint = {
  readonly alongMeters: number;
  readonly upMeters: number;
};

export type WallSlab = {
  readonly roomId: string;
  readonly partId: string;
  readonly center: FloorPoint;
  readonly lengthMeters: number;
  readonly thicknessMeters: number;
  readonly heightMeters: number;
  readonly angleRadians: number;
  /**
   * The wall's face as one shape, around its edge: a rectangle the length
   * and height of the wall, with a notch up from the floor for each door
   * and down from the ceiling for an opening that reaches it. One shape, so
   * a doorway has no seams round it — the wall is not three boxes meeting.
   */
  readonly outline: readonly WallPoint[];
  /** Openings wholly inside the face: a window, between its sill and head. */
  readonly holes: readonly (readonly WallPoint[])[];
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
          return wallFaces(
            stretch.startMeters,
            stretch.endMeters,
            room.heightMeters,
            cutsAlong(cuts, from, direction, outward, stretch),
          ).map((face): WallSlab => {
            const mid = (face.startMeters + face.endMeters) / 2;
            return {
              roomId: room.id,
              partId: part.id,
              center: {
                xMeters: from.xMeters + direction.dx * mid + outward.dx * half,
                zMeters: from.zMeters + direction.dz * mid + outward.dz * half,
              },
              lengthMeters: face.endMeters - face.startMeters,
              thicknessMeters: stretch.thicknessMeters,
              heightMeters: room.heightMeters,
              angleRadians: Math.atan2(direction.dz, direction.dx),
              interior,
              outline: face.outline,
              holes: face.holes,
            };
          });
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

type Cut = { start: number; end: number; sill: number; head: number };

/**
 * A stretch of wall with openings in it, as faces: one shape per piece of
 * wall that stands on its own, with each opening cut out of it.
 *
 * An opening from the floor to the ceiling leaves nothing above or below it,
 * so it is the one thing that splits a stretch into separate faces. Every
 * other opening is cut out of the face it is in: a door as a notch up from
 * the floor, an opening that reaches the ceiling as a notch down from it,
 * and a window as a hole between its sill and its head. Openings that
 * overlap along the wall are taken as one, from the lower sill to the
 * higher head, so the face never has to cross itself.
 */
function wallFaces(
  startMeters: number,
  endMeters: number,
  heightMeters: number,
  cuts: readonly Cut[],
): readonly {
  startMeters: number;
  endMeters: number;
  outline: readonly WallPoint[];
  holes: readonly (readonly WallPoint[])[];
}[] {
  const merged = mergeCuts(
    cuts.map((cut) => {
      const sill = Math.min(Math.max(cut.sill, 0), heightMeters);
      return {
        start: cut.start,
        end: cut.end,
        sill,
        head: Math.min(Math.max(cut.head, sill), heightMeters),
      };
    }),
  );
  const fromFloor = (cut: Cut) => cut.sill <= EPSILON;
  const toCeiling = (cut: Cut) => cut.head >= heightMeters - EPSILON;

  // Split where an opening runs floor to ceiling: nothing joins the sides.
  const faces: { start: number; end: number; cuts: Cut[] }[] = [];
  let cursor = startMeters;
  let inside: Cut[] = [];
  for (const cut of merged) {
    if (fromFloor(cut) && toCeiling(cut)) {
      faces.push({ start: cursor, end: cut.start, cuts: inside });
      cursor = cut.end;
      inside = [];
    } else {
      inside.push(cut);
    }
  }
  faces.push({ start: cursor, end: endMeters, cuts: inside });

  return faces
    .filter((face) => face.end - face.start > EPSILON)
    .map((face) => {
      const middle = (face.start + face.end) / 2;
      const at = (along: number, up: number): WallPoint => ({
        alongMeters: along - middle,
        upMeters: up,
      });
      const atStart = (cut: Cut) => cut.start <= face.start + EPSILON;
      const atEnd = (cut: Cut) => cut.end >= face.end - EPSILON;
      const doors = face.cuts.filter(fromFloor);
      const tops = face.cuts.filter((cut) => !fromFloor(cut) && toCeiling(cut));
      const windows = face.cuts.filter(
        (cut) => !fromFloor(cut) && !toCeiling(cut),
      );

      // Round the edge: along the floor east, up the end, back along the
      // ceiling west, down the start — stepping round each notch on the way.
      // A notch at either end of the face takes that end's corner with it.
      const outline: WallPoint[] = [];
      const firstDoor = doors[0];
      outline.push(
        firstDoor !== undefined && atStart(firstDoor)
          ? at(face.start, firstDoor.head)
          : at(face.start, 0),
      );
      for (const door of doors) {
        if (!atStart(door)) {
          outline.push(at(door.start, 0), at(door.start, door.head));
        }
        if (atEnd(door)) {
          outline.push(at(face.end, door.head));
        } else {
          outline.push(at(door.end, door.head), at(door.end, 0));
        }
      }
      const lastDoor = doors.at(-1);
      if (lastDoor === undefined || !atEnd(lastDoor)) {
        outline.push(at(face.end, 0));
      }
      const lastTop = tops.at(-1);
      outline.push(
        lastTop !== undefined && atEnd(lastTop)
          ? at(face.end, lastTop.sill)
          : at(face.end, heightMeters),
      );
      for (const top of [...tops].reverse()) {
        if (!atEnd(top)) {
          outline.push(at(top.end, heightMeters), at(top.end, top.sill));
        }
        if (atStart(top)) {
          outline.push(at(face.start, top.sill));
        } else {
          outline.push(at(top.start, top.sill), at(top.start, heightMeters));
        }
      }
      const firstTop = tops[0];
      if (firstTop === undefined || !atStart(firstTop)) {
        outline.push(at(face.start, heightMeters));
      }

      return {
        startMeters: face.start,
        endMeters: face.end,
        outline: withoutRepeats(outline),
        holes: windows.map((window) => [
          at(window.start, window.sill),
          at(window.end, window.sill),
          at(window.end, window.head),
          at(window.start, window.head),
        ]),
      };
    });
}

/** Overlapping openings as one, sorted along the wall. */
function mergeCuts(cuts: readonly Cut[]): Cut[] {
  const sorted = [...cuts].sort((a, b) => a.start - b.start);
  const merged: Cut[] = [];
  for (const cut of sorted) {
    const last = merged.at(-1);
    if (last !== undefined && cut.start < last.end - EPSILON) {
      merged[merged.length - 1] = {
        start: last.start,
        end: Math.max(last.end, cut.end),
        sill: Math.min(last.sill, cut.sill),
        head: Math.max(last.head, cut.head),
      };
    } else {
      merged.push({ ...cut });
    }
  }
  return merged;
}

/** Drops a point that repeats the one before it, and the last if it is the first. */
function withoutRepeats(points: readonly WallPoint[]): WallPoint[] {
  const same = (a: WallPoint, b: WallPoint) =>
    Math.abs(a.alongMeters - b.alongMeters) < EPSILON &&
    Math.abs(a.upMeters - b.upMeters) < EPSILON;
  const kept = points.filter(
    (point, index) => index === 0 || !same(point, points[index - 1]!),
  );
  while (kept.length > 1 && same(kept[0]!, kept.at(-1)!)) {
    kept.pop();
  }
  return kept;
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
