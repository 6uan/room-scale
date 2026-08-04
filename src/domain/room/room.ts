/** A room built from one or more rectangular parts, any of which may be turned. */

import type {
  AxisAlignedRect,
  FloorPoint,
  OrientedRect,
  TurnedRect,
} from "@/domain/geometry";
import {
  convexPolygonContains,
  convexUnionArea,
  orientedRectCorners,
  orientedRectTurnedUnionOverlapArea,
  turnedRectAsOriented,
  turnedRectContains,
  turnedRectCorners,
  turnedRectFloorPoint,
  turnedRectLocalPoint,
  turnedUnionArea,
  turnedUnionBounds,
} from "@/domain/geometry";
import {
  checkLength,
  metersFromInches,
  type LengthLimits,
  type LengthProblem,
} from "@/domain/units";
import { checkOpening, type Opening, type WallSide } from "./openings";

/**
 * A clipped corner, as two legs measured in from that corner.
 *
 * **Two numbers, not a boolean subtract.** The obvious way to take a corner off
 * is to drop a rotated square on it and subtract — and the result is a path,
 * which has no typeable dimensions and no wall to hang a door on. What a
 * builder actually says about that corner is *"it's clipped, about three feet
 * by three feet"*, and that is exactly what this holds.
 *
 * **Two legs rather than one**, so a chamfer is not forced to 45°. That is also
 * what a tape gives you at a real clipped corner: one reading along each wall.
 *
 * The legs are measured in the part's own frame — in from the corner along the
 * width axis and along the depth axis — so the part's rotation carries them
 * exactly as it already carries its walls and its openings.
 */
export type CornerCut = {
  readonly widthMeters: number;
  readonly depthMeters: number;
};

export type PartCorner =
  "north-west" | "north-east" | "south-east" | "south-west";

/** Round the part, from its anchor corner, the way its outline is wound. */
export const PART_CORNERS: readonly PartCorner[] = [
  "north-west",
  "north-east",
  "south-east",
  "south-west",
];

/**
 * Sparse: a corner with no entry is square, which every existing part is.
 *
 * Spelled `| undefined` as well as optional because a stored document is
 * parsed straight into this shape, and `exactOptionalPropertyTypes` holds a
 * key that is absent and a key that is present and undefined apart.
 */
export type PartCuts = {
  readonly [corner in PartCorner]?: CornerCut | undefined;
};

/**
 * One rectangular section of a room.
 *
 * The stored origin is the part's own north-west corner — always a physical
 * point a tape measure could find, wherever the turn has carried it. Editing
 * the angle spins the part about its center (`withRoomPartRotation`), and the
 * corner is recomputed to follow. Walls, openings, and resizing all live in
 * the part's local frame, which the rotation carries whole.
 *
 * `openWalls` are the sides left without a wall on purpose — a balcony's
 * railing, the open side of a living area. The floor still ends there: an
 * open edge bounds the room exactly as a wall does, it just is not drawn as
 * one and cannot carry a door or a window.
 *
 * `cuts` clip corners off that rectangle — see `CornerCut`. A clipped corner
 * leaves a chamfer, which is a wall like any other: it draws, it carries a
 * thickness, and it can hold a door. **A rectangle with corners clipped is
 * still convex**, which is what the Separating Axis Theorem needs, what makes
 * an intersection a chain of half-plane clips, and what keeps every opening
 * addressable by a wall and a distance along it.
 */
export type RoomPart = TurnedRect & {
  readonly id: string;
  readonly openWalls: readonly WallSide[];
  readonly cuts?: PartCuts | undefined;
};

export type Room = {
  readonly id: string;
  readonly name: string;
  readonly heightMeters: number;
  readonly parts: readonly RoomPart[];
  readonly openings: readonly Opening[];
  /**
   * This room's own wall thicknesses, or null to take the floor's.
   *
   * Almost every room takes the floor's, which is why the floor still carries
   * both numbers and why the control for these is folded away. The rooms that
   * do not are real, though: a bathroom's plumbing wall is fatter than the
   * partitions around it, and a room built into a chimney breast is fatter
   * still. Typing that once per apartment would be typing the wrong number
   * everywhere else.
   */
  readonly exteriorWallThicknessMeters: number | null;
  readonly interiorWallThicknessMeters: number | null;
};

export type RoomDimension = "widthMeters" | "depthMeters" | "heightMeters";
export type RoomPartDimension = "widthMeters" | "depthMeters";

export const ROOM_DIMENSIONS: readonly RoomDimension[] = [
  "widthMeters",
  "depthMeters",
  "heightMeters",
];

export const ROOM_LENGTH_LIMITS: Record<RoomDimension, LengthLimits> = {
  widthMeters: { minMeters: 0.5, maxMeters: 30 },
  depthMeters: { minMeters: 0.5, maxMeters: 30 },
  heightMeters: { minMeters: 1.5, maxMeters: 6 },
};

export const ROOM_ORIGIN_LIMITS: LengthLimits = {
  minMeters: -60,
  maxMeters: 60,
};

/**
 * How tall a room is until somebody measures it: eight feet.
 *
 * The one thing a new room can be given that is a fair guess rather than a
 * fiction — every other dimension comes off a tape, and a plan view cannot
 * show this one anyway. What used to sit here was a whole furnished living
 * room, which is why `DEFAULT_ROOM` is gone; see `DEFAULT_FLOOR`.
 */
export const DEFAULT_ROOM_HEIGHT_METERS = metersFromInches(96);

export function createRoomPart(
  id: string,
  origin: FloorPoint,
  widthMeters = metersFromInches(120),
  depthMeters = metersFromInches(120),
): RoomPart {
  return {
    id,
    origin,
    widthMeters,
    depthMeters,
    rotationRadians: 0,
    openWalls: [],
  };
}

/** Marks one wall of a part open or walled again. */
export function withRoomPartWallOpen(
  room: Room,
  partId: string,
  wall: WallSide,
  open: boolean,
): Room {
  return withRoomPart(room, partId, (part) => ({
    ...part,
    openWalls: open
      ? [...part.openWalls.filter((one) => one !== wall), wall]
      : part.openWalls.filter((one) => one !== wall),
  }));
}

export function createRoom(id: string, name: string, origin: FloorPoint): Room {
  return {
    id,
    name,
    heightMeters: DEFAULT_ROOM_HEIGHT_METERS,
    parts: [createRoomPart(`${id}-part-1`, origin)],
    openings: [],
    // A new room is built out of whatever the apartment is built out of. An
    // override is a thing somebody measured and meant, never a starting point.
    exteriorWallThicknessMeters: null,
    interiorWallThicknessMeters: null,
  };
}

/**
 * The same room with one of its wall thicknesses overridden, or handed back to
 * the floor's default when the value is null.
 */
export function withRoomWallThickness(
  room: Room,
  kind: "exterior" | "interior",
  meters: number | null,
): Room {
  return kind === "exterior"
    ? { ...room, exteriorWallThicknessMeters: meters }
    : { ...room, interiorWallThicknessMeters: meters };
}

export function primaryRoomPart(room: Room): RoomPart {
  const part = room.parts[0];
  if (part === undefined) {
    throw new Error(`Room ${room.id} has no parts`);
  }
  return part;
}

export function roomPart(room: Room, partId: string): RoomPart | undefined {
  return room.parts.find((part) => part.id === partId);
}

/**
 * An id no section of this room is using.
 *
 * Counted past the ones already taken rather than from the length, so removing
 * a middle section and adding another does not hand out an id that is still on
 * screen. Ids outlive positions: an opening remembers the part it sits on.
 */
export function nextPartId(room: Room): string {
  let number = room.parts.length + 1;
  while (room.parts.some((part) => part.id === `${room.id}-part-${number}`)) {
    number += 1;
  }
  return `${room.id}-part-${number}`;
}

export function roomBounds(room: Room): AxisAlignedRect {
  return (
    turnedUnionBounds(room.parts) ?? {
      origin: { xMeters: 0, zMeters: 0 },
      widthMeters: 0,
      depthMeters: 0,
    }
  );
}

/**
 * The **uncut** rectangle, described by its center.
 *
 * This is a pivot and a label centre, not a footprint. A part spins about the
 * middle of the rectangle it was drawn as — cutting a corner off must not move
 * the point it turns around — and its name is written there.
 *
 * Once a corner is cut, this rectangle is no longer the shape the part
 * occupies. Anything measuring the part against something else wants
 * `roomPartPolygon`; passing this to a theorem would silently claim floor the
 * room does not have.
 */
export function roomPartPivotRect(part: RoomPart): OrientedRect {
  return turnedRectAsOriented(part);
}

/** Whether this corner is clipped, and by how much. */
export function roomPartCut(
  part: RoomPart,
  corner: PartCorner,
): CornerCut | null {
  return part.cuts?.[corner] ?? null;
}

/** Whether any corner of this part is clipped. */
export function roomPartIsCut(part: RoomPart): boolean {
  return PART_CORNERS.some((corner) => roomPartCut(part, corner) !== null);
}

/**
 * The part's true outline in its own frame: four points square, and two in
 * place of every corner that is clipped, so eight at the most.
 *
 * Wound from the anchor corner the way the plan is read — east along the north
 * side, south down the east side, and back — which is the order
 * `turnedRectCorners` has always used, so a part with no cuts produces exactly
 * the four points it always did.
 */
export function roomPartLocalPolygon(part: RoomPart): readonly FloorPoint[] {
  const width = part.widthMeters;
  const depth = part.depthMeters;
  const nw = roomPartCut(part, "north-west");
  const ne = roomPartCut(part, "north-east");
  const se = roomPartCut(part, "south-east");
  const sw = roomPartCut(part, "south-west");

  return [
    ...(nw === null
      ? [{ xMeters: 0, zMeters: 0 }]
      : [
          { xMeters: 0, zMeters: nw.depthMeters },
          { xMeters: nw.widthMeters, zMeters: 0 },
        ]),
    ...(ne === null
      ? [{ xMeters: width, zMeters: 0 }]
      : [
          { xMeters: width - ne.widthMeters, zMeters: 0 },
          { xMeters: width, zMeters: ne.depthMeters },
        ]),
    ...(se === null
      ? [{ xMeters: width, zMeters: depth }]
      : [
          { xMeters: width, zMeters: depth - se.depthMeters },
          { xMeters: width - se.widthMeters, zMeters: depth },
        ]),
    ...(sw === null
      ? [{ xMeters: 0, zMeters: depth }]
      : [
          { xMeters: sw.widthMeters, zMeters: depth },
          { xMeters: 0, zMeters: depth - sw.depthMeters },
        ]),
  ];
}

/**
 * The part's true footprint on the floor — the shape everything measures
 * against. Convex by construction, so it goes straight into the Separating
 * Axis Theorem and the half-plane clips.
 */
export function roomPartPolygon(part: RoomPart): readonly FloorPoint[] {
  return roomPartIsCut(part)
    ? roomPartLocalPolygon(part).map((point) => pointOnRoomPart(part, point))
    : turnedRectCorners(part);
}

/**
 * The two ends of one wall of a part, in the part's own frame.
 *
 * The four square sides are shortened by whatever the cuts at their ends take
 * out of them, and each cut adds a chamfer of its own. Every wall is measured
 * from its western end — the same "the way a plan is read" rule the square
 * sides have always used, which resolves a chamfer too because a chamfer with
 * two positive legs is never vertical.
 *
 * A corner that is not cut has no chamfer, and comes back as the corner point
 * twice: a wall of no length, which `partWallSides` leaves out.
 */
export function partWallSegment(
  part: RoomPart,
  wall: WallSide,
): { readonly from: FloorPoint; readonly to: FloorPoint } {
  const width = part.widthMeters;
  const depth = part.depthMeters;
  const nw = cutLegs(part, "north-west");
  const ne = cutLegs(part, "north-east");
  const se = cutLegs(part, "south-east");
  const sw = cutLegs(part, "south-west");

  switch (wall) {
    case "north":
      return {
        from: { xMeters: nw.widthMeters, zMeters: 0 },
        to: { xMeters: width - ne.widthMeters, zMeters: 0 },
      };
    case "south":
      return {
        from: { xMeters: sw.widthMeters, zMeters: depth },
        to: { xMeters: width - se.widthMeters, zMeters: depth },
      };
    case "west":
      return {
        from: { xMeters: 0, zMeters: nw.depthMeters },
        to: { xMeters: 0, zMeters: depth - sw.depthMeters },
      };
    case "east":
      return {
        from: { xMeters: width, zMeters: ne.depthMeters },
        to: { xMeters: width, zMeters: depth - se.depthMeters },
      };
    case "north-west":
      return {
        from: { xMeters: 0, zMeters: nw.depthMeters },
        to: { xMeters: nw.widthMeters, zMeters: 0 },
      };
    case "north-east":
      return {
        from: { xMeters: width - ne.widthMeters, zMeters: 0 },
        to: { xMeters: width, zMeters: ne.depthMeters },
      };
    case "south-east":
      return {
        from: { xMeters: width - se.widthMeters, zMeters: depth },
        to: { xMeters: width, zMeters: depth - se.depthMeters },
      };
    case "south-west":
      return {
        from: { xMeters: 0, zMeters: depth - sw.depthMeters },
        to: { xMeters: sw.widthMeters, zMeters: depth },
      };
  }
}

/**
 * How long one wall of a part is.
 *
 * Written as arithmetic on the part's own dimensions rather than as the
 * distance between the segment's ends, so an uncut side comes back as exactly
 * the width or depth that was typed — subtracting two zeroes is exact where a
 * square root is not.
 */
export function partWallLengthMeters(part: RoomPart, wall: WallSide): number {
  const nw = cutLegs(part, "north-west");
  const ne = cutLegs(part, "north-east");
  const se = cutLegs(part, "south-east");
  const sw = cutLegs(part, "south-west");

  switch (wall) {
    case "north":
      return part.widthMeters - nw.widthMeters - ne.widthMeters;
    case "south":
      return part.widthMeters - sw.widthMeters - se.widthMeters;
    case "west":
      return part.depthMeters - nw.depthMeters - sw.depthMeters;
    case "east":
      return part.depthMeters - ne.depthMeters - se.depthMeters;
    default: {
      const cut = cutLegs(part, wall);
      return Math.hypot(cut.widthMeters, cut.depthMeters);
    }
  }
}

/** A cut's legs, or a pair of zeroes where the corner is square. */
function cutLegs(part: RoomPart, corner: PartCorner): CornerCut {
  return roomPartCut(part, corner) ?? { widthMeters: 0, depthMeters: 0 };
}

export function roomPartContains(part: RoomPart, point: FloorPoint): boolean {
  return roomPartIsCut(part)
    ? convexPolygonContains(roomPartPolygon(part), point)
    : turnedRectContains(part, point);
}

/** Whether a floor point is anywhere on this room's floor. */
export function roomContains(room: Room, point: FloorPoint): boolean {
  return room.parts.some((part) => roomPartContains(part, point));
}

/** Shorter than this is a mitre, not a corner anybody clipped. A centimeter. */
export const MIN_CUT_METERS = 0.01;

/** What a clipped corner is until it is measured: three feet each way. */
export const DEFAULT_CUT_METERS = metersFromInches(36);

export type CutProblem =
  | "not-a-number"
  | "too-small"
  /** The two cuts on one side are longer between them than the side is. */
  | "overruns-side";

/** The corner sharing the north or south side with this one. */
const WIDTH_PARTNER: Record<PartCorner, PartCorner> = {
  "north-west": "north-east",
  "north-east": "north-west",
  "south-east": "south-west",
  "south-west": "south-east",
};

/** The corner sharing the west or east side with this one. */
const DEPTH_PARTNER: Record<PartCorner, PartCorner> = {
  "north-west": "south-west",
  "south-west": "north-west",
  "north-east": "south-east",
  "south-east": "north-east",
};

export type CutLeg = "widthMeters" | "depthMeters";

/**
 * What one leg of a cut may be: at most whatever the cut at the far end of
 * that same side has left of it.
 *
 * This is the whole of the cuts' geometric rule, expressed where somebody is
 * typing rather than after the fact — a field that will not take a number is a
 * better answer than a problem reported once the shape is already wrong.
 */
export function cutLegLimits(
  part: RoomPart,
  corner: PartCorner,
  leg: CutLeg,
): LengthLimits {
  const partner =
    leg === "widthMeters" ? WIDTH_PARTNER[corner] : DEPTH_PARTNER[corner];
  const side = leg === "widthMeters" ? part.widthMeters : part.depthMeters;
  return {
    minMeters: MIN_CUT_METERS,
    maxMeters: Math.max(MIN_CUT_METERS, side - cutLegs(part, partner)[leg]),
  };
}

/** A clipped corner of the usual size, held to what the side has room for. */
export function defaultCornerCut(
  part: RoomPart,
  corner: PartCorner,
): CornerCut {
  return {
    widthMeters: Math.min(
      DEFAULT_CUT_METERS,
      cutLegLimits(part, corner, "widthMeters").maxMeters,
    ),
    depthMeters: Math.min(
      DEFAULT_CUT_METERS,
      cutLegLimits(part, corner, "depthMeters").maxMeters,
    ),
  };
}

/** Why this part's clipped corners do not describe a shape, or null. */
export function checkRoomPartCuts(part: RoomPart): CutProblem | null {
  for (const corner of PART_CORNERS) {
    const cut = roomPartCut(part, corner);
    if (cut === null) {
      continue;
    }
    if (
      !Number.isFinite(cut.widthMeters) ||
      !Number.isFinite(cut.depthMeters)
    ) {
      return "not-a-number";
    }
    if (cut.widthMeters < MIN_CUT_METERS || cut.depthMeters < MIN_CUT_METERS) {
      return "too-small";
    }
  }

  const taken = (corner: PartCorner, leg: CutLeg) => cutLegs(part, corner)[leg];
  const sides: readonly (readonly [number, number])[] = [
    [
      taken("north-west", "widthMeters") + taken("north-east", "widthMeters"),
      part.widthMeters,
    ],
    [
      taken("south-west", "widthMeters") + taken("south-east", "widthMeters"),
      part.widthMeters,
    ],
    [
      taken("north-west", "depthMeters") + taken("south-west", "depthMeters"),
      part.depthMeters,
    ],
    [
      taken("north-east", "depthMeters") + taken("south-east", "depthMeters"),
      part.depthMeters,
    ],
  ];

  return sides.some(([used, side]) => used > side) ? "overruns-side" : null;
}

/**
 * Where a clipped corner is taken hold of on the plan: the middle of its
 * chamfer. Only corners that are actually clipped have one.
 */
export function roomPartCutHandles(
  part: RoomPart,
): readonly { readonly corner: PartCorner; readonly at: FloorPoint }[] {
  return PART_CORNERS.filter(
    (corner) => roomPartCut(part, corner) !== null,
  ).map((corner) => {
    const { from, to } = partWallSegment(part, corner);
    return {
      corner,
      at: pointOnRoomPart(part, {
        xMeters: (from.xMeters + to.xMeters) / 2,
        zMeters: (from.zMeters + to.zMeters) / 2,
      }),
    };
  });
}

/**
 * The cut described by dragging a chamfer's handle to a floor point — **both
 * legs at once**, which is the gesture the two fields cannot be.
 *
 * The handle is the middle of the chamfer, which sits half of each leg in from
 * the corner, so the pointer's distance from that corner in the part's own
 * frame is exactly half of each. Pulling diagonally deepens both; pulling
 * along one wall lengthens mostly that leg. Each is then held to what the cut
 * at the far end of its own side has left, so a drag cannot overrun a side the
 * fields would refuse to.
 */
export function cutFromHandlePoint(
  part: RoomPart,
  corner: PartCorner,
  point: FloorPoint,
  roundMeters: (meters: number) => number = (meters) => meters,
): CornerCut {
  const local = turnedRectLocalPoint(part, point);
  const inWidth =
    corner === "north-west" || corner === "south-west"
      ? local.xMeters
      : part.widthMeters - local.xMeters;
  const inDepth =
    corner === "north-west" || corner === "north-east"
      ? local.zMeters
      : part.depthMeters - local.zMeters;

  const width = cutLegLimits(part, corner, "widthMeters");
  const depth = cutLegLimits(part, corner, "depthMeters");
  return {
    widthMeters: clampLength(roundMeters(2 * inWidth), width),
    depthMeters: clampLength(roundMeters(2 * inDepth), depth),
  };
}

function clampLength(meters: number, limits: LengthLimits): number {
  return Math.min(Math.max(meters, limits.minMeters), limits.maxMeters);
}

/** Clips one corner of a part, or squares it again when the cut is null. */
export function withRoomPartCut(
  room: Room,
  partId: string,
  corner: PartCorner,
  cut: CornerCut | null,
): Room {
  return withRoomPart(room, partId, (part) => {
    // Mutable only inside here: a corner is squared again by taking its key
    // out rather than by storing an absence, so what is stored stays sparse.
    const cuts: { -readonly [C in PartCorner]?: CornerCut | undefined } = {
      ...part.cuts,
    };
    if (cut === null) {
      delete cuts[corner];
    } else {
      cuts[corner] = cut;
    }
    return { ...part, cuts };
  });
}

/** A floor point in the part's own frame, measured from its anchor corner. */
export function pointInRoomPart(part: RoomPart, point: FloorPoint): FloorPoint {
  return turnedRectLocalPoint(part, point);
}

/** The same point put back into floor coordinates. */
export function pointOnRoomPart(part: RoomPart, local: FloorPoint): FloorPoint {
  return turnedRectFloorPoint(part, local);
}

export function checkRoomLength(
  meters: number,
  dimension: RoomDimension,
): LengthProblem | null {
  return checkLength(meters, ROOM_LENGTH_LIMITS[dimension]);
}

export function isValidRoom(room: Room): boolean {
  return (
    room.parts.length > 0 &&
    checkRoomLength(room.heightMeters, "heightMeters") === null &&
    room.parts.every(
      (part) =>
        checkRoomLength(part.widthMeters, "widthMeters") === null &&
        checkRoomLength(part.depthMeters, "depthMeters") === null &&
        checkRoomPartCuts(part) === null,
    ) &&
    room.openings.every((opening) => checkOpening(room, opening) === null)
  );
}

/** Compatibility editor for the first part and the room-level height. */
export function withRoomLength(
  room: Room,
  dimension: RoomDimension,
  meters: number,
): Room {
  if (dimension === "heightMeters") {
    return { ...room, heightMeters: meters };
  }
  return withRoomPartLength(room, primaryRoomPart(room).id, dimension, meters);
}

export function withRoomPartLength(
  room: Room,
  partId: string,
  dimension: RoomPartDimension,
  meters: number,
): Room {
  return withRoomPart(room, partId, (part) => ({
    ...part,
    [dimension]: meters,
  }));
}

export function withRoomPartOrigin(
  room: Room,
  partId: string,
  origin: FloorPoint,
): Room {
  return withRoomPart(room, partId, (part) => ({ ...part, origin }));
}

/**
 * Turns one part in place: its center holds still and the anchor corner is
 * recomputed to follow, the way a turned sofa spins where it stands. The X
 * and Y fields keep reading a physical corner — it travels with the turn.
 */
export function withRoomPartRotation(
  room: Room,
  partId: string,
  rotationRadians: number,
): Room {
  return withRoomPart(room, partId, (part) => {
    const half = {
      xMeters: part.widthMeters / 2,
      zMeters: part.depthMeters / 2,
    };
    const center = pointOnRoomPart(part, half);
    const turned = { ...part, rotationRadians };
    const moved = pointOnRoomPart(turned, half);
    return {
      ...turned,
      origin: {
        xMeters: part.origin.xMeters + (center.xMeters - moved.xMeters),
        zMeters: part.origin.zMeters + (center.zMeters - moved.zMeters),
      },
    };
  });
}

export function withRoomPart(
  room: Room,
  partId: string,
  change: (part: RoomPart) => RoomPart,
): Room {
  return {
    ...room,
    parts: room.parts.map((part) => (part.id === partId ? change(part) : part)),
  };
}

export function withParts(room: Room, parts: readonly RoomPart[]): Room {
  return { ...room, parts };
}

export function withOpenings(room: Room, openings: readonly Opening[]): Room {
  return { ...room, openings };
}

/** Moves the entire room so its union bounds begin at `origin`. */
export function withOrigin(room: Room, origin: FloorPoint): Room {
  const current = roomBounds(room).origin;
  const dx = origin.xMeters - current.xMeters;
  const dz = origin.zMeters - current.zMeters;
  return {
    ...room,
    parts: room.parts.map((part) => ({
      ...part,
      origin: {
        xMeters: part.origin.xMeters + dx,
        zMeters: part.origin.zMeters + dz,
      },
    })),
  };
}

export type RoomEdge = "north" | "east" | "south" | "west";

export function resizeRoomPartEdge(
  room: Room,
  partId: string,
  edge: RoomEdge,
  positionMeters: number,
): Room {
  return withRoomPart(room, partId, (part) =>
    resizePartEdge(part, edge, positionMeters),
  );
}

export function resizeRoomEdge(
  room: Room,
  edge: RoomEdge,
  positionMeters: number,
): Room {
  return resizeRoomPartEdge(
    room,
    primaryRoomPart(room).id,
    edge,
    positionMeters,
  );
}

/**
 * Resizes one edge of a turned part to where a floor point lands in its own
 * frame. The edges keep their local names — "west" is the edge the anchor
 * corner sits on however the part is turned — and moving the west or north
 * edge slides the anchor along the turned axis so the rest of the part stays
 * put, exactly as it does for an unturned one.
 */
export function resizeRoomPartEdgeToPoint(
  room: Room,
  partId: string,
  edge: RoomEdge,
  point: FloorPoint,
  roundMeters: (meters: number) => number = (meters) => meters,
): Room {
  return withRoomPart(room, partId, (part) => {
    const local = pointInRoomPart(part, point);
    const smallest = ROOM_LENGTH_LIMITS.widthMeters.minMeters;
    switch (edge) {
      case "west": {
        const shift = Math.min(
          roundMeters(local.xMeters),
          part.widthMeters - smallest,
        );
        return {
          ...part,
          origin: pointOnRoomPart(part, { xMeters: shift, zMeters: 0 }),
          widthMeters: part.widthMeters - shift,
        };
      }
      case "east":
        return {
          ...part,
          widthMeters: Math.max(smallest, roundMeters(local.xMeters)),
        };
      case "north": {
        const shift = Math.min(
          roundMeters(local.zMeters),
          part.depthMeters - smallest,
        );
        return {
          ...part,
          origin: pointOnRoomPart(part, { xMeters: 0, zMeters: shift }),
          depthMeters: part.depthMeters - shift,
        };
      }
      case "south":
        return {
          ...part,
          depthMeters: Math.max(smallest, roundMeters(local.zMeters)),
        };
    }
  });
}

function resizePartEdge(
  part: RoomPart,
  edge: RoomEdge,
  positionMeters: number,
): RoomPart {
  const smallest = ROOM_LENGTH_LIMITS.widthMeters.minMeters;
  switch (edge) {
    case "west": {
      const east = part.origin.xMeters + part.widthMeters;
      const xMeters = Math.min(positionMeters, east - smallest);
      return {
        ...part,
        origin: { ...part.origin, xMeters },
        widthMeters: east - xMeters,
      };
    }
    case "east":
      return {
        ...part,
        widthMeters: Math.max(smallest, positionMeters - part.origin.xMeters),
      };
    case "north": {
      const south = part.origin.zMeters + part.depthMeters;
      const zMeters = Math.min(positionMeters, south - smallest);
      return {
        ...part,
        origin: { ...part.origin, zMeters },
        depthMeters: south - zMeters,
      };
    }
    case "south":
      return {
        ...part,
        depthMeters: Math.max(smallest, positionMeters - part.origin.zMeters),
      };
  }
}

export function roomEdgePosition(room: Room, edge: RoomEdge): number {
  const bounds = roomBounds(room);
  switch (edge) {
    case "west":
      return bounds.origin.xMeters;
    case "east":
      return bounds.origin.xMeters + bounds.widthMeters;
    case "north":
      return bounds.origin.zMeters;
    case "south":
      return bounds.origin.zMeters + bounds.depthMeters;
  }
}

/**
 * The room's floor area, counting overlapping sections once.
 *
 * Dispatches, the way every other union measurement in this domain does: a
 * room whose sections are all whole rectangles keeps the exact arithmetic it
 * has always used, and only a room with a corner clipped off one of them pays
 * for the general path over its outlines.
 */
export function roomFloorAreaSquareMeters(room: Room): number {
  return room.parts.some(roomPartIsCut)
    ? convexUnionArea(room.parts.map(roomPartPolygon))
    : turnedUnionArea(room.parts);
}

/**
 * How much of a furniture footprint stands on this room's floor. Sections
 * overlapping each other are counted once, so an L-shaped room does not
 * measure its own seam twice.
 */
export function roomFootprintOverlapArea(
  room: Room,
  footprint: OrientedRect,
): number {
  return room.parts.some(roomPartIsCut)
    ? convexUnionArea(
        room.parts.map(roomPartPolygon),
        orientedRectCorners(footprint),
      )
    : orientedRectTurnedUnionOverlapArea(footprint, room.parts);
}
