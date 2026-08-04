/**
 * What actually stands along each stretch of a part's wall.
 *
 * A side of a section is one line on the plan, but it is not one thing: part
 * of it may be a seam its own room continues through, part may be a railing
 * where a wall was left open, and the rest is wall. The drawing and the
 * opening cuts follow these stretches.
 *
 * **A wall used to be measured as well as classified here.** Each stretch was
 * sorted into shell or partition by looking for another room just beyond it,
 * and drawn at whichever thickness that implied. It is how a plan is really
 * drawn, and it made an apartment of a dozen rooms come out ragged: a wall
 * shared for part of its run drew at two widths, with a step where the
 * neighbour ended. The thickness is one number now — the room's, or the
 * apartment's — so what is left to work out here is only where a wall exists
 * at all.
 *
 * Everything is measured in the wall's own frame: meters along the wall from
 * its start corner, exactly the coordinate openings already use.
 */

import type { FloorPoint } from "@/domain/geometry";
import { clipPolygonToRect } from "@/domain/geometry";
import { wallThicknessMeters, type Floor } from "./floor";
import {
  partWallSegment,
  pointOnRoomPart,
  roomPart,
  roomPartPolygon,
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
  /** A wall stands here, at the one thickness the room is built of. */
  | "wall"
  /** The room itself continues through; no wall exists here at all. */
  | "seam"
  /** Left open on purpose — a railing or an open side, drawn without a wall. */
  | "open";

export type WallStretch = {
  readonly startMeters: number;
  readonly endMeters: number;
  readonly kind: WallKind;
  /**
   * How thick the band along this stretch is, already resolved.
   *
   * Carried rather than looked up, because a seam and an open edge have no
   * band at all — theirs is zero — and the drawing should not have to know
   * which kinds those are.
   */
  readonly thicknessMeters: number;
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
 * wall to draw. What remains is a railing if the wall was marked open, and
 * wall everywhere else, at the one thickness this room is built of.
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
        bandInterval(part, wall, length, roomPartPolygon(sibling), {
          nearMeters: THROUGH_EPSILON_METERS,
          farMeters: THROUGH_EPSILON_METERS * 2,
        }),
      ),
  );
  const walled = subtractIntervals([{ start: 0, end: length }], seams);
  const open = isWallOpen(part, wall);

  return ordered([
    ...withKind(seams, "seam", 0),
    ...withKind(
      walled,
      open ? "open" : "wall",
      open ? 0 : wallThicknessMeters(floor, room),
    ),
  ]);
}

function ordered(stretches: readonly WallStretch[]): readonly WallStretch[] {
  return stretches
    .filter(
      (stretch) => stretch.endMeters - stretch.startMeters > MIN_STRETCH_METERS,
    )
    .sort((a, b) => a.startMeters - b.startMeters);
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
    return wallThicknessMeters(floor, room);
  }
  return stretch.thicknessMeters;
}

type Interval = { readonly start: number; readonly end: number };

function withKind(
  intervals: readonly Interval[],
  kind: WallKind,
  thicknessMeters: number,
): WallStretch[] {
  return intervals.map(({ start, end }) => ({
    startMeters: start,
    endMeters: end,
    kind,
    thicknessMeters,
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

/**
 * The wall's own frame: where it starts, and unit vectors along and out of it.
 *
 * Taken from the wall's own segment, so a chamfer left by a clipped corner has
 * a frame exactly as a square side does — and a square side keeps the frame it
 * always had, since an uncut wall starts at the corner it always started at.
 */
function wallFrame(
  part: RoomPart,
  wall: WallSide,
): {
  readonly start: FloorPoint;
  readonly direction: FloorVector;
  readonly normal: FloorVector;
} {
  const { from, to } = partWallSegment(part, wall);
  const start = pointOnRoomPart(part, from);
  const end = pointOnRoomPart(part, to);
  const dx = end.xMeters - start.xMeters;
  const dz = end.zMeters - start.zMeters;
  const length = Math.hypot(dx, dz);

  return {
    start,
    direction:
      length === 0 ? { dx: 0, dz: 0 } : { dx: dx / length, dz: dz / length },
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
