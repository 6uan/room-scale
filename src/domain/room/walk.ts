/**
 * Walking through the apartment at eye height: where a person can stand,
 * and where a step takes them.
 *
 * A person can stand on any room's floor, and in a doorway — the gap a door
 * or a passage cuts through the wall between two floors. Nowhere else: not
 * in a wall, not past a balcony's rail, not through a window. So walking
 * from the bedroom to the hall goes through the bedroom door, the way it
 * does in the apartment, and the question it answers is the one a plan
 * cannot: whether the way past the sofa is wide enough to walk.
 *
 * The walker is a circle, so they cannot slip past a wall's corner with
 * their middle while their shoulder goes through it, and a step that runs
 * into a wall slides along it rather than stopping dead.
 *
 * Furniture does not stop the walker: a rug is walked on, and a coffee
 * table is stepped round by a person, not by this. The plan's checks are
 * what say a piece is in the way.
 *
 * Pure: floor coordinates in, floor coordinates out.
 */

import {
  orientedRectContains,
  type FloorPoint,
  type OrientedRect,
} from "@/domain/geometry";
import { wallThicknessMeters, type Floor } from "./floor";
import {
  checkOpening,
  openingEndpoints,
  wallOutwardNormalOnFloor,
} from "./openings";
import {
  primaryRoomPart,
  roomBounds,
  roomContains,
  roomPart,
  roomPartPolygon,
} from "./room";

/** Where the camera stands while walking: a standing adult's eyes, 5' 3". */
export const EYE_HEIGHT_METERS = 1.6;

/** Half a person's width at the shoulder, about 8 inches. */
export const WALKER_RADIUS_METERS = 0.2;

/** How far past each face of the wall a doorway reaches, to meet both floors. */
const DOORWAY_OVERLAP_METERS = 0.05;

/** The points round the walker's edge that must all be on the floor. */
const EDGE_SAMPLES = 8;

/**
 * Every door and passage, as the patch of floor its gap through the wall
 * makes: as wide as the opening, as deep as the wall and a little more, so
 * it meets the floor on both sides. Windows are left out; an opening that
 * cannot stand where it is, is too.
 */
export function doorways(floor: Floor): readonly OrientedRect[] {
  return floor.rooms.flatMap((room) => {
    const corner = roomBounds(room).origin;
    const thickness = wallThicknessMeters(floor, room);
    return room.openings.flatMap((opening) => {
      const problem = checkOpening(room, opening);
      const part = roomPart(room, opening.partId);
      if (
        opening.kind === "window" ||
        part === undefined ||
        problem === "not-a-number" ||
        problem === "off-wall" ||
        problem === "open-wall"
      ) {
        return [];
      }
      // Endpoints come relative to the room's corner, as the plan reads them.
      const { start, end } = openingEndpoints(room, opening);
      const outward = wallOutwardNormalOnFloor(part, opening.wall);
      const across = {
        dx: end.xMeters - start.xMeters,
        dz: end.zMeters - start.zMeters,
      };
      return [
        {
          center: {
            xMeters:
              corner.xMeters +
              (start.xMeters + end.xMeters) / 2 +
              (outward.dx * thickness) / 2,
            zMeters:
              corner.zMeters +
              (start.zMeters + end.zMeters) / 2 +
              (outward.dz * thickness) / 2,
          },
          widthMeters: Math.hypot(across.dx, across.dz),
          depthMeters: thickness + DOORWAY_OVERLAP_METERS * 2,
          rotationRadians: Math.atan2(across.dz, across.dx),
        },
      ];
    });
  });
}

/** Whether a point is somewhere a person can stand: a floor, or a doorway. */
export function onWalkableFloor(
  floor: Floor,
  point: FloorPoint,
  openings: readonly OrientedRect[] = doorways(floor),
): boolean {
  return (
    floor.rooms.some((room) => roomContains(room, point)) ||
    openings.some((doorway) => orientedRectContains(doorway, point))
  );
}

/** Whether the whole walker fits where their middle would be. */
export function walkerFits(
  floor: Floor,
  center: FloorPoint,
  openings: readonly OrientedRect[] = doorways(floor),
  radius = WALKER_RADIUS_METERS,
): boolean {
  if (!onWalkableFloor(floor, center, openings)) {
    return false;
  }
  for (let index = 0; index < EDGE_SAMPLES; index += 1) {
    const angle = (index / EDGE_SAMPLES) * Math.PI * 2;
    const edge = {
      xMeters: center.xMeters + Math.cos(angle) * radius,
      zMeters: center.zMeters + Math.sin(angle) * radius,
    };
    if (!onWalkableFloor(floor, edge, openings)) {
      return false;
    }
  }
  return true;
}

/**
 * Where one step takes the walker: all the way if they fit there; else
 * along whichever of the two axes they still fit along, so walking into a
 * wall at an angle slides along it; else nowhere.
 */
export function walkStep(
  floor: Floor,
  from: FloorPoint,
  step: { readonly dx: number; readonly dz: number },
  openings: readonly OrientedRect[] = doorways(floor),
): FloorPoint {
  const tries: FloorPoint[] = [
    { xMeters: from.xMeters + step.dx, zMeters: from.zMeters + step.dz },
    { xMeters: from.xMeters + step.dx, zMeters: from.zMeters },
    { xMeters: from.xMeters, zMeters: from.zMeters + step.dz },
  ];
  return tries.find((to) => walkerFits(floor, to, openings)) ?? from;
}

/**
 * Where a walk starts: the point asked for, if a person fits there, or else
 * the middle of the first room's first section that has room for one. Null
 * on a floor with nowhere to stand.
 */
export function walkStart(
  floor: Floor,
  preferred: FloorPoint,
): FloorPoint | null {
  const openings = doorways(floor);
  if (walkerFits(floor, preferred, openings)) {
    return preferred;
  }
  for (const room of floor.rooms) {
    const polygon = roomPartPolygon(primaryRoomPart(room));
    const middle = {
      xMeters:
        polygon.reduce((sum, point) => sum + point.xMeters, 0) / polygon.length,
      zMeters:
        polygon.reduce((sum, point) => sum + point.zMeters, 0) / polygon.length,
    };
    if (walkerFits(floor, middle, openings)) {
      return middle;
    }
  }
  return null;
}
