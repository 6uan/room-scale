/**
 * How much of a corridor is left once things are standing in it.
 *
 * A protected walkway is a rectangle, and the question is not "is anything in
 * it" — the Separating Axis Theorem already answers that — but "how wide is it
 * now". "The route to the guest room is thirty inches" is something a person
 * can act on. "Something is in your route" is not.
 *
 * ## How the width is found
 *
 * Everything is turned into the corridor's own frame: `u` runs along the route
 * and `v` across it. Each intruder then occupies a band of `v` over a stretch
 * of `u`. Walking the stretches in order and merging the bands active in each
 * gives the widest gap a person could walk through at that point along the
 * route, and the narrowest of those gaps is the answer.
 *
 * Merging every intruder's band at once would be simpler and wrong in an
 * ordinary case: a sofa at one end of a hallway and a console at the other, on
 * opposite sides, would report a corridor far narrower than the one you can
 * actually walk down.
 *
 * ## What it rounds against you
 *
 * An intruder is treated as its widest band across the whole stretch it
 * occupies, so a piece turned at an angle is measured by its corners rather
 * than by the diagonal edge that actually faces the route. The report errs
 * toward warning, which is the direction to err in: a walkway called tighter
 * than it is costs a second look, and one called wider than it is costs a
 * delivery.
 */

import {
  orientedRectCorners,
  orientedRectLocalPoint,
  type OrientedRect,
} from "./oriented-rect";

/** Something standing in a corridor, and what to call it afterwards. */
export type Intruder = {
  readonly id: string;
  readonly rect: OrientedRect;
};

export type Clearance = {
  /** The narrowest point of the corridor, in meters. */
  readonly clearMeters: number;
  /** The intruders that narrowed it, in the order they were given. */
  readonly intruderIds: readonly string[];
};

/** A range along one axis. Empty when `max` is not past `min`. */
type Span = { readonly min: number; readonly max: number };

/** An intruder reduced to the stretch it blocks and the band it occupies. */
type Blockage = {
  readonly id: string;
  readonly along: Span;
  readonly across: Span;
};

export function corridorClearance(
  corridor: OrientedRect,
  intruders: readonly Intruder[],
): Clearance {
  const halfLength = corridor.widthMeters / 2;
  const halfWidth = corridor.depthMeters / 2;

  if (!(halfLength > 0) || !(halfWidth > 0)) {
    return { clearMeters: 0, intruderIds: [] };
  }

  const blockages = intruders.flatMap((intruder) => {
    const blockage = blockageOf(corridor, intruder, halfLength, halfWidth);
    return blockage === null ? [] : [blockage];
  });

  if (blockages.length === 0) {
    return { clearMeters: corridor.depthMeters, intruderIds: [] };
  }

  // The corridor is only as wide as its narrowest stretch, and a stretch can
  // only start or end where an intruder does.
  const edges = [
    -halfLength,
    halfLength,
    ...blockages.flatMap(({ along }) => [along.min, along.max]),
  ].sort((a, b) => a - b);

  let clearMeters = corridor.depthMeters;
  for (let index = 1; index < edges.length; index += 1) {
    const from = edges[index - 1];
    const to = edges[index];
    if (from === undefined || to === undefined || to <= from) {
      continue;
    }

    const middle = (from + to) / 2;
    const active = blockages.filter(
      ({ along }) => along.min <= middle && middle <= along.max,
    );
    clearMeters = Math.min(
      clearMeters,
      widestGap(
        active.map(({ across }) => across),
        halfWidth,
      ),
    );
  }

  return {
    clearMeters,
    intruderIds: blockages.map(({ id }) => id),
  };
}

/**
 * Where an intruder sits in the corridor's frame, or null when it is not in it.
 *
 * The corners are the extremes of a rectangle, so its extent along each axis is
 * read off them and then clipped to the corridor. A piece touching the corridor
 * along an edge is not standing in it.
 */
function blockageOf(
  corridor: OrientedRect,
  intruder: Intruder,
  halfLength: number,
  halfWidth: number,
): Blockage | null {
  const local = orientedRectCorners(intruder.rect).map((corner) =>
    orientedRectLocalPoint(corridor, corner),
  );
  const us = local.map((point) => point.xMeters);
  const vs = local.map((point) => point.zMeters);

  const along = clip(
    { min: Math.min(...us), max: Math.max(...us) },
    halfLength,
  );
  const across = clip(
    { min: Math.min(...vs), max: Math.max(...vs) },
    halfWidth,
  );

  return along === null || across === null
    ? null
    : { id: intruder.id, along, across };
}

/** A span cut down to `[-half, half]`, or null when nothing of it is left. */
function clip(span: Span, half: number): Span | null {
  const min = Math.max(span.min, -half);
  const max = Math.min(span.max, half);
  return max > min ? { min, max } : null;
}

/**
 * The widest run of the corridor's width that no band covers.
 *
 * Bands are sorted and swept, keeping the largest gap between the last one that
 * ended and the next one that starts, with the corridor's own edges standing in
 * at either end.
 */
function widestGap(bands: readonly Span[], halfWidth: number): number {
  const sorted = [...bands].sort((a, b) => a.min - b.min);

  let widest = 0;
  let edge = -halfWidth;

  for (const band of sorted) {
    widest = Math.max(widest, band.min - edge);
    edge = Math.max(edge, band.max);
  }

  return Math.max(widest, halfWidth - edge);
}
