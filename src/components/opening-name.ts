import type { Opening, OpeningKind, Room, RoomPart } from "@/domain/room";

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

/** What an opening is called when nobody has called it anything: "Door 2". */
export function openingDefaultName(room: Room, opening: Opening): string {
  return `${openingKindLabel(opening.kind)} ${openingOrdinal(room, opening)}`;
}

export function openingListName(room: Room, opening: Opening): string {
  return opening.name ?? openingDefaultName(room, opening);
}

/**
 * The opening as a sentence names it. Its own name is specific enough on
 * its own; a numbered kind needs the room in front of it to be found.
 */
export function openingName(room: Room, opening: Opening): string {
  if (opening.name !== undefined) {
    return opening.name;
  }
  const roomName = room.name === "" ? "Room" : room.name;
  return `${roomName} ${openingDefaultName(room, opening).toLowerCase()}`;
}

/** A section as the list calls it: its own name, or its number. */
export function sectionLabel(part: RoomPart, index: number): string {
  return part.name ?? `Section ${index + 1}`;
}
