/**
 * Whether the furniture in the room actually fits.
 *
 * This is the question RoomScale exists to answer, so the answer is a list of
 * specific, countable problems rather than a boolean. "It does not fit" is not
 * something a person can act on; "the coffee table overlaps the sectional by
 * four inches" is.
 *
 * The rules are pure and framework-free: they take a room and what is in it,
 * and return facts. Turning a fact into a sentence, in the reader's own unit,
 * belongs to the interface — the same split the opening rules already use.
 */

import { footprintRect, type PlacedFurniture } from "@/domain/furniture";
import {
  orientedRectContains,
  orientedRectCorners,
  orientedRectOverlap,
  orientedRectTurnedUnionOverlapArea,
  overhangs,
  rectOutsideFloor,
  rectOverhang,
  turnedUnionContains,
  type FloorPoint,
} from "@/domain/geometry";
import {
  pointInRoomPart,
  primaryRoomPart,
  roomPartCorners,
  roomPartRect,
  type Floor,
  type Room,
  type RoomPart,
  type WallSide,
} from "@/domain/room";

export type LayoutProblem =
  /** Two pieces occupying the same floor, and the least one must move. */
  | {
      readonly kind: "overlap";
      readonly instanceIds: readonly [string, string];
      readonly depthMeters: number;
    }
  /** A piece reaching through a wall, and how far past the inside face. */
  | {
      readonly kind: "crosses-wall";
      readonly instanceId: string;
      /** The room it stands in, whose wall it is going through. */
      readonly roomId: string;
      readonly wall: WallSide;
      readonly overhangMeters: number;
    }
  /** Two rooms in the same place. Blocks can be dropped on top of each other. */
  | {
      readonly kind: "rooms-overlap";
      readonly roomIds: readonly [string, string];
      readonly depthMeters: number;
    }
  /** A piece that is not in the room at all. */
  | { readonly kind: "outside-room"; readonly instanceId: string };

/**
 * Every problem with a layout, in a stable order: each piece's own problems in
 * placement order, then the pairs that overlap.
 *
 * Order matters because this list is read top to bottom while dragging, and a
 * list that reshuffles itself as a piece moves cannot be followed.
 */
export function checkLayout(
  floor: Floor,
  furniture: readonly PlacedFurniture[],
): readonly LayoutProblem[] {
  const problems: LayoutProblem[] = [];

  problems.push(...roomProblems(floor));

  for (const placed of furniture) {
    problems.push(...pieceProblems(floor, placed));
  }

  // Every pair once. A overlapping B is the same problem as B overlapping A.
  for (let i = 0; i < furniture.length; i += 1) {
    for (let j = i + 1; j < furniture.length; j += 1) {
      const a = furniture[i];
      const b = furniture[j];
      if (a === undefined || b === undefined) {
        continue;
      }

      const overlap = orientedRectOverlap(footprintRect(a), footprintRect(b));
      if (overlap !== null) {
        problems.push({
          kind: "overlap",
          instanceIds: [a.instance.id, b.instance.id],
          depthMeters: overlap.depthMeters,
        });
      }
    }
  }

  return problems;
}

/**
 * Where one piece stands, and whether it stands there properly.
 *
 * The room a piece is in is the room its footprint overlaps most. That remains
 * true at a doorway or in a concave outline where the center alone can give the
 * wrong answer.
 *
 * Reaching past that room's walls is reported even when another room is on the
 * far side. Furniture cannot occupy a wall.
 */
function pieceProblems(
  floor: Floor,
  placed: PlacedFurniture,
): readonly LayoutProblem[] {
  const rect = footprintRect(placed);
  const instanceId = placed.instance.id;
  const overlaps = floor.rooms
    .map((room) => ({
      room,
      area: orientedRectTurnedUnionOverlapArea(rect, room.parts),
    }))
    .sort((a, b) => b.area - a.area);
  const best = overlaps[0];
  if (best === undefined || best.area <= 0.000001) {
    return [{ kind: "outside-room", instanceId }];
  }
  const room = best.room;

  const footprintArea = rect.widthMeters * rect.depthMeters;
  if (best.area >= footprintArea - 0.000001) {
    return [];
  }

  if (room.parts.length === 1) {
    // Carried into the part's own frame, where the part is a plain box from
    // (0, 0) to its width and depth however it is turned on the floor. The
    // footprint keeps only the turn it has relative to the part.
    const part = primaryRoomPart(room);
    const local = {
      ...rect,
      center: pointInRoomPart(part, rect.center),
      rotationRadians: rect.rotationRadians - part.rotationRadians,
    };
    const extent = {
      widthMeters: part.widthMeters,
      depthMeters: part.depthMeters,
    };

    if (rectOutsideFloor(local, extent)) {
      return [{ kind: "outside-room", instanceId }];
    }

    const overhang = rectOverhang(local, extent);
    if (!overhangs(overhang)) {
      return [];
    }

    return wallProblems(room, instanceId, overhang);
  }

  return unionWallProblems(room, rect, instanceId);
}

function wallProblems(
  room: Room,
  instanceId: string,
  overhang: Record<WallSide, number>,
): readonly LayoutProblem[] {
  return (["north", "east", "south", "west"] as const)
    .filter((wall) => overhang[wall] > 0)
    .map((wall) => ({
      kind: "crosses-wall" as const,
      instanceId,
      roomId: room.id,
      wall,
      overhangMeters: overhang[wall],
    }));
}

/** Reports the nearest union boundary for footprint samples outside a room. */
function unionWallProblems(
  room: Room,
  rect: ReturnType<typeof footprintRect>,
  instanceId: string,
): readonly LayoutProblem[] {
  const corners = orientedRectCorners(rect);
  const samples = [
    ...corners,
    ...corners.map((point, index) => {
      const next = corners[(index + 1) % corners.length] ?? point;
      return {
        xMeters: (point.xMeters + next.xMeters) / 2,
        zMeters: (point.zMeters + next.zMeters) / 2,
      };
    }),
  ].filter((point) => !turnedUnionContains(room.parts, point));

  // A convex footprint can bridge a concave notch with every corner inside.
  // Every reflex corner of the union is a part corner or a crossing of two
  // part edges, so those points provide an interior sample for that case.
  if (samples.length === 0) {
    for (const point of unionVertexCandidates(room.parts)) {
      if (
        orientedRectContains(rect, point) &&
        !turnedUnionContains(room.parts, point)
      ) {
        samples.push(point);
      }
    }
  }

  const greatest: Partial<Record<WallSide, number>> = {};
  for (const point of samples) {
    const nearest = room.parts
      .flatMap((part) => {
        // In the part's own frame the walls face the axes again, wherever the
        // part is turned, so the distances stay real tape measurements.
        const local = pointInRoomPart(part, point);
        const choices: { wall: WallSide; distance: number }[] = [];
        if (local.xMeters < 0) {
          choices.push({ wall: "west", distance: -local.xMeters });
        } else if (local.xMeters > part.widthMeters) {
          choices.push({
            wall: "east",
            distance: local.xMeters - part.widthMeters,
          });
        }
        if (local.zMeters < 0) {
          choices.push({ wall: "north", distance: -local.zMeters });
        } else if (local.zMeters > part.depthMeters) {
          choices.push({
            wall: "south",
            distance: local.zMeters - part.depthMeters,
          });
        }
        return choices;
      })
      .sort((a, b) => a.distance - b.distance)[0];
    if (nearest !== undefined) {
      greatest[nearest.wall] = Math.max(
        greatest[nearest.wall] ?? 0,
        nearest.distance,
      );
    }
  }

  const problems = wallProblems(
    room,
    instanceId,
    Object.fromEntries(
      (["north", "east", "south", "west"] as const).map((wall) => [
        wall,
        greatest[wall] ?? 0,
      ]),
    ) as Record<WallSide, number>,
  );
  // The overlap-area test proved a crossing. Keep that fact visible even in a
  // degenerate sampling case caused by coincident floating-point edges.
  return problems.length > 0
    ? problems
    : [
        {
          kind: "crosses-wall",
          instanceId,
          roomId: room.id,
          wall: "north",
          overhangMeters: 0,
        },
      ];
}

/**
 * Every point where the union's outline can turn back on itself: part corners
 * and the crossings of two parts' edges. The Separating Axis Theorem cannot
 * answer "does this footprint bridge the notch", but the notch's own corner
 * always sits at one of these.
 */
function unionVertexCandidates(
  parts: readonly RoomPart[],
): readonly FloorPoint[] {
  const candidates: FloorPoint[] = [];
  const outlines = parts.map((part) => roomPartCorners(part));

  for (const corners of outlines) {
    candidates.push(...corners);
  }

  for (let i = 0; i < outlines.length; i += 1) {
    for (let j = i + 1; j < outlines.length; j += 1) {
      const a = outlines[i];
      const b = outlines[j];
      if (a === undefined || b === undefined) {
        continue;
      }
      for (let p = 0; p < a.length; p += 1) {
        for (let q = 0; q < b.length; q += 1) {
          const aFrom = a[p];
          const aTo = a[(p + 1) % a.length];
          const bFrom = b[q];
          const bTo = b[(q + 1) % b.length];
          if (
            aFrom === undefined ||
            aTo === undefined ||
            bFrom === undefined ||
            bTo === undefined
          ) {
            continue;
          }
          const crossing = segmentCrossing(aFrom, aTo, bFrom, bTo);
          if (crossing !== null) {
            candidates.push(crossing);
          }
        }
      }
    }
  }

  return candidates;
}

/** Where two segments cross, or null when they do not. */
function segmentCrossing(
  aFrom: FloorPoint,
  aTo: FloorPoint,
  bFrom: FloorPoint,
  bTo: FloorPoint,
): FloorPoint | null {
  const dax = aTo.xMeters - aFrom.xMeters;
  const daz = aTo.zMeters - aFrom.zMeters;
  const dbx = bTo.xMeters - bFrom.xMeters;
  const dbz = bTo.zMeters - bFrom.zMeters;
  const denominator = dax * dbz - daz * dbx;
  if (denominator === 0) {
    return null;
  }
  const fx = bFrom.xMeters - aFrom.xMeters;
  const fz = bFrom.zMeters - aFrom.zMeters;
  const t = (fx * dbz - fz * dbx) / denominator;
  const u = (fx * daz - fz * dax) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) {
    return null;
  }
  return {
    xMeters: aFrom.xMeters + dax * t,
    zMeters: aFrom.zMeters + daz * t,
  };
}

/**
 * Rooms standing on top of one another.
 *
 * Blocks carry their own positions, so two can be dropped in the same place.
 * That is a mistake and it is reported here rather than prevented, the same way
 * every other mistake in a layout is.
 */
function roomProblems(floor: Floor): readonly LayoutProblem[] {
  const problems: LayoutProblem[] = [];

  for (let i = 0; i < floor.rooms.length; i += 1) {
    for (let j = i + 1; j < floor.rooms.length; j += 1) {
      const a = floor.rooms[i];
      const b = floor.rooms[j];
      if (a === undefined || b === undefined) {
        continue;
      }

      // Each part at its true turn: the theorem separates what is actually
      // apart, where the parts' bounding boxes would cry wolf.
      const overlaps = a.parts.flatMap((partA) =>
        b.parts.flatMap((partB) => {
          const overlap = orientedRectOverlap(
            roomPartRect(partA),
            roomPartRect(partB),
          );
          return overlap === null ? [] : [overlap.depthMeters];
        }),
      );
      if (overlaps.length > 0) {
        problems.push({
          kind: "rooms-overlap",
          roomIds: [a.id, b.id],
          depthMeters: Math.min(...overlaps),
        });
      }
    }
  }

  return problems;
}

/**
 * The pieces named by a list of problems. What the plan view marks, so a
 * problem can be seen as well as read.
 */
export function troubledInstanceIds(
  problems: readonly LayoutProblem[],
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const problem of problems) {
    switch (problem.kind) {
      case "overlap":
        ids.add(problem.instanceIds[0]);
        ids.add(problem.instanceIds[1]);
        break;
      case "rooms-overlap":
        break;
      default:
        ids.add(problem.instanceId);
    }
  }
  return ids;
}
