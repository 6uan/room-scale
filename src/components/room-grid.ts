import type { FloorPoint } from "@/domain/geometry";
import { roomBounds, type Room } from "@/domain/room";

export type RoomGridLine = {
  readonly from: FloorPoint;
  readonly to: FloorPoint;
};

/**
 * One measurement grid for a whole room, regardless of how many parts build it.
 *
 * Lines are expressed in floor coordinates and anchored at the room union's
 * north-west corner. The canvas clips them to the union, so a notch stays empty
 * while every occupied part shares the same meter rhythm.
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

  for (let x = west + spacingMeters; x < east; x += spacingMeters) {
    lines.push({
      from: { xMeters: x, zMeters: north },
      to: { xMeters: x, zMeters: south },
    });
  }

  for (let z = north + spacingMeters; z < south; z += spacingMeters) {
    lines.push({
      from: { xMeters: west, zMeters: z },
      to: { xMeters: east, zMeters: z },
    });
  }

  return lines;
}
