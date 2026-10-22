/**
 * The doors and passages cut in a wall this room shares with another.
 *
 * When two rooms stand one wall thickness apart their wall bands lie over
 * each other, and one doorway cut in that wall opens through both. The
 * opening is stored on the room it was drawn in; this is how the room on
 * the other side knows about it, so the apartment list can show the door
 * under both and the panel can reach it from either. Windows are left
 * out: the wall is not open there.
 *
 * Two walls share when the owner's wall, pushed outward by the thickness
 * between the rooms, lands on a wall of this room facing the other way, and
 * the opening's span overlaps that wall's run. Walls square to the plan only.
 */

import { roomBounds, roomPart, type Room, type RoomPart } from "./room";
import { sharedWallThicknessMeters, type Floor } from "./floor";
import {
  pointAlongWall,
  wallOutwardNormal,
  type AxisWallSide,
  type Opening,
  type WallSide,
} from "./openings";

export type SharedOpening = {
  readonly owner: Room;
  readonly opening: Opening;
};

const FACING: Record<AxisWallSide, AxisWallSide> = {
  north: "south",
  south: "north",
  east: "west",
  west: "east",
};

const TOLERANCE_METERS = 0.000001;

export function sharedOpenings(
  floor: Floor,
  room: Room,
): readonly SharedOpening[] {
  return floor.rooms
    .filter((owner) => owner.id !== room.id)
    .flatMap((owner) => {
      const thickness = sharedWallThicknessMeters(floor, room, owner);
      const origin = roomBounds(owner).origin;
      return owner.openings.flatMap((opening) => {
        const part = roomPart(owner, opening.partId);
        if (
          opening.kind === "window" ||
          part === undefined ||
          part.rotationRadians !== 0 ||
          !isAxisWall(opening.wall)
        ) {
          return [];
        }
        const wall = opening.wall;
        const half = opening.widthMeters / 2;
        const [a, b] = [
          opening.centerMeters - half,
          opening.centerMeters + half,
        ].map((along) => {
          const at = pointAlongWall(owner, wall, along, part.id);
          return {
            xMeters: origin.xMeters + at.xMeters,
            zMeters: origin.zMeters + at.zMeters,
          };
        }) as [
          { xMeters: number; zMeters: number },
          { xMeters: number; zMeters: number },
        ];
        const normal = wallOutwardNormal(wall);
        const runsAlongX = wall === "north" || wall === "south";
        // The face of the wall this room would share, where it stands.
        const theirOuterFace = runsAlongX
          ? a.zMeters + normal.dz * thickness
          : a.xMeters + normal.dx * thickness;
        const span: [number, number] = runsAlongX
          ? [Math.min(a.xMeters, b.xMeters), Math.max(a.xMeters, b.xMeters)]
          : [Math.min(a.zMeters, b.zMeters), Math.max(a.zMeters, b.zMeters)];

        const meets = room.parts.some(
          (mine) =>
            mine.rotationRadians === 0 &&
            Math.abs(faceOf(mine, FACING[wall]) - theirOuterFace) <
              TOLERANCE_METERS &&
            overlaps(runOf(mine, runsAlongX), span),
        );
        return meets ? [{ owner, opening }] : [];
      });
    });
}

function isAxisWall(wall: WallSide): wall is AxisWallSide {
  return (
    wall === "north" || wall === "south" || wall === "east" || wall === "west"
  );
}

/** Where a square part's wall face lies, on the axis across that wall. */
function faceOf(part: RoomPart, wall: AxisWallSide): number {
  switch (wall) {
    case "north":
      return part.origin.zMeters;
    case "south":
      return part.origin.zMeters + part.depthMeters;
    case "west":
      return part.origin.xMeters;
    case "east":
      return part.origin.xMeters + part.widthMeters;
  }
}

/** A square part's run along X, or along Z. */
function runOf(part: RoomPart, alongX: boolean): [number, number] {
  return alongX
    ? [part.origin.xMeters, part.origin.xMeters + part.widthMeters]
    : [part.origin.zMeters, part.origin.zMeters + part.depthMeters];
}

function overlaps(a: [number, number], b: [number, number]): boolean {
  return Math.min(a[1], b[1]) - Math.max(a[0], b[0]) > TOLERANCE_METERS;
}
