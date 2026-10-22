/**
 * What a room takes with it when it moves.
 *
 * A room is moved to put it where the apartment has it, and the furniture
 * standing in it is part of the room as it was arranged: a sofa against the
 * north wall is still against the north wall after the room slides over.
 * So a move carries every piece whose footprint stands mostly in the room,
 * by exactly the room's own offset.
 *
 * Only a move. A room resized from its west wall has a new origin too, but
 * nothing in it was asked to go anywhere; the size is the tell, and a room
 * whose outline changed carries nothing.
 */

import type { Floor, Room } from "@/domain/room";
import { roomBounds } from "@/domain/room";
import { roomUnder } from "./gaps";
import {
  footprintRect,
  moveInstance,
  type FurnitureInstance,
  type PlacedFurniture,
} from "./instance";

export type RoomMove = {
  readonly before: Room;
  readonly after: Room;
};

export function carriedWithRooms(
  floor: Floor,
  furniture: readonly PlacedFurniture[],
  moves: readonly RoomMove[],
  exceptIds: readonly string[] = [],
): readonly FurnitureInstance[] {
  const offsets = new Map(
    moves.flatMap(({ before, after }) => {
      const was = roomBounds(before);
      const is = roomBounds(after);
      const resized =
        Math.abs(was.widthMeters - is.widthMeters) > 1e-9 ||
        Math.abs(was.depthMeters - is.depthMeters) > 1e-9;
      const dx = is.origin.xMeters - was.origin.xMeters;
      const dz = is.origin.zMeters - was.origin.zMeters;
      return resized || (dx === 0 && dz === 0) ? [] : [[before.id, { dx, dz }]];
    }),
  );
  if (offsets.size === 0) {
    return furniture.map(({ instance }) => instance);
  }

  return furniture.map(({ instance, product }) => {
    if (exceptIds.includes(instance.id)) {
      return instance;
    }
    const room = roomUnder(floor, footprintRect({ instance, product }));
    const offset = room === null ? undefined : offsets.get(room.id);
    return offset === undefined
      ? instance
      : moveInstance(instance, {
          xMeters: instance.position.xMeters + offset.dx,
          zMeters: instance.position.zMeters + offset.dz,
        });
  });
}
