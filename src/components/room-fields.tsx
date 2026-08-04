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
  nextPartId,
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
  /** Whether a drag on the plan is currently drawing one of this room's rectangles. */
  drawingSection?: boolean;
  onDrawSection?: () => void;
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
  drawingSection = false,
  onDrawSection,
  onAddOpening,
  placingOpeningKind = null,
  selectedPartId = null,
  onSelectPart,
  onSelectOpening,
  onRemoveOpening,
}: RoomFieldsProps) {
  const compound = room.parts.length > 1;
  const roomName = room.name === "" ? "Room" : room.name;

  /**
   * The section the panel is describing: the selected one, or the first.
   *
   * Falling back to the first means there is no state where the footprint has
   * nothing to show — selecting the room rather than a section still puts a
   * rectangle's measurements in front of you, which is what somebody who just
   * clicked a room wanted to read.
   */
  const selectedIndex = room.parts.findIndex(
    (part) => part.id === selectedPartId,
  );
  const shownIndex = selectedIndex === -1 ? 0 : selectedIndex;
  const shown = room.parts[shownIndex];
  const shownLabel = compound
    ? `${roomName} section ${shownIndex + 1}`
    : roomName;

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

  // A room is built from at least one rectangle everywhere else in the domain
  // — `primaryRoomPart` throws rather than return nothing, and `isValidRoom`
  // will not call a room without one valid. Nothing to draw is all this can
  // honestly say about a room that got there anyway.
  if (shown === undefined) {
    return null;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-4">
        {/*
          One heading, whatever the room is made of.

          It used to rename itself "Room sections" the moment a second
          rectangle appeared, which told a reader their footprint had turned
          into something else. It had not: a room has always been a union of
          rectangles, and one of them is the ordinary case rather than a
          different feature.
        */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Footprint</span>
          {compound ? (
            <IconButton
              label={`Remove ${shownLabel}`}
              icon={Trash2}
              size="small"
              tone="danger"
              onClick={() => removePart(shown)}
            />
          ) : null}
        </div>

        {/*
          One section's fields at a time, and a row to pick which.

          Every section used to be on screen at once, each in its own bordered
          card under its own "Section 1" heading — so adding a second rectangle
          doubled the panel, and adding a third trebled it. Which rectangle a
          number belongs to is a thing the plan says better than a heading
          does: the selected one is drawn selected, right beside these fields.

          The numbers here are positions in a row rather than names. They stay
          in the accessible labels, where a screen reader needs to tell two
          sections apart, and stay out of the fields below, where the panel
          only ever describes one.
        */}
        {compound ? (
          <div
            role="group"
            aria-label="Sections"
            className="flex flex-wrap gap-1"
          >
            {room.parts.map((part, index) => (
              <button
                key={part.id}
                type="button"
                aria-pressed={part.id === shown.id}
                aria-label={`Select ${roomName} section ${index + 1}`}
                onClick={() => onSelectPart?.(part.id)}
                className={`h-7 min-w-7 rounded-md px-2 text-xs font-medium tabular-nums transition-colors ${
                  part.id === shown.id
                    ? "bg-black/12 dark:bg-white/20"
                    : "bg-black/[0.05] opacity-70 hover:opacity-100 dark:bg-white/[0.08]"
                }`}
              >
                {index + 1}
              </button>
            ))}
          </div>
        ) : null}

        <RoomPartFields
          key={shown.id}
          room={room}
          floor={floor}
          part={shown}
          index={shownIndex}
          unit={unit}
          onChange={onChange}
          onGestureEnd={onGestureEnd}
        />

        {/*
          A mode, not a spawn.

          It used to drop a rectangle at a guessed offset from the last one and
          leave you typing four numbers to move it where it belonged. Now it
          arms the plan the way "Add room" already does, and the rectangle is
          drawn where it goes.

          Which the drag means is never inferred from where it lands. Rooms
          that share a wall sit one partition apart, and a rectangle drawn
          flush inside a space sits at zero — inches between the two — so
          reading "another room or another rectangle of this one" off the
          geometry would answer a structural question by pointer accident.
        */}
        <div className="flex flex-col gap-2">
          <div className="flex justify-start">
            <LabelledButton
              label="Add section"
              icon={Plus}
              pressed={drawingSection}
              onClick={onDrawSection ?? addPart}
            />
          </div>
          <p className="text-[13px] leading-relaxed opacity-60">
            {drawingSection
              ? "Drag on the plan to draw another rectangle of this room. It meets this room's other rectangles directly, and stops a wall short of any other room."
              : compound
                ? null
                : "A section is another rectangle of floor. Two of them make an L-shaped room, or a room with a notch taken out of one corner."}
          </p>
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

/** One section's measurements. Which section it is, the panel above says. */
function RoomPartFields({
  floor,
  room,
  part,
  index,
  unit,
  onChange,
  onGestureEnd,
}: {
  floor: Floor;
  room: Room;
  part: RoomPart;
  index: number;
  unit: DisplayUnit;
  onChange: (room: Room, gesture?: string) => void;
  onGestureEnd: () => void;
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

  return <div className="flex flex-col gap-3">{fields}</div>;
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
