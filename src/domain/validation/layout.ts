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
  corridorClearance,
  orientedRectOverlap,
  overhangs,
  rectOutsideFloor,
  rectOverhang,
} from "@/domain/geometry";
import {
  checkWalkway,
  walkwayCorridor,
  type Room,
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
      readonly wall: WallSide;
      readonly overhangMeters: number;
    }
  /** A piece that is not in the room at all. */
  | { readonly kind: "outside-room"; readonly instanceId: string }
  /** A route left narrower than it has to be to work. */
  | {
      readonly kind: "walkway-blocked";
      readonly walkwayId: string;
      readonly instanceIds: readonly string[];
      /** The width left at the route's narrowest point. */
      readonly clearMeters: number;
      /** How much of the minimum is missing. */
      readonly shortfallMeters: number;
    }
  /** A route that works, but is narrower than the width that was asked for. */
  | {
      readonly kind: "walkway-tight";
      readonly walkwayId: string;
      readonly instanceIds: readonly string[];
      readonly clearMeters: number;
      /** How much of the preferred width is missing. */
      readonly shortfallMeters: number;
    };

/**
 * Every problem with a layout, in a stable order: each piece's own problems in
 * placement order, then the pairs that overlap.
 *
 * Order matters because this list is read top to bottom while dragging, and a
 * list that reshuffles itself as a piece moves cannot be followed.
 */
export function checkLayout(
  room: Room,
  furniture: readonly PlacedFurniture[],
): readonly LayoutProblem[] {
  const floor = {
    widthMeters: room.widthMeters,
    depthMeters: room.depthMeters,
  };

  const problems: LayoutProblem[] = [];

  for (const placed of furniture) {
    const rect = footprintRect(placed);
    const instanceId = placed.instance.id;

    // Being outside the room says everything a wall crossing would, and says
    // it better, so the two are not both reported for one piece.
    if (rectOutsideFloor(rect, floor)) {
      problems.push({ kind: "outside-room", instanceId });
      continue;
    }

    const overhang = rectOverhang(rect, floor);
    if (overhangs(overhang)) {
      for (const wall of ["north", "east", "south", "west"] as const) {
        if (overhang[wall] > 0) {
          problems.push({
            kind: "crosses-wall",
            instanceId,
            wall,
            overhangMeters: overhang[wall],
          });
        }
      }
    }
  }

  problems.push(...walkwayProblems(room, furniture));

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
 * What each route has left, against the two widths it was given.
 *
 * The minimum is checked first and reported alone: a route that cannot be
 * walked down is not also worth telling somebody it is less comfortable than
 * they hoped. A route whose own numbers do not make sense is skipped, and the
 * form beside it says why.
 */
function walkwayProblems(
  room: Room,
  furniture: readonly PlacedFurniture[],
): readonly LayoutProblem[] {
  const intruders = furniture.map((placed) => ({
    id: placed.instance.id,
    rect: footprintRect(placed),
  }));

  return room.walkways.flatMap((walkway): readonly LayoutProblem[] => {
    if (checkWalkway(walkway) !== null) {
      return [];
    }

    // Measured against the preferred width, because that is the wider corridor
    // and so the one that sees everything narrowing the route.
    const { clearMeters, intruderIds } = corridorClearance(
      walkwayCorridor(walkway, walkway.preferredWidthMeters),
      intruders,
    );

    if (clearMeters < walkway.minimumWidthMeters) {
      return [
        {
          kind: "walkway-blocked",
          walkwayId: walkway.id,
          instanceIds: intruderIds,
          clearMeters,
          shortfallMeters: walkway.minimumWidthMeters - clearMeters,
        },
      ];
    }

    if (clearMeters < walkway.preferredWidthMeters) {
      return [
        {
          kind: "walkway-tight",
          walkwayId: walkway.id,
          instanceIds: intruderIds,
          clearMeters,
          shortfallMeters: walkway.preferredWidthMeters - clearMeters,
        },
      ];
    }

    return [];
  });
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
      case "walkway-blocked":
      case "walkway-tight":
        for (const id of problem.instanceIds) {
          ids.add(id);
        }
        break;
      default:
        ids.add(problem.instanceId);
    }
  }
  return ids;
}
