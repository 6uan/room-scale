import type { FloorPoint } from "@/domain/geometry";
import { roomBounds, type Room } from "@/domain/room";

export type RoomGridLine = {
  readonly from: FloorPoint;
  readonly to: FloorPoint;
};

/**
 * One measurement grid for a whole room, regardless of how many parts build it.
 *
 * Lines sit on whole meters of the floor itself, not on meters counted from the
 * room. Anchoring them to the room's own north-west corner made the grid slide
 * whenever a part was dragged north or west — the corner moved, so the whole
 * rhythm moved with it — while dragging south or east left it still, because
 * the corner stayed put. A grid that only sometimes moves is worse than either,
 * so it is nailed to the floor: the room slides across a rhythm that never
 * does, and neighbouring rooms share the same lines for free.
 *
 * The canvas clips them to the union, so a notch stays empty while every
 * occupied part shares the same meter rhythm.
 */
export function roomGridLines(
  room: Room,
  spacingMeters = 1,
): readonly RoomGridLine[] {
  if (spacingMeters <= 0) {
    return [];
  }

  const bounds = roomBounds(room);
  const west = bounds.origin.xMeters;
  const north = bounds.origin.zMeters;
  const east = west + bounds.widthMeters;
  const south = north + bounds.depthMeters;
  const lines: RoomGridLine[] = [];

  // Counted in whole steps rather than added up, so a hundred meters of floor
  // is still exactly on the meter. The first step is the one strictly past the
  // edge: a line lying on the wall is the wall, not a measurement.
  for (let step = firstStepPast(west, spacingMeters); ; step += 1) {
    const x = step * spacingMeters;
    if (x >= east) break;
    lines.push({
      from: { xMeters: x, zMeters: north },
      to: { xMeters: x, zMeters: south },
    });
  }

  for (let step = firstStepPast(north, spacingMeters); ; step += 1) {
    const z = step * spacingMeters;
    if (z >= south) break;
    lines.push({
      from: { xMeters: west, zMeters: z },
      to: { xMeters: east, zMeters: z },
    });
  }

  return lines;
}

/** The first whole multiple of the spacing that falls past `edge`. */
function firstStepPast(edge: number, spacingMeters: number): number {
  return Math.floor(edge / spacingMeters) + 1;
}
