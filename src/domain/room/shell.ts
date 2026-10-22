/**
 * The room as a solid: floor slabs and wall slabs, in floor coordinates,
 * ready to be stood up.
 *
 * This is the perspective view's whole input, and it is computed here rather
 * than in the scene so that it can be tested without a renderer, and so the
 * scene never has an opinion about where a wall is. Everything comes from
 * the same functions the plan draws with: a part's polygon for its floor,
 * `wallStretches` for which lengths of each side actually carry a wall, and
 * the room's own height for how far up they go. One Three.js unit is one
 * meter, X runs east and Z runs south, exactly as on the plan, so a point
 * here is a point there.
 */

import type { FloorPoint } from "@/domain/geometry";
import type { Floor } from "./floor";
import { partWallSides, wallOutwardNormalOnFloor } from "./openings";
import {
  partWallSegment,
  pointOnRoomPart,
  roomPartPolygon,
  type Room,
} from "./room";
import { wallStretches } from "./walls";

export type FloorSlab = {
  readonly roomId: string;
  readonly partId: string;
  /** The part's outline on the floor, in floor coordinates. */
  readonly polygon: readonly FloorPoint[];
};

/**
 * One straight run of wall, as a box.
 *
 * `center` is the box's center on the floor, already pushed outward by half
 * the thickness: the wall stands outside the floor it bounds, which is what
 * keeps the room's inside dimensions the ones that were measured. `angle`
 * turns the box's length axis from east to the wall's direction, about Y,
 * the same sense as a part's rotation.
 */
export type WallSlab = {
  readonly roomId: string;
  readonly partId: string;
  readonly center: FloorPoint;
  readonly lengthMeters: number;
  readonly thicknessMeters: number;
  readonly heightMeters: number;
  readonly angleRadians: number;
};

export type RoomShell = {
  readonly floors: readonly FloorSlab[];
  readonly walls: readonly WallSlab[];
};

export function apartmentShell(floor: Floor): RoomShell {
  const shells = floor.rooms.map((room) => roomShell(floor, room));
  return {
    floors: shells.flatMap((shell) => shell.floors),
    walls: shells.flatMap((shell) => shell.walls),
  };
}

export function roomShell(floor: Floor, room: Room): RoomShell {
  const floors: FloorSlab[] = room.parts.map((part) => ({
    roomId: room.id,
    partId: part.id,
    polygon: roomPartPolygon(part),
  }));

  const walls: WallSlab[] = room.parts.flatMap((part) =>
    partWallSides(part).flatMap((wall) => {
      const segment = partWallSegment(part, wall);
      const from = pointOnRoomPart(part, segment.from);
      const to = pointOnRoomPart(part, segment.to);
      const length = Math.hypot(
        to.xMeters - from.xMeters,
        to.zMeters - from.zMeters,
      );
      if (length === 0) {
        return [];
      }
      const direction = {
        dx: (to.xMeters - from.xMeters) / length,
        dz: (to.zMeters - from.zMeters) / length,
      };
      const outward = wallOutwardNormalOnFloor(part, wall);

      return wallStretches(floor, room, part, wall)
        .filter((stretch) => stretch.kind === "wall")
        .map((stretch) => {
          const mid = (stretch.startMeters + stretch.endMeters) / 2;
          const half = stretch.thicknessMeters / 2;
          return {
            roomId: room.id,
            partId: part.id,
            center: {
              xMeters: from.xMeters + direction.dx * mid + outward.dx * half,
              zMeters: from.zMeters + direction.dz * mid + outward.dz * half,
            },
            lengthMeters: stretch.endMeters - stretch.startMeters,
            thicknessMeters: stretch.thicknessMeters,
            heightMeters: room.heightMeters,
            angleRadians: Math.atan2(direction.dz, direction.dx),
          };
        });
    }),
  );

  return { floors, walls };
}
