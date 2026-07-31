"use client";

import { useEffect, useRef, useState } from "react";
import { openingListName } from "@/components/opening-name";
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
      {/* The button says what pressing it will do next, so the mode it turns
          on is visible in the one place that turned it on. */}
      <Header
        title="Apartment"
        action={drawingRoom ? "Drawing…" : "Add room"}
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
      selected={selected}
      onSelect={onSelect}
      onDoubleClick={beginRename}
      title="Double-click to rename"
    />
  );
}

function Header({
  title,
  action,
  active = false,
  onAction,
}: {
  title: string;
  action: string;
  active?: boolean;
  onAction: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="min-w-0 truncate text-xs uppercase tracking-[0.15em] opacity-50">
        {title}
      </h2>
      <button
        type="button"
        onClick={onAction}
        aria-pressed={active}
        className={`shrink-0 rounded px-1.5 py-0.5 text-xs hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10 ${
          active ? "bg-black/10 opacity-100 dark:bg-white/15" : "opacity-60"
        }`}
      >
        {action}
      </button>
    </div>
  );
}

/** One line of the list. Selection is the whole point of it. */
function Row({
  label,
  depth = false,
  troubled = false,
  selected,
  onSelect,
  onDoubleClick,
  title,
}: {
  label: string;
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
      className={`flex w-full min-w-0 items-center gap-2 rounded px-2 py-1 text-left text-sm ${
        depth ? "pl-6" : ""
      } ${
        selected
          ? "bg-black/10 font-medium dark:bg-white/15"
          : "hover:bg-black/5 dark:hover:bg-white/10"
      } ${troubled ? "text-red-600" : ""}`}
    >
      <span className="min-w-0 truncate">{label}</span>
    </button>
  );
}
