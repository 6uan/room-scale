import type { Opening, OpeningKind, Room } from "@/domain/room";

export function openingKindLabel(kind: OpeningKind): string {
  return kind === "door" ? "Door" : kind === "window" ? "Window" : "Passage";
}

/** Numbers each kind separately within one room. */
export function openingOrdinal(room: Room, opening: Opening): number {
  const index = room.openings.findIndex(
    (existing) => existing.id === opening.id,
  );
  if (index < 0) {
    return 1;
  }
  return (
    room.openings
      .slice(0, index)
      .filter((existing) => existing.kind === opening.kind).length + 1
  );
}

export function openingListName(room: Room, opening: Opening): string {
  return `${openingKindLabel(opening.kind)} ${openingOrdinal(room, opening)}`;
}

export function openingName(room: Room, opening: Opening): string {
  const roomName = room.name === "" ? "Room" : room.name;
  return `${roomName} ${openingListName(room, opening).toLowerCase()}`;
}
