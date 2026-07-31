"use client";

import { AngleField } from "@/components/angle-field";
import { NumberField } from "@/components/number-field";
import { RoomOpeningsForm } from "@/components/room-openings-form";
import {
  ROOM_LENGTH_LIMITS,
  ROOM_ORIGIN_LIMITS,
  roomFloorAreaSquareMeters,
  snapRoomOrigin,
  snapRoomResize,
  withOrigin,
  withParts,
  withRoomLength,
  withRoomPartLength,
  withRoomPartOrigin,
  withRoomPartRotation,
  type Floor,
  type OpeningKind,
  type Room,
  type RoomPart,
} from "@/domain/room";
import {
  displayUnitSuffix,
  formatArea,
  type DisplayUnit,
} from "@/domain/units";

export type RoomFieldsProps = {
  floor: Floor;
  room: Room;
  unit: DisplayUnit;
  onChange: (room: Room, gesture?: string) => void;
  onGestureEnd: () => void;
  onRemove: () => void;
  onAddOpening: (kind: OpeningKind) => void;
  placingOpeningKind?: OpeningKind | null;
  selectedPartId?: string | null;
  onSelectPart?: (partId: string | null) => void;
};

export function RoomFields({
  floor,
  room,
  unit,
  onChange,
  onGestureEnd,
  onRemove,
  onAddOpening,
  placingOpeningKind = null,
  selectedPartId = null,
  onSelectPart,
}: RoomFieldsProps) {
  const name = room.name === "" ? "Room" : room.name;
  const compound = room.parts.length > 1;

  function addPart(): void {
    const base = room.parts.at(-1);
    if (base === undefined) {
      return;
    }
    const id = nextPartId(room);
    const widthMeters = Math.max(
      ROOM_LENGTH_LIMITS.widthMeters.minMeters,
      base.widthMeters * 0.75,
    );
    const depthMeters = Math.max(
      ROOM_LENGTH_LIMITS.depthMeters.minMeters,
      base.depthMeters * 0.5,
    );
    const overlap = Math.min(0.1, depthMeters / 4);
    onChange(
      withParts(room, [
        ...room.parts,
        {
          id,
          origin: {
            xMeters: base.origin.xMeters + base.widthMeters / 2,
            zMeters: base.origin.zMeters + base.depthMeters - overlap,
          },
          widthMeters,
          depthMeters,
          rotationRadians: 0,
        },
      ]),
    );
    onSelectPart?.(id);
  }

  function removePart(part: RoomPart): void {
    if (room.parts.length === 1) {
      return;
    }
    onChange({
      ...room,
      parts: room.parts.filter((one) => one.id !== part.id),
      openings: room.openings.filter((opening) => opening.partId !== part.id),
    });
    if (room.parts.length === 2 || selectedPartId === part.id) {
      onSelectPart?.(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <CompactGroup title="Room" unit={unit} columns={1}>
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
      </CompactGroup>

      <div className="flex flex-col gap-4 border-t border-black/10 pt-4 dark:border-white/15">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium">
            {compound ? "Room sections" : "Footprint"}
          </span>
          <button
            type="button"
            onClick={addPart}
            className="rounded border border-black/15 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            Add section
          </button>
        </div>
        {room.parts.map((part, index) => (
          <RoomPartFields
            key={part.id}
            room={room}
            floor={floor}
            part={part}
            index={index}
            unit={unit}
            onChange={onChange}
            onGestureEnd={onGestureEnd}
            onRemove={() => removePart(part)}
            selected={part.id === selectedPartId}
            onSelect={() => onSelectPart?.(part.id)}
          />
        ))}
      </div>

      <p className="text-xs leading-relaxed opacity-60">
        {formatArea(roomFloorAreaSquareMeters(room), unit)} of floor.
        {compound
          ? " Overlapping sections count once, so rectangles can describe an L-shaped or notched room without inventing floor area at their seam."
          : null}
      </p>

      <RoomOpeningsForm
        room={room}
        placingKind={placingOpeningKind}
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

function RoomPartFields({
  floor,
  room,
  part,
  index,
  unit,
  onChange,
  onGestureEnd,
  onRemove,
  selected,
  onSelect,
}: {
  floor: Floor;
  room: Room;
  part: RoomPart;
  index: number;
  unit: DisplayUnit;
  onChange: (room: Room, gesture?: string) => void;
  onGestureEnd: () => void;
  onRemove: () => void;
  selected: boolean;
  onSelect: () => void;
}) {
  const roomName = room.name === "" ? "Room" : room.name;
  const compound = room.parts.length > 1;
  const label = compound ? `${roomName} section ${index + 1}` : roomName;
  // A turned section's edges lie on no axis line, so the axis-snapping paths
  // below would aim it at walls it cannot share. Its numbers stay exact and
  // unsnapped instead.
  const square = part.rotationRadians === 0;
  const fields = (
    <>
      <CompactGroup title="Position" unit={unit} columns={2}>
        <NumberField
          label={`${label} X position`}
          compactLabel="X"
          scrubGesture={`room-part-field:${part.id}:x`}
          unit={unit}
          meters={part.origin.xMeters}
          limits={ROOM_ORIGIN_LIMITS}
          onMetersChange={(xMeters, gesture) =>
            onChange(
              room.parts.length === 1 && square
                ? withOrigin(
                    room,
                    snapRoomOrigin(floor, room, {
                      ...part.origin,
                      xMeters,
                    }),
                  )
                : withRoomPartOrigin(room, part.id, {
                    ...part.origin,
                    xMeters,
                  }),
              gesture,
            )
          }
          onGestureEnd={onGestureEnd}
        />
        <NumberField
          label={`${label} Y position`}
          compactLabel="Y"
          scrubGesture={`room-part-field:${part.id}:y`}
          unit={unit}
          meters={part.origin.zMeters}
          limits={ROOM_ORIGIN_LIMITS}
          onMetersChange={(zMeters, gesture) =>
            onChange(
              room.parts.length === 1 && square
                ? withOrigin(
                    room,
                    snapRoomOrigin(floor, room, {
                      ...part.origin,
                      zMeters,
                    }),
                  )
                : withRoomPartOrigin(room, part.id, {
                    ...part.origin,
                    zMeters,
                  }),
              gesture,
            )
          }
          onGestureEnd={onGestureEnd}
        />
      </CompactGroup>
      <CompactGroup title="Size" unit={unit} columns={2}>
        <NumberField
          label={`${label} width`}
          compactLabel="W"
          scrubGesture={
            room.parts.length === 1
              ? `room-field:${room.id}:width`
              : `room-part-field:${part.id}:width`
          }
          unit={unit}
          meters={part.widthMeters}
          limits={ROOM_LENGTH_LIMITS.widthMeters}
          onMetersChange={(meters, gesture) =>
            onChange(
              withRoomPartLength(room, part.id, "widthMeters", meters),
              gesture,
            )
          }
          onScrubbedMetersChange={(meters, gesture) =>
            onChange(
              room.parts.length === 1 && square
                ? snapRoomResize(
                    floor,
                    room,
                    "east",
                    part.origin.xMeters + meters,
                  )
                : withRoomPartLength(room, part.id, "widthMeters", meters),
              gesture,
            )
          }
          onGestureEnd={onGestureEnd}
        />
        <NumberField
          label={`${label} depth`}
          compactLabel="D"
          scrubGesture={
            room.parts.length === 1
              ? `room-field:${room.id}:depth`
              : `room-part-field:${part.id}:depth`
          }
          unit={unit}
          meters={part.depthMeters}
          limits={ROOM_LENGTH_LIMITS.depthMeters}
          onMetersChange={(meters, gesture) =>
            onChange(
              withRoomPartLength(room, part.id, "depthMeters", meters),
              gesture,
            )
          }
          onScrubbedMetersChange={(meters, gesture) =>
            onChange(
              room.parts.length === 1 && square
                ? snapRoomResize(
                    floor,
                    room,
                    "south",
                    part.origin.zMeters + meters,
                  )
                : withRoomPartLength(room, part.id, "depthMeters", meters),
              gesture,
            )
          }
          onGestureEnd={onGestureEnd}
        />
      </CompactGroup>
      <AngleField
        label={`${label} angle`}
        radians={part.rotationRadians}
        onRadiansChange={(radians) =>
          onChange(withRoomPartRotation(room, part.id, radians))
        }
      />
    </>
  );

  if (!compound) {
    return <div className="flex flex-col gap-3">{fields}</div>;
  }

  return (
    <fieldset
      className={`flex flex-col gap-3 rounded-md border p-3 ${
        selected
          ? "border-black/35 bg-black/5 dark:border-white/40 dark:bg-white/10"
          : "border-black/10 dark:border-white/15"
      }`}
    >
      <legend className="sr-only">Section {index + 1}</legend>
      <div className="flex items-center justify-between">
        <button
          type="button"
          aria-label={`Select ${label}`}
          aria-pressed={selected}
          onClick={onSelect}
          className="rounded px-1 py-0.5 text-xs font-medium hover:bg-black/5 dark:hover:bg-white/10"
        >
          Section {index + 1}
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${label}`}
          className="text-xs underline underline-offset-4 opacity-60 hover:opacity-100"
        >
          Remove
        </button>
      </div>
      {fields}
    </fieldset>
  );
}

function nextPartId(room: Room): string {
  let number = room.parts.length + 1;
  while (room.parts.some((part) => part.id === `${room.id}-part-${number}`)) {
    number += 1;
  }
  return `${room.id}-part-${number}`;
}

function CompactGroup({
  title,
  unit,
  columns,
  children,
}: {
  title: string;
  unit: DisplayUnit;
  columns: 1 | 2;
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
        className={`grid min-w-0 gap-2 ${columns === 1 ? "grid-cols-1" : "grid-cols-2"}`}
      >
        {children}
      </div>
    </fieldset>
  );
}
