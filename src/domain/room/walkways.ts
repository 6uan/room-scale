/**
 * Protected walkways: the routes across a room that have to stay walkable.
 *
 * A route is a line from one point on the floor to another, with a width you
 * need and a width you would like. That makes it a rectangle laid along the
 * line — the same oriented rectangle a footprint is — so asking whether a sofa
 * is standing in the hallway is a question the geometry already answers.
 *
 * Two widths rather than one, because "you cannot get through" and "you can get
 * through sideways" are different answers. Thirty-six inches is the width a
 * person and a laundry basket need; forty-two is the width that stops feeling
 * like a corridor.
 */

import type { FloorPoint, OrientedRect } from "@/domain/geometry";
import { metersFromInches } from "@/domain/units";
import type { Room } from "./room";

export type Walkway = {
  readonly id: string;
  /** What the route is for, in the reader's words: "To the guest room". */
  readonly name: string;
  readonly start: FloorPoint;
  readonly end: FloorPoint;
  /** Narrower than this and the route does not work. */
  readonly minimumWidthMeters: number;
  /** Narrower than this and it works, but you would rather it did not. */
  readonly preferredWidthMeters: number;
};

/** The widths from AGENTS.md: the route to the guest room, and every other. */
export const DEFAULT_MINIMUM_WALKWAY_METERS = metersFromInches(36);
export const DEFAULT_PREFERRED_WALKWAY_METERS = metersFromInches(42);

/** A route shorter than this is a point, and a point has no direction. */
export const MIN_WALKWAY_LENGTH_METERS = 0.1;

export type WalkwayProblem =
  | "not-a-number"
  /** The two ends are in the same place, so there is no route to protect. */
  | "too-short"
  | "preferred-below-minimum";

/** Why a walkway cannot be used, or null when it is fine. */
export function checkWalkway(walkway: Walkway): WalkwayProblem | null {
  const values = [
    walkway.start.xMeters,
    walkway.start.zMeters,
    walkway.end.xMeters,
    walkway.end.zMeters,
    walkway.minimumWidthMeters,
    walkway.preferredWidthMeters,
  ];
  if (!values.every(Number.isFinite)) {
    return "not-a-number";
  }
  if (walkwayLengthMeters(walkway) < MIN_WALKWAY_LENGTH_METERS) {
    return "too-short";
  }
  if (walkway.preferredWidthMeters < walkway.minimumWidthMeters) {
    return "preferred-below-minimum";
  }
  return null;
}

export function walkwayLengthMeters(walkway: Walkway): number {
  return Math.hypot(
    walkway.end.xMeters - walkway.start.xMeters,
    walkway.end.zMeters - walkway.start.zMeters,
  );
}

/**
 * The strip of floor a walkway needs, as an oriented rectangle.
 *
 * The rectangle runs along the route — its own X axis is the direction of
 * travel — and is as deep as the width being asked for. Which width that is
 * depends on the question: whether the route works at all is asked of the
 * minimum, whether it is comfortable is asked of the preferred.
 *
 * The angle is `atan2` of the route, which turns +X toward +Z, the same
 * direction a footprint's rotation turns.
 */
export function walkwayCorridor(
  walkway: Walkway,
  widthMeters: number,
): OrientedRect {
  const dx = walkway.end.xMeters - walkway.start.xMeters;
  const dz = walkway.end.zMeters - walkway.start.zMeters;

  return {
    center: {
      xMeters: (walkway.start.xMeters + walkway.end.xMeters) / 2,
      zMeters: (walkway.start.zMeters + walkway.end.zMeters) / 2,
    },
    widthMeters: Math.hypot(dx, dz),
    depthMeters: widthMeters,
    rotationRadians: Math.atan2(dz, dx),
  };
}

/**
 * A first route across the room, for someone to drag or type into shape.
 *
 * Down the middle from the north wall to the south, which is the trip most
 * often taken through a room and the one furniture most often blocks.
 */
export function createWalkway(id: string, room: Room): Walkway {
  const middle = room.widthMeters / 2;
  return {
    id,
    name: "Route",
    start: { xMeters: middle, zMeters: 0 },
    end: { xMeters: middle, zMeters: room.depthMeters },
    minimumWidthMeters: DEFAULT_MINIMUM_WALKWAY_METERS,
    preferredWidthMeters: DEFAULT_PREFERRED_WALKWAY_METERS,
  };
}

export function withWalkways(room: Room, walkways: readonly Walkway[]): Room {
  return { ...room, walkways };
}
