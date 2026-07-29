"use client";

import { placedNames, type PlacedFurniture } from "@/domain/furniture";
import { roomsAt, type Floor } from "@/domain/room";
import { isSelected, type Selection } from "@/components/selection";

export type ApartmentLayersProps = {
  floor: Floor;
  furniture: readonly PlacedFurniture[];
  selection: Selection;
  troubledIds: ReadonlySet<string>;
  onSelect: (selection: Selection) => void;
  onAddRoom: () => void;
  onAddWalkway: () => void;
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
  onAddRoom,
  onAddWalkway,
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
      <Header title="Apartment" action="Add room" onAction={onAddRoom} />

      <ul className="flex flex-col gap-1">
        {floor.rooms.map((room) => (
          <li key={room.id} className="flex flex-col">
            <Row
              label={room.name === "" ? "Unnamed room" : room.name}
              selected={isSelected(selection, "room", room.id)}
              onSelect={() => onSelect({ kind: "room", id: room.id })}
            />
            <ul className="flex flex-col">
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

      <Header title="Routes" action="Add route" onAction={onAddWalkway} />
      {floor.walkways.length === 0 ? (
        <p className="px-1 text-xs leading-relaxed opacity-50">
          None yet. A route is a walk that has to stay clear — to the door, to
          the guest room.
        </p>
      ) : (
        <ul className="flex flex-col">
          {floor.walkways.map((walkway) => (
            <li key={walkway.id}>
              <Row
                label={walkway.name === "" ? "Route" : walkway.name}
                selected={isSelected(selection, "walkway", walkway.id)}
                onSelect={() => onSelect({ kind: "walkway", id: walkway.id })}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Header({
  title,
  action,
  onAction,
}: {
  title: string;
  action: string;
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
        className="shrink-0 rounded px-1.5 py-0.5 text-xs opacity-60 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
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
}: {
  label: string;
  depth?: boolean;
  troubled?: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
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
