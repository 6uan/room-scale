"use client";

import { NumberField } from "@/components/number-field";
import { RoomOpeningsForm } from "@/components/room-openings-form";
import { UnitToggle } from "@/components/unit-toggle";
import {
  ROOM_LENGTH_LIMITS,
  ROOM_ORIGIN_LIMITS,
  withOpenings,
  withOrigin,
  withRoom,
  withRoomLength,
  type Floor,
  type Opening,
  type OpeningKind,
  type Room,
} from "@/domain/room";
import { formatArea, type DisplayUnit } from "@/domain/units";
import { roomFloorAreaSquareMeters } from "@/domain/room";

/** A stud wall is about 0.114 m; a masonry one is thicker. */
const WALL_THICKNESS_LIMITS = { minMeters: 0.02, maxMeters: 0.6 };

export type FloorRoomsFormProps = {
  floor: Floor;
  unit: DisplayUnit;
  onFloorChange: (floor: Floor) => void;
  onUnitChange: (unit: DisplayUnit) => void;
  onAddRoom: () => void;
  onAddOpening: (room: Room, kind: OpeningKind) => void;
};

/**
 * The apartment, as the blocks it is built from.
 *
 * Each room is a rectangle with a name, a size, and a place on the floor, and
 * its own doors and windows are edited inside it — a doorway belongs to the
 * wall it is cut into, not to a list somewhere else.
 *
 * Wall thickness is asked once, at the top, because an apartment has one kind
 * of wall and asking per room would be asking the same question five times.
 */
export function FloorRoomsForm({
  floor,
  unit,
  onFloorChange,
  onUnitChange,
  onAddRoom,
  onAddOpening,
}: FloorRoomsFormProps) {
  function changeRoom(room: Room): void {
    onFloorChange(withRoom(floor, room));
  }

  function removeRoom(room: Room): void {
    onFloorChange({
      ...floor,
      rooms: floor.rooms.filter((existing) => existing.id !== room.id),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <UnitToggle unit={unit} onUnitChange={onUnitChange} />

      <NumberField
        label="Wall thickness"
        unit={unit}
        meters={floor.wallThicknessMeters}
        limits={WALL_THICKNESS_LIMITS}
        onMetersChange={(wallThicknessMeters) =>
          onFloorChange({ ...floor, wallThicknessMeters })
        }
      />

      {floor.rooms.length === 0 ? (
        <p className="text-sm opacity-60">
          No rooms yet. Add the one you are furnishing first — the others can
          come later, and they only have to be right where they touch.
        </p>
      ) : (
        <ul className="flex flex-col gap-5">
          {floor.rooms.map((room) => (
            <li key={room.id}>
              <RoomFields
                room={room}
                unit={unit}
                onChange={changeRoom}
                onRemove={() => removeRoom(room)}
                onAddOpening={(kind) => onAddOpening(room, kind)}
              />
            </li>
          ))}
        </ul>
      )}

      <div>
        <button
          type="button"
          onClick={onAddRoom}
          className="rounded-md border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Add a room
        </button>
      </div>
    </div>
  );
}

type RoomFieldsProps = {
  room: Room;
  unit: DisplayUnit;
  onChange: (room: Room) => void;
  onRemove: () => void;
  onAddOpening: (kind: OpeningKind) => void;
};

function RoomFields({
  room,
  unit,
  onChange,
  onRemove,
  onAddOpening,
}: RoomFieldsProps) {
  const name = room.name === "" ? "Room" : room.name;

  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <legend className="px-1 text-sm font-medium">{name}</legend>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${room.id}-name`} className="text-sm font-medium">
          Name
        </label>
        <input
          id={`${room.id}-name`}
          type="text"
          value={room.name}
          onChange={(event) => onChange({ ...room, name: event.target.value })}
          placeholder="Living room"
          className="rounded-md border border-black/15 bg-transparent px-2.5 py-1.5 text-sm dark:border-white/20"
        />
      </div>

      <div className="flex flex-wrap gap-4">
        <NumberField
          label={`${name} width`}
          unit={unit}
          meters={room.widthMeters}
          limits={ROOM_LENGTH_LIMITS.widthMeters}
          onMetersChange={(meters) =>
            onChange(withRoomLength(room, "widthMeters", meters))
          }
        />
        <NumberField
          label={`${name} depth`}
          unit={unit}
          meters={room.depthMeters}
          limits={ROOM_LENGTH_LIMITS.depthMeters}
          onMetersChange={(meters) =>
            onChange(withRoomLength(room, "depthMeters", meters))
          }
        />
        <NumberField
          label={`${name} ceiling`}
          unit={unit}
          meters={room.heightMeters}
          limits={ROOM_LENGTH_LIMITS.heightMeters}
          onMetersChange={(meters) =>
            onChange(withRoomLength(room, "heightMeters", meters))
          }
        />
      </div>

      {/* Where the block stands, measured to its north-west corner. */}
      <div className="flex flex-wrap gap-4">
        <NumberField
          label={`${name} from west`}
          unit={unit}
          meters={room.origin.xMeters}
          limits={ROOM_ORIGIN_LIMITS}
          onMetersChange={(xMeters) =>
            onChange(withOrigin(room, { ...room.origin, xMeters }))
          }
        />
        <NumberField
          label={`${name} from north`}
          unit={unit}
          meters={room.origin.zMeters}
          limits={ROOM_ORIGIN_LIMITS}
          onMetersChange={(zMeters) =>
            onChange(withOrigin(room, { ...room.origin, zMeters }))
          }
        />
      </div>

      <p className="text-xs opacity-60">
        {formatArea(roomFloorAreaSquareMeters(room), unit)} of floor.
      </p>

      <RoomOpeningsForm
        room={room}
        unit={unit}
        onOpeningsChange={(openings: readonly Opening[]) =>
          onChange(withOpenings(room, openings))
        }
        onAddOpening={onAddOpening}
      />

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="text-xs underline underline-offset-4 opacity-60 hover:opacity-100"
        >
          Remove room
        </button>
      </div>
    </fieldset>
  );
}
