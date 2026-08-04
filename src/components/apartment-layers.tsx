"use client";

import {
  DoorOpen,
  MoveHorizontal,
  PanelsTopLeft,
  Sofa,
  Square,
  SquareDashed,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { openingListName } from "@/components/opening-name";
import { PanelHeader } from "@/components/panel-header";
import { placedNames, type PlacedFurniture } from "@/domain/furniture";
import { roomsAt, type Floor, type Room } from "@/domain/room";
import { isSelected, type Selection } from "@/components/selection";

export type ApartmentLayersProps = {
  floor: Floor;
  furniture: readonly PlacedFurniture[];
  selection: Selection;
  troubledIds: ReadonlySet<string>;
  onSelect: (selection: Selection) => void;
  onRoomChange: (room: Room) => void;
  onAddRoom: () => void;
  /** Whether the plan is waiting for a room to be drawn on it. */
  drawingRoom?: boolean;
};

/**
 * Everything in the apartment, as one list.
 *
 * Furniture is nested under the room it stands in, which is worked out from
 * where it sits rather than stored — so dragging a chair into the hall moves it
 * in this list too. A piece in no room at all is not hidden: it gets its own
 * group, because a thing you cannot find is worse than a thing in the wrong
 * place.
 */
export function ApartmentLayers({
  floor,
  furniture,
  selection,
  troubledIds,
  onSelect,
  onRoomChange,
  onAddRoom,
  drawingRoom = false,
}: ApartmentLayersProps) {
  const names = placedNames(furniture);
  const inRoom = (roomId: string | null) =>
    furniture
      .map((placed, index) => ({ placed, name: names[index] ?? "" }))
      .filter(
        ({ placed }) =>
          (roomsAt(floor, placed.instance.position)[0]?.id ?? null) === roomId,
      );

  const homeless = inRoom(null);

  return (
    <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-4">
      {/* Lit while the plan is waiting for a rectangle, so the mode it turns
          on is visible in the one place that turned it on. */}
      <PanelHeader
        title="Apartment"
        action="Add room"
        active={drawingRoom}
        onAction={onAddRoom}
      />

      <ul className="flex flex-col gap-1">
        {floor.rooms.map((room) => (
          <li key={room.id} className="flex flex-col">
            <RoomRow
              room={room}
              selected={isSelected(selection, "room", room.id)}
              onSelect={() => onSelect({ kind: "room", id: room.id })}
              onChange={onRoomChange}
            />
            <ul className="flex flex-col">
              {room.parts.length === 1
                ? null
                : room.parts.map((part, index) => (
                    <li key={part.id}>
                      <Row
                        label={`Section ${index + 1}`}
                        icon={SquareDashed}
                        depth
                        selected={isSelected(selection, "room-part", part.id)}
                        onSelect={() =>
                          onSelect({
                            kind: "room-part",
                            roomId: room.id,
                            id: part.id,
                          })
                        }
                      />
                    </li>
                  ))}
              {room.openings.map((opening) => (
                <li key={opening.id}>
                  <Row
                    label={openingListName(room, opening)}
                    icon={OPENING_ICONS[opening.kind]}
                    depth
                    selected={isSelected(selection, "opening", opening.id)}
                    onSelect={() =>
                      onSelect({
                        kind: "opening",
                        roomId: room.id,
                        id: opening.id,
                      })
                    }
                  />
                </li>
              ))}
              {inRoom(room.id).map(({ placed, name }) => (
                <li key={placed.instance.id}>
                  <Row
                    label={name}
                    icon={Sofa}
                    depth
                    troubled={troubledIds.has(placed.instance.id)}
                    selected={isSelected(
                      selection,
                      "instance",
                      placed.instance.id,
                    )}
                    onSelect={() =>
                      onSelect({ kind: "instance", id: placed.instance.id })
                    }
                  />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      {homeless.length === 0 ? null : (
        <div className="flex flex-col gap-1">
          <h3 className="text-xs uppercase tracking-[0.15em] text-red-600">
            In no room
          </h3>
          <ul className="flex flex-col">
            {homeless.map(({ placed, name }) => (
              <li key={placed.instance.id}>
                <Row
                  label={name}
                  icon={Sofa}
                  troubled
                  selected={isSelected(
                    selection,
                    "instance",
                    placed.instance.id,
                  )}
                  onSelect={() =>
                    onSelect({ kind: "instance", id: placed.instance.id })
                  }
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * A layer name is also its editor, as it is in a design tool.
 *
 * A click selects a room and a double-click turns its name into editable text.
 * Enter or leaving the field applies the name; Escape leaves it alone.
 */
function RoomRow({
  room,
  selected,
  onSelect,
  onChange,
}: {
  room: Room;
  selected: boolean;
  onSelect: () => void;
  onChange: (room: Room) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(room.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      const input = inputRef.current;
      input?.focus();
      input?.setSelectionRange(input.value.length, input.value.length);
    }
  }, [editing]);

  function beginRename(): void {
    setDraft(room.name);
    setEditing(true);
  }

  function applyRename(): void {
    if (draft !== room.name) {
      onChange({ ...room, name: draft });
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        aria-label={`Rename ${room.name === "" ? "unnamed room" : room.name}`}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={applyRename}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            applyRename();
          } else if (event.key === "Escape") {
            event.preventDefault();
            setDraft(room.name);
            setEditing(false);
          }
        }}
        className="w-full min-w-0 cursor-text rounded bg-black/15 px-2 py-1 text-sm font-medium outline-none caret-current dark:bg-white/20"
      />
    );
  }

  return (
    <Row
      label={room.name === "" ? "Unnamed room" : room.name}
      icon={Square}
      selected={selected}
      onSelect={onSelect}
      onDoubleClick={beginRename}
      title="Double-click to rename"
    />
  );
}

/** Which glyph stands for each kind of hole in a wall. */
const OPENING_ICONS = {
  door: DoorOpen,
  window: PanelsTopLeft,
  passage: MoveHorizontal,
} as const;

/** One line of the list. Selection is the whole point of it. */
function Row({
  label,
  icon: Icon,
  depth = false,
  troubled = false,
  selected,
  onSelect,
  onDoubleClick,
  title,
}: {
  label: string;
  icon: LucideIcon;
  depth?: boolean;
  troubled?: boolean;
  selected: boolean;
  onSelect: () => void;
  onDoubleClick?: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      onDoubleClick={onDoubleClick}
      title={title}
      className={`flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition-colors ${
        depth ? "pl-6" : ""
      } ${
        selected
          ? "bg-black/10 font-medium dark:bg-white/15"
          : "hover:bg-black/5 dark:hover:bg-white/10"
      } ${troubled ? "text-red-600" : ""}`}
    >
      {/* The glyph says what kind of thing the row is; the words say which
          one. Hidden from the name, so the row is still found by its words. */}
      <Icon
        aria-hidden="true"
        className={`size-3.5 shrink-0 ${troubled ? "" : "opacity-45"}`}
      />
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}
