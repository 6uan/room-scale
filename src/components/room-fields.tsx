"use client";

import { Plus, Trash2, Undo2 } from "lucide-react";
import { Disclosure } from "@/components/disclosure";
import { AngleField } from "@/components/angle-field";
import { IconButton, LabelledButton } from "@/components/icon-button";
import { NumberField } from "@/components/number-field";
import { RoomOpeningsForm } from "@/components/room-openings-form";
import {
  ROOM_LENGTH_LIMITS,
  ROOM_ORIGIN_LIMITS,
  WALL_SIDES,
  WALL_THICKNESS_LIMITS,
  exteriorThicknessMeters,
  interiorThicknessMeters,
  roomFloorAreaSquareMeters,
  snapRoomOrigin,
  snapRoomResize,
  withOrigin,
  withParts,
  withRoomLength,
  withRoomPartLength,
  withRoomPartOrigin,
  withRoomPartRotation,
  withRoomPartWallOpen,
  withRoomWallThickness,
  type Floor,
  type OpeningKind,
  type Room,
  type RoomPart,
} from "@/domain/room";
import {
  displayUnitSuffix,
  displayValueFromMeters,
  formatArea,
  type DisplayUnit,
} from "@/domain/units";

/** Where each wall sits in the compass pad, drawn as the plan is drawn. */
const WALL_CELLS: Record<(typeof WALL_SIDES)[number], string> = {
  north: "col-start-2 row-start-1",
  east: "col-start-3 row-start-2",
  south: "col-start-2 row-start-3",
  west: "col-start-1 row-start-2",
};

const WALL_TITLES: Record<(typeof WALL_SIDES)[number], string> = {
  north: "North",
  east: "East",
  south: "South",
  west: "West",
};

export type RoomFieldsProps = {
  floor: Floor;
  room: Room;
  unit: DisplayUnit;
  onChange: (room: Room, gesture?: string) => void;
  onGestureEnd: () => void;
  onAddOpening: (kind: OpeningKind) => void;
  placingOpeningKind?: OpeningKind | null;
  selectedPartId?: string | null;
  onSelectPart?: (partId: string | null) => void;
  onSelectOpening?: (openingId: string) => void;
  onRemoveOpening?: (openingId: string) => void;
};

export function RoomFields({
  floor,
  room,
  unit,
  onChange,
  onGestureEnd,
  onAddOpening,
  placingOpeningKind = null,
  selectedPartId = null,
  onSelectPart,
  onSelectOpening,
  onRemoveOpening,
}: RoomFieldsProps) {
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
          openWalls: [],
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
      <div className="flex flex-col gap-4">
        <span className="text-sm font-medium">
          {compound ? "Room sections" : "Footprint"}
        </span>
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

        {/*
          Named in words rather than worn as a `+`.

          A bare plus beside "Footprint" said nothing about what it would add,
          and "section" is not a word anybody arrives already knowing — so the
          button says it and, until a room has used one, a line underneath says
          what one is for. This control is temporary: once a section can be
          drawn against a room on the plan, drawing one *is* adding one, and a
          button for it stops earning its place.
        */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-start">
            <LabelledButton label="Add section" icon={Plus} onClick={addPart} />
          </div>
          {compound ? null : (
            <p className="text-[13px] leading-relaxed opacity-60">
              A section is another rectangle of floor. Two of them make an
              L-shaped room, or a room with a notch taken out of one corner.
            </p>
          )}
        </div>
      </div>

      <p className="text-[13px] leading-relaxed opacity-60">
        {formatArea(roomFloorAreaSquareMeters(room), unit)} of floor.
        {compound
          ? " Overlapping sections count once, so rectangles can describe an L-shaped or notched room without inventing floor area at their seam."
          : null}
      </p>

      <RoomOpeningsForm
        room={room}
        placingKind={placingOpeningKind}
        onAddOpening={onAddOpening}
        onSelectOpening={(opening) => onSelectOpening?.(opening.id)}
        onRemoveOpening={(opening) => onRemoveOpening?.(opening.id)}
      />

      <WallThicknessFields
        floor={floor}
        room={room}
        unit={unit}
        onChange={onChange}
        onGestureEnd={onGestureEnd}
      />
    </div>
  );
}

/** The two thicknesses, named the way they read in the summary line. */
const WALL_KINDS = [
  { kind: "exterior", noun: "shell", label: "Exterior wall thickness" },
  { kind: "interior", noun: "partitions", label: "Interior wall thickness" },
] as const;

/**
 * A room's own wall thicknesses, folded away until somebody wants them.
 *
 * Almost every room is built out of whatever the apartment is built out of,
 * and a pair of fields repeating the same two numbers in fifteen rooms would
 * be fifteen chances to disagree with the plan. So it collapses to one line
 * that reads out what this room's walls actually are and where those numbers
 * came from — the shape a settings row takes when its value matters more often
 * than its controls do.
 *
 * Opened, the fields show the inherited numbers rather than empty boxes:
 * typing over one is what makes it this room's, and "Use the apartment's"
 * hands it back. A field that started blank would be asking for a measurement
 * where the honest answer is already on the screen.
 */
function WallThicknessFields({
  floor,
  room,
  unit,
  onChange,
  onGestureEnd,
}: {
  floor: Floor;
  room: Room;
  unit: DisplayUnit;
  onChange: (room: Room, gesture?: string) => void;
  onGestureEnd: () => void;
}) {
  const name = room.name === "" ? "Room" : room.name;
  const own =
    room.exteriorWallThicknessMeters !== null ||
    room.interiorWallThicknessMeters !== null;

  // In the unit the fields below are typed in, rather than through
  // `formatLength` — a wall is never feet, and `0' 4.5"` is a reading nobody
  // takes off a tape.
  const summary = WALL_KINDS.map(({ kind, noun }) => {
    const meters =
      kind === "exterior"
        ? exteriorThicknessMeters(floor, room)
        : interiorThicknessMeters(floor, room);
    const value = displayValueFromMeters(meters, unit);
    return `${Number(value.toFixed(2))} ${displayUnitSuffix(unit)} ${noun}`;
  }).join(", ");

  return (
    <Disclosure
      label="Walls"
      summary={own ? summary : `${summary}, from the apartment`}
    >
      <p className="text-[13px] leading-relaxed opacity-60">
        {own
          ? `Measured for ${name} in particular. Every other room keeps the apartment's.`
          : "The apartment's, until this room is measured on its own. A bathroom's plumbing wall is fatter than the partitions around it."}
      </p>
      {WALL_KINDS.map(({ kind, label }) => {
        const overridden =
          (kind === "exterior"
            ? room.exteriorWallThicknessMeters
            : room.interiorWallThicknessMeters) !== null;
        return (
          <div key={kind} className="flex flex-col gap-2">
            <NumberField
              label={`${name} ${label.toLowerCase()}`}
              unit={unit}
              meters={
                kind === "exterior"
                  ? exteriorThicknessMeters(floor, room)
                  : interiorThicknessMeters(floor, room)
              }
              limits={WALL_THICKNESS_LIMITS}
              scrubGesture={`room-wall:${room.id}:${kind}`}
              onMetersChange={(meters, gesture) =>
                onChange(withRoomWallThickness(room, kind, meters), gesture)
              }
              onGestureEnd={onGestureEnd}
            />
            {overridden ? (
              <div className="flex justify-end">
                <LabelledButton
                  label={`Use the apartment's ${label.toLowerCase()}`}
                  icon={Undo2}
                  onClick={() =>
                    onChange(withRoomWallThickness(room, kind, null))
                  }
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </Disclosure>
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
      {/*
        Width, depth and height together, because a room is quoted as all
        three at once. Height sat alone in a group of its own labelled "Room",
        which is what was left after width and depth moved down to the section
        — an orphan of the refactor rather than anything a reader wanted.

        It is still the *room's* height while W and D are this section's: one
        apartment, one ceiling. Every section shows the same number and editing
        any of them edits the room, which reads plainly enough once only the
        selected section is on screen.
      */}
      <CompactGroup title="Size" unit={unit} columns={3}>
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
        <NumberField
          label={`${roomName} height`}
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
      <AngleField
        label={`${label} angle`}
        presets
        radians={part.rotationRadians}
        onRadiansChange={(radians) =>
          onChange(withRoomPartRotation(room, part.id, radians))
        }
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Open walls</legend>
        <span aria-hidden="true" className="text-xs font-medium">
          Open walls
        </span>
        {/*
          Laid out as the room is, rather than as a row of four words. Which
          wall "east" is takes a moment to work out from a list and none at all
          from a square — and the plan beside it is drawn the same way up.
        */}
        <div className="flex items-center gap-3">
          <div className="grid shrink-0 grid-cols-3 grid-rows-3 gap-0.5">
            {WALL_SIDES.map((wall) => {
              const open = part.openWalls.includes(wall);
              return (
                <button
                  key={wall}
                  type="button"
                  aria-pressed={open}
                  aria-label={`${label} ${wall} wall open`}
                  title={`${WALL_TITLES[wall]} wall`}
                  onClick={() =>
                    onChange(withRoomPartWallOpen(room, part.id, wall, !open))
                  }
                  className={`flex size-6 items-center justify-center rounded-[5px] text-[11px] font-medium transition-colors ${WALL_CELLS[wall]} ${
                    open
                      ? "bg-black/15 dark:bg-white/25"
                      : "bg-black/[0.05] opacity-50 hover:opacity-100 dark:bg-white/[0.08]"
                  }`}
                >
                  {WALL_TITLES[wall][0]}
                </button>
              );
            })}
            <span
              aria-hidden="true"
              className="col-start-2 row-start-2 m-1 rounded-[3px] border border-current opacity-20"
            />
          </div>
          <p className="text-xs leading-relaxed opacity-60">
            An open wall is drawn as a railing and carries no doors or windows.
            The floor still ends there.
          </p>
        </div>
      </fieldset>
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
        <IconButton
          label={`Remove ${label}`}
          icon={Trash2}
          size="small"
          tone="danger"
          onClick={onRemove}
        />
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

/** Spelled out, because Tailwind reads these classes rather than building them. */
const GRID_COLUMNS: Record<1 | 2 | 3, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
};

function CompactGroup({
  title,
  unit,
  columns,
  children,
}: {
  title: string;
  unit: DisplayUnit;
  columns: 1 | 2 | 3;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="sr-only">{title}</legend>
      <div className="flex items-baseline justify-between gap-2">
        <span aria-hidden="true" className="text-sm font-medium">
          {title}
        </span>
        <span className="text-[13px] opacity-55">
          {displayUnitSuffix(unit)}
        </span>
      </div>
      <div className={`grid min-w-0 gap-2 ${GRID_COLUMNS[columns]}`}>
        {children}
      </div>
    </fieldset>
  );
}
