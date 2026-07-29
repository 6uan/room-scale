"use client";

import { NumberField } from "@/components/number-field";
import { RoomOpeningsForm } from "@/components/room-openings-form";
import {
  ROOM_LENGTH_LIMITS,
  ROOM_ORIGIN_LIMITS,
  roomFloorAreaSquareMeters,
  SNAP_METERS,
  snapRoomOrigin,
  withOpenings,
  withOrigin,
  withRoomLength,
  type Floor,
  type Opening,
  type OpeningKind,
  type Room,
} from "@/domain/room";
import { formatArea, formatLength, type DisplayUnit } from "@/domain/units";

export type RoomFieldsProps = {
  /** The rest of the apartment, so a room can be snapped against it. */
  floor: Floor;
  room: Room;
  unit: DisplayUnit;
  onChange: (room: Room) => void;
  onRemove: () => void;
  onAddOpening: (kind: OpeningKind) => void;
};

export function RoomFields({
  floor,
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
            onChange(
              withOrigin(
                room,
                snapRoomOrigin(floor, room, { ...room.origin, xMeters }),
              ),
            )
          }
        />
        <NumberField
          label={`${name} from north`}
          unit={unit}
          meters={room.origin.zMeters}
          limits={ROOM_ORIGIN_LIMITS}
          onMetersChange={(zMeters) =>
            onChange(
              withOrigin(
                room,
                snapRoomOrigin(floor, room, { ...room.origin, zMeters }),
              ),
            )
          }
        />
      </div>

      <p className="text-xs leading-relaxed opacity-60">
        {formatArea(roomFloorAreaSquareMeters(room), unit)} of floor. Bring a
        room within {formatLength(SNAP_METERS, unit)} of another and it snaps
        against it, sharing one wall — so a doorway cut in it opens both ways.
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
