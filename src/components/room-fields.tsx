"use client";

import { NumberField } from "@/components/number-field";
import { RoomOpeningsForm } from "@/components/room-openings-form";
import {
  ROOM_LENGTH_LIMITS,
  ROOM_ORIGIN_LIMITS,
  roomFloorAreaSquareMeters,
  SNAP_METERS,
  snapRoomOrigin,
  snapRoomResize,
  withOpenings,
  withOrigin,
  withRoomLength,
  type Floor,
  type Opening,
  type OpeningKind,
  type Room,
} from "@/domain/room";
import {
  displayUnitSuffix,
  formatArea,
  formatLength,
  type DisplayUnit,
} from "@/domain/units";

export type RoomFieldsProps = {
  /** The rest of the apartment, so a room can be snapped against it. */
  floor: Floor;
  room: Room;
  unit: DisplayUnit;
  onChange: (room: Room, gesture?: string) => void;
  onGestureEnd: () => void;
  onRemove: () => void;
  onAddOpening: (kind: OpeningKind) => void;
};

export function RoomFields({
  floor,
  room,
  unit,
  onChange,
  onGestureEnd,
  onRemove,
  onAddOpening,
}: RoomFieldsProps) {
  const name = room.name === "" ? "Room" : room.name;

  return (
    <div className="flex flex-col gap-5">
      {/* Design tools call the two axes of their canvas X and Y. The domain
          keeps Three.js' X/Z floor plane; this Y field is only that plan-space
          label, and still writes the room's z coordinate. */}
      <CompactGroup title="Position" unit={unit} columns={2}>
        <NumberField
          label={`${name} X position`}
          compactLabel="X"
          scrubGesture={`room-field:${room.id}:x`}
          unit={unit}
          meters={room.origin.xMeters}
          limits={ROOM_ORIGIN_LIMITS}
          onMetersChange={(xMeters, gesture) =>
            onChange(
              withOrigin(
                room,
                snapRoomOrigin(floor, room, { ...room.origin, xMeters }),
              ),
              gesture,
            )
          }
          onGestureEnd={onGestureEnd}
        />
        <NumberField
          label={`${name} Y position`}
          compactLabel="Y"
          scrubGesture={`room-field:${room.id}:y`}
          unit={unit}
          meters={room.origin.zMeters}
          limits={ROOM_ORIGIN_LIMITS}
          onMetersChange={(zMeters, gesture) =>
            onChange(
              withOrigin(
                room,
                snapRoomOrigin(floor, room, { ...room.origin, zMeters }),
              ),
              gesture,
            )
          }
          onGestureEnd={onGestureEnd}
        />
      </CompactGroup>

      <CompactGroup title="Size" unit={unit} columns={3}>
        <NumberField
          label={`${name} width`}
          compactLabel="W"
          scrubGesture={`room-field:${room.id}:width`}
          unit={unit}
          meters={room.widthMeters}
          limits={ROOM_LENGTH_LIMITS.widthMeters}
          onMetersChange={(meters, gesture) =>
            onChange(withRoomLength(room, "widthMeters", meters), gesture)
          }
          onScrubbedMetersChange={(meters, gesture) =>
            onChange(
              snapRoomResize(floor, room, "east", room.origin.xMeters + meters),
              gesture,
            )
          }
          onGestureEnd={onGestureEnd}
        />
        <NumberField
          label={`${name} height`}
          compactLabel="H"
          scrubGesture={`room-field:${room.id}:height`}
          unit={unit}
          meters={room.heightMeters}
          limits={ROOM_LENGTH_LIMITS.heightMeters}
          onMetersChange={(meters, gesture) =>
            onChange(withRoomLength(room, "heightMeters", meters), gesture)
          }
          onGestureEnd={onGestureEnd}
        />
        <NumberField
          label={`${name} depth`}
          compactLabel="D"
          scrubGesture={`room-field:${room.id}:depth`}
          unit={unit}
          meters={room.depthMeters}
          limits={ROOM_LENGTH_LIMITS.depthMeters}
          onMetersChange={(meters, gesture) =>
            onChange(withRoomLength(room, "depthMeters", meters), gesture)
          }
          onScrubbedMetersChange={(meters, gesture) =>
            onChange(
              snapRoomResize(
                floor,
                room,
                "south",
                room.origin.zMeters + meters,
              ),
              gesture,
            )
          }
          onGestureEnd={onGestureEnd}
        />
      </CompactGroup>

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
    </div>
  );
}

function CompactGroup({
  title,
  unit,
  columns,
  children,
}: {
  title: string;
  unit: DisplayUnit;
  columns: 2 | 3;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="sr-only">{title}</legend>
      <div className="flex items-baseline justify-between gap-2">
        <span aria-hidden="true" className="text-xs font-medium">
          {title}
        </span>
        <span className="text-xs opacity-50">{displayUnitSuffix(unit)}</span>
      </div>
      <div
        className={`grid min-w-0 gap-2 ${
          columns === 2 ? "grid-cols-2" : "grid-cols-3"
        }`}
      >
        {children}
      </div>
    </fieldset>
  );
}
