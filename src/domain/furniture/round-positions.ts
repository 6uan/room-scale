/**
 * Rounding where things are to whole inches, or whole centimeters, without
 * changing what anything measures.
 *
 * A room or a piece dragged before drags rounded sits at 8' 1.43", and a list
 * of positions like that is harder to check against a tape than it needs to
 * be. This moves each one to the nearest whole unit — and only moves: every
 * room is translated as one rigid thing, so no section, size, angle or cut
 * corner changes, and neither does any area.
 *
 * What it will not do is change how things meet. Moving everything to the
 * nearest unit independently would open shared walls (two rooms one 1.5" wall
 * apart cannot both sit on whole inches), pull a sofa off the wall it was
 * pushed against, or nudge two pieces into each other. So it works one axis at
 * a time, in clusters:
 *
 * - Things that meet on an axis move together on it, by the amount that
 *   rounds the first of them. Rooms meet across one wall's thickness, pieces
 *   meet by touching. What meets something left out of the selection does not
 *   move on that axis at all, and neither does a piece against a wall.
 * - A cluster moves the nearest way only if that changes no meeting — no
 *   room newly within a wall of another, nothing into anything it was clear
 *   of — and otherwise the other way, and otherwise not at all. A piece may
 *   land flush against a wall; it is never moved through one.
 * - Rooms carry the pieces standing in them, as a dragged room does, before
 *   the pieces are rounded in turn.
 */

import { orientedRectCorners, type OrientedRect } from "@/domain/geometry";
import {
  maxWallThicknessMeters,
  primaryRoomPart,
  roomBounds,
  withOrigin,
  withRooms,
  type Floor,
  type Room,
} from "@/domain/room";
import { roomUnder, wallGaps } from "./gaps";
import {
  footprintRect,
  moveInstance,
  type FurnitureInstance,
  type PlacedFurniture,
} from "./instance";

/** Floating-point slack: a millionth of a meter is touching. */
const EPSILON = 1e-6;

type Axis = "x" | "z";

type Box = {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
};

/** One thing to round: a room or a piece, by the number its X/Y fields show. */
type Item = {
  readonly id: string;
  readonly box: Box;
  readonly x: number;
  readonly z: number;
  /** Left out of the selection: it stays, and holds whatever meets it. */
  readonly fixed: boolean;
  /** Held on this axis by something outside the rounding, such as a wall. */
  readonly pinned: { readonly x: boolean; readonly z: boolean };
  /** Moves on this axis must leave it clear of what it was clear of. */
  readonly allows: (axis: Axis, shift: number) => boolean;
  /** Things that always move together, such as a group of pieces. */
  readonly together?: string | undefined;
};

export type RoundedPositions = {
  /** Every room, moved or not, in the floor's order. */
  readonly rooms: readonly Room[];
  /** Every piece, moved or not, in the order given. */
  readonly instances: readonly FurnitureInstance[];
};

/**
 * Rounds the selected rooms' and pieces' positions to whole units of
 * `unitMeters` (0.0254 for inches, 0.01 for centimeters), moving and never
 * resizing.
 */
export function roundPositions(
  floor: Floor,
  furniture: readonly PlacedFurniture[],
  selected: {
    readonly roomIds: readonly string[];
    readonly instanceIds: readonly string[];
  },
  unitMeters: number,
  /** Pieces gathered into a group, which move as one. */
  pieceGroups: readonly { readonly instanceIds: readonly string[] }[] = [],
): RoundedPositions {
  // Rooms first, meeting across one wall's thickness.
  const reach = maxWallThicknessMeters(floor);
  const roomItems: Item[] = floor.rooms.map((room) => {
    const primary = primaryRoomPart(room);
    return {
      id: room.id,
      box: boxOf(roomBounds(room)),
      x: primary.origin.xMeters,
      z: primary.origin.zMeters,
      fixed: !selected.roomIds.includes(room.id),
      pinned: { x: false, z: false },
      allows: () => true,
    };
  });
  const roomShift = shifts(roomItems, reach, unitMeters);
  const rooms = floor.rooms.map((room) => {
    const shift = roomShift.get(room.id) ?? { x: 0, z: 0 };
    if (shift.x === 0 && shift.z === 0) {
      return room;
    }
    const origin = roomBounds(room).origin;
    return withOrigin(room, {
      xMeters: origin.xMeters + shift.x,
      zMeters: origin.zMeters + shift.z,
    });
  });
  const movedFloor = withRooms(floor, rooms);

  // A piece goes with the room it stands in, as it does when the room is
  // dragged, so a sofa against a wall is still against it.
  const carried = furniture.map((placed) => {
    const under = roomUnder(floor, footprintRect(placed));
    const shift = under === null ? undefined : roomShift.get(under.id);
    return shift === undefined || (shift.x === 0 && shift.z === 0)
      ? placed
      : {
          ...placed,
          instance: moveInstance(placed.instance, {
            xMeters: placed.instance.position.xMeters + shift.x,
            zMeters: placed.instance.position.zMeters + shift.z,
          }),
        };
  });

  // Then pieces, meeting by touching, and kept off any wall they were off.
  const groupOf = new Map(
    pieceGroups.flatMap((group, index) =>
      group.instanceIds.map((id) => [id, `group-${index}`] as const),
    ),
  );
  const pieceItems: Item[] = carried.map((placed) => {
    const gaps = wallGaps(movedFloor, placed).filter(
      (gap) => gap.to === "wall",
    );
    const gap = (side: string) =>
      gaps.find((one) => one.side === side)?.gapMeters;
    const touching = (side: string) => {
      const value = gap(side);
      return value !== undefined && Math.abs(value) < EPSILON;
    };
    // Moving east by `shift` widens the west gap and narrows the east one.
    const stillClear = (before: number | undefined, after: number) =>
      before === undefined || before < -EPSILON || after >= -EPSILON;
    return {
      id: placed.instance.id,
      box: boxOf(footprintBounds(footprintRect(placed))),
      x: placed.instance.position.xMeters,
      z: placed.instance.position.zMeters,
      fixed: !selected.instanceIds.includes(placed.instance.id),
      pinned: {
        x: touching("west") || touching("east"),
        z: touching("north") || touching("south"),
      },
      allows: (axis, shift) =>
        axis === "x"
          ? stillClear(gap("west"), (gap("west") ?? 0) + shift) &&
            stillClear(gap("east"), (gap("east") ?? 0) - shift)
          : stillClear(gap("north"), (gap("north") ?? 0) + shift) &&
            stillClear(gap("south"), (gap("south") ?? 0) - shift),
      together: groupOf.get(placed.instance.id),
    };
  });
  const pieceShift = shifts(pieceItems, 0, unitMeters);
  const instances = carried.map(({ instance }) => {
    const shift = pieceShift.get(instance.id) ?? { x: 0, z: 0 };
    return shift.x === 0 && shift.z === 0
      ? instance
      : moveInstance(instance, {
          xMeters: instance.position.xMeters + shift.x,
          zMeters: instance.position.zMeters + shift.z,
        });
  });

  return { rooms, instances };
}

/** How far each item moves on each axis. */
function shifts(
  items: readonly Item[],
  reach: number,
  unitMeters: number,
): ReadonlyMap<string, { x: number; z: number }> {
  const x = axisShifts(items, "x", reach, unitMeters);
  const z = axisShifts(items, "z", reach, unitMeters);
  return new Map(
    items.map((item) => [
      item.id,
      { x: x.get(item.id) ?? 0, z: z.get(item.id) ?? 0 },
    ]),
  );
}

/**
 * One axis: cluster what meets, then move each cluster by the rounding of
 * its first member — the nearest way, else the other, else not at all —
 * checking every pair it could change against what has already been decided.
 */
function axisShifts(
  items: readonly Item[],
  axis: Axis,
  reach: number,
  unitMeters: number,
): ReadonlyMap<string, number> {
  const parent = items.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) {
      root = parent[root] ?? root;
    }
    return root;
  };
  const join = (a: number, b: number) => {
    parent[find(b)] = find(a);
  };
  items.forEach((a, i) => {
    items.forEach((b, j) => {
      if (j <= i) {
        return;
      }
      const sameGroup = a.together !== undefined && a.together === b.together;
      const meets =
        gapOn(axis, a.box, b.box, 0) <= reach + EPSILON &&
        overlapAcross(axis, a.box, b.box) > EPSILON;
      if (sameGroup || meets) {
        join(i, j);
      }
    });
  });

  const clusters = new Map<number, number[]>();
  items.forEach((_, index) => {
    const root = find(index);
    clusters.set(root, [...(clusters.get(root) ?? []), index]);
  });

  const decided = new Map<string, number>();
  const shiftOf = (id: string) => decided.get(id) ?? 0;

  for (const members of clusters.values()) {
    const inside = new Set(members);
    const group = members.map((index) => items[index]).filter(isItem);
    const first = group[0];
    if (
      first === undefined ||
      group.some((item) => item.fixed || item.pinned[axis])
    ) {
      continue;
    }
    const at = first[axis];
    const down = Math.floor(at / unitMeters + EPSILON) * unitMeters;
    const up = Math.ceil(at / unitMeters - EPSILON) * unitMeters;
    const candidates = [down - at, up - at]
      .filter((shift) => Math.abs(shift) > EPSILON)
      .sort((a, b) => Math.abs(a) - Math.abs(b));

    const accepted = candidates.find((shift) =>
      group.every(
        (item) =>
          item.allows(axis, shift) &&
          items.every((other, index) => {
            if (inside.has(index)) {
              return true;
            }
            // Relevant only if the two could meet once the other axis is
            // rounded too, which moves either by under one unit.
            if (
              gapAcross(axis, item.box, other.box) >
              reach + unitMeters + EPSILON
            ) {
              return true;
            }
            const before = gapOn(axis, item.box, other.box, 0);
            const after = gapOn(
              axis,
              item.box,
              other.box,
              shift - shiftOf(other.id),
            );
            return (
              before <= reach + EPSILON === after <= reach + EPSILON &&
              before < -EPSILON === after < -EPSILON
            );
          }),
      ),
    );
    if (accepted !== undefined) {
      for (const item of group) {
        decided.set(item.id, accepted);
      }
    }
  }
  return decided;
}

function isItem(item: Item | undefined): item is Item {
  return item !== undefined;
}

/**
 * The gap between two boxes along an axis, with the first shifted by
 * `shift`; negative when they overlap along it.
 */
function gapOn(axis: Axis, a: Box, b: Box, shift: number): number {
  const [aMin, aMax, bMin, bMax] =
    axis === "x"
      ? [a.minX + shift, a.maxX + shift, b.minX, b.maxX]
      : [a.minZ + shift, a.maxZ + shift, b.minZ, b.maxZ];
  return Math.max(bMin - aMax, aMin - bMax);
}

/** The gap between two boxes across an axis: along the other one. */
function gapAcross(axis: Axis, a: Box, b: Box): number {
  return gapOn(axis === "x" ? "z" : "x", a, b, 0);
}

/** How much two boxes overlap across an axis. */
function overlapAcross(axis: Axis, a: Box, b: Box): number {
  return -gapAcross(axis, a, b);
}

function boxOf(rect: {
  readonly origin: { readonly xMeters: number; readonly zMeters: number };
  readonly widthMeters: number;
  readonly depthMeters: number;
}): Box {
  return {
    minX: rect.origin.xMeters,
    maxX: rect.origin.xMeters + rect.widthMeters,
    minZ: rect.origin.zMeters,
    maxZ: rect.origin.zMeters + rect.depthMeters,
  };
}

function footprintBounds(rect: OrientedRect) {
  const corners = orientedRectCorners(rect);
  const xs = corners.map((corner) => corner.xMeters);
  const zs = corners.map((corner) => corner.zMeters);
  const minX = Math.min(...xs);
  const minZ = Math.min(...zs);
  return {
    origin: { xMeters: minX, zMeters: minZ },
    widthMeters: Math.max(...xs) - minX,
    depthMeters: Math.max(...zs) - minZ,
  };
}
