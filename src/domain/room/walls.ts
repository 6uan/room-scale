/**
 * What actually stands along each stretch of a part's wall.
 *
 * A side of a section is one line on the plan, but it is not one thing: part
 * of it may be a seam its own room continues through, part may face another
 * room across a partition, part may face the outside world, and part may be
 * a railing where a wall was left open. The drawing, the opening cuts, and
 * the wall thicknesses all follow these stretches.
 *
 * Which walls are interior is **derived, not typed**: a stretch is interior
 * where another room stands just beyond it — within the interior thickness —
 * the same fact the snapping already builds. Nobody declares a wall twice.
 *
 * Everything is measured in the wall's own frame: meters along the wall from
 * its start corner, exactly the coordinate openings already use.
 */

import type { FloorPoint } from "@/domain/geometry";
import { clipPolygonToRect } from "@/domain/geometry";
import type { Floor } from "./floor";
import {
  roomPartCorners,
  pointOnRoomPart,
  roomPart,
  type Room,
  type RoomPart,
} from "./room";
import {
  wallLengthMeters,
  wallOutwardNormalOnFloor,
  type FloorVector,
  type Opening,
  type WallSide,
} from "./openings";

export type WallKind =
  /** The apartment's shell: nothing stands on the far side. */
  | "exterior"
  /** A partition: another room stands just beyond it. */
  | "interior"
  /** The room itself continues through; no wall exists here at all. */
  | "seam"
  /** Left open on purpose — a railing or an open side, drawn without a wall. */
  | "open";

export type WallStretch = {
  readonly startMeters: number;
  readonly endMeters: number;
  readonly kind: WallKind;
};

/** Shorter than this is a sliver of arithmetic, not a wall anybody builds. */
const MIN_STRETCH_METERS = 0.001;

/** How far past the wall line a shape must reach to count as continuing. */
const THROUGH_EPSILON_METERS = 0.000001;

export function isWallOpen(part: RoomPart, wall: WallSide): boolean {
  return part.openWalls.includes(wall);
}

/**
 * The stretches of one part wall, in order from its start corner.
 *
 * Seams are cut out first — where the room's own floor continues, there is no
 * wall to classify. What remains is open if the wall was marked open, interior
 * where another room stands within the interior thickness beyond it, and
 * exterior everywhere else.
 */
export function wallStretches(
  floor: Floor,
  room: Room,
  part: RoomPart,
  wall: WallSide,
): readonly WallStretch[] {
  const length = wallLengthMeters(room, wall, part.id);
  if (length <= 0) {
    return [];
  }

  const seams = mergeIntervals(
    room.parts
      .filter((sibling) => sibling.id !== part.id)
      .flatMap((sibling) =>
        bandInterval(part, wall, length, roomPartCorners(sibling), {
          nearMeters: THROUGH_EPSILON_METERS,
          farMeters: THROUGH_EPSILON_METERS * 2,
        }),
      ),
  );

  const walled = subtractIntervals([{ start: 0, end: length }], seams);

  const stretches: WallStretch[] = seams.map(({ start, end }) => ({
    startMeters: start,
    endMeters: end,
    kind: "seam",
  }));

  if (isWallOpen(part, wall)) {
    stretches.push(...withKind(walled, "open"));
  } else {
    const neighbours = mergeIntervals(
      floor.rooms
        .filter((other) => other.id !== room.id)
        .flatMap((other) => other.parts)
        .flatMap((theirs) =>
          bandInterval(part, wall, length, roomPartCorners(theirs), {
            nearMeters: THROUGH_EPSILON_METERS,
            // A snapped neighbour's face sits exactly one interior thickness
            // away; a fingertip of tolerance keeps arithmetic honest.
            farMeters: floor.interiorWallThicknessMeters + MIN_STRETCH_METERS,
          }),
        ),
    );
    stretches.push(
      ...withKind(intersectIntervals(walled, neighbours), "interior"),
      ...withKind(subtractIntervals(walled, neighbours), "exterior"),
    );
  }

  return stretches
    .filter(
      (stretch) => stretch.endMeters - stretch.startMeters > MIN_STRETCH_METERS,
    )
    .sort((a, b) => a.startMeters - b.startMeters);
}

/**
 * The thickness of the wall band along one stretch kind. Seams and open
 * stretches have no band at all.
 */
export function wallKindThicknessMeters(floor: Floor, kind: WallKind): number {
  switch (kind) {
    case "exterior":
      return floor.exteriorWallThicknessMeters;
    case "interior":
      return floor.interiorWallThicknessMeters;
    case "seam":
    case "open":
      return 0;
  }
}

/** The stretch an opening's center sits on, or null off every stretch. */
export function wallStretchAt(
  floor: Floor,
  room: Room,
  part: RoomPart,
  wall: WallSide,
  alongMeters: number,
): WallStretch | null {
  return (
    wallStretches(floor, room, part, wall).find(
      (stretch) =>
        alongMeters >= stretch.startMeters && alongMeters <= stretch.endMeters,
    ) ?? null
  );
}

/**
 * How thick the wall carrying this opening is — the depth its hole is cut.
 * Interior when the stretch cannot be found: a wall being dragged through a
 * strange state should still draw something rather than nothing.
 */
export function openingWallThicknessMeters(
  floor: Floor,
  room: Room,
  opening: Opening,
): number {
  const part = roomPart(room, opening.partId);
  const stretch =
    part === undefined
      ? null
      : wallStretchAt(floor, room, part, opening.wall, opening.centerMeters);
  if (stretch === null || stretch.kind === "seam" || stretch.kind === "open") {
    return floor.interiorWallThicknessMeters;
  }
  return wallKindThicknessMeters(floor, stretch.kind);
}

type Interval = { readonly start: number; readonly end: number };

function withKind(
  intervals: readonly Interval[],
  kind: WallKind,
): WallStretch[] {
  return intervals.map(({ start, end }) => ({
    startMeters: start,
    endMeters: end,
    kind,
  }));
}

/**
 * Where a shape covers the wall, measured along it, or nothing.
 *
 * The shape's corners are carried into the wall's own frame — meters along
 * the wall, meters outward through it — and clipped to a thin band just
 * outside the wall line. Whatever survives is the stretch the shape stands
 * against. Exact for any rotation, because the band is axis-aligned in the
 * wall's frame no matter how either part is turned.
 */
function bandInterval(
  part: RoomPart,
  wall: WallSide,
  lengthMeters: number,
  corners: readonly FloorPoint[],
  band: { readonly nearMeters: number; readonly farMeters: number },
): Interval[] {
  const frame = wallFrame(part, wall);
  const local = corners.map((corner) => {
    const dx = corner.xMeters - frame.start.xMeters;
    const dz = corner.zMeters - frame.start.zMeters;
    return {
      xMeters: dx * frame.direction.dx + dz * frame.direction.dz,
      zMeters: dx * frame.normal.dx + dz * frame.normal.dz,
    };
  });

  const clipped = clipPolygonToRect(local, {
    origin: { xMeters: 0, zMeters: band.nearMeters },
    widthMeters: lengthMeters,
    depthMeters: band.farMeters - band.nearMeters,
  });
  if (clipped.length < 3) {
    return [];
  }

  const xs = clipped.map((point) => point.xMeters);
  return [{ start: Math.min(...xs), end: Math.max(...xs) }];
}

/** The wall's own frame: its start corner, and unit vectors along and out. */
function wallFrame(
  part: RoomPart,
  wall: WallSide,
): {
  readonly start: FloorPoint;
  readonly direction: FloorVector;
  readonly normal: FloorVector;
} {
  const cos = Math.cos(part.rotationRadians);
  const sin = Math.sin(part.rotationRadians);
  const alongWidth = wall === "north" || wall === "south";
  const startLocal =
    wall === "south"
      ? { xMeters: 0, zMeters: part.depthMeters }
      : wall === "east"
        ? { xMeters: part.widthMeters, zMeters: 0 }
        : { xMeters: 0, zMeters: 0 };

  return {
    start: pointOnRoomPart(part, startLocal),
    direction: alongWidth ? { dx: cos, dz: sin } : { dx: -sin, dz: cos },
    normal: wallOutwardNormalOnFloor(part, wall),
  };
}

/** Overlapping and touching intervals coalesced, sorted by start. */
function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    if (last !== undefined && interval.start <= last.end) {
      merged[merged.length - 1] = {
        start: last.start,
        end: Math.max(last.end, interval.end),
      };
    } else {
      merged.push(interval);
    }
  }
  return merged;
}

/** What remains of `base` once every `cut` is taken out of it. */
function subtractIntervals(
  base: readonly Interval[],
  cuts: readonly Interval[],
): Interval[] {
  let remaining = [...base];
  for (const cut of cuts) {
    remaining = remaining.flatMap((interval) => {
      const pieces: Interval[] = [];
      if (cut.start > interval.start) {
        pieces.push({
          start: interval.start,
          end: Math.min(cut.start, interval.end),
        });
      }
      if (cut.end < interval.end) {
        pieces.push({
          start: Math.max(cut.end, interval.start),
          end: interval.end,
        });
      }
      return pieces.filter((piece) => piece.end > piece.start);
    });
  }
  return remaining;
}

/** The parts of `base` that also lie inside some interval of `others`. */
function intersectIntervals(
  base: readonly Interval[],
  others: readonly Interval[],
): Interval[] {
  return base.flatMap((interval) =>
    others
      .map((other) => ({
        start: Math.max(interval.start, other.start),
        end: Math.min(interval.end, other.end),
      }))
      .filter((piece) => piece.end > piece.start),
  );
}
