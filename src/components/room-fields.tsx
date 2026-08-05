"use client";

import { Plus, Trash2, Undo2 } from "lucide-react";
import { useState } from "react";
import { Disclosure } from "@/components/disclosure";
import { AngleField } from "@/components/angle-field";
import { IconButton, LabelledButton } from "@/components/icon-button";
import { NumberField } from "@/components/number-field";
import { Chip, ChipRow } from "@/components/panel/chip";
import { CornerGlyph, WallLine } from "@/components/panel/glyphs";
import { PanelRow } from "@/components/panel/row";
import { PanelSection } from "@/components/panel/section";
import { RoomOpeningsForm } from "@/components/room-openings-form";
import {
  PART_CORNERS,
  ROOM_LENGTH_LIMITS,
  ROOM_ORIGIN_LIMITS,
  cutLegLimits,
  defaultCornerCut,
  nextPartId,
  partWallSides,
  WALL_THICKNESS_LIMITS,
  roomFloorAreaSquareMeters,
  roomPartCut,
  snapRoomOrigin,
  snapRoomResize,
  withOrigin,
  withParts,
  withRoomLength,
  withRoomPartCut,
  withRoomPartLength,
  roomPartWallState,
  withRoomPartOrigin,
  withRoomPartRotation,
  withRoomPartWallState,
  withRoomWallThickness,
  wallThicknessMeters,
  type CutLeg,
  type Floor,
  type OpeningKind,
  type PartCorner,
  type Room,
  type WallState,
  type RoomPart,
  type WallSide,
} from "@/domain/room";
import {
  displayUnitSuffix,
  displayValueFromMeters,
  formatArea,
  type DisplayUnit,
} from "@/domain/units";

const WALL_TITLES: Record<WallSide, string> = {
  north: "North",
  "north-east": "North-east",
  east: "East",
  "south-east": "South-east",
  south: "South",
  "south-west": "South-west",
  west: "West",
  "north-west": "North-west",
};

/** The three, in the order the buttons offer them. */
const WALL_STATES: readonly WallState[] = ["auto", "open", "dividing"];

/** One word for the state, so the accessible name carries it. */
const WALL_STATE_WORDS: Record<WallState, string> = {
  auto: "walled",
  open: "open",
  dividing: "dividing",
};

/** The same three as the buttons print them. */
const WALL_STATE_BUTTONS: Record<WallState, string> = {
  auto: "Wall",
  open: "Open",
  dividing: "Dividing",
};

/**
 * Why you would want each, waiting under the pointer.
 *
 * The buttons draw what each one looks like and name it in a word; this is the
 * paragraph that used to be printed beside the pad and read by everybody every
 * time, whether or not they had a question.
 */
const WALL_STATE_HINTS: Record<WallState, string> = {
  auto: "Walled where this room's floor ends.",
  open: "A railing rather than a wall, and it takes no doors. The floor still ends here.",
  dividing:
    "A wall where this room's own floor carries on — a laundry in the corner of a kitchen. It takes a door like any other.",
};

/** Two letters for a chamfer, one for a square side. */
const WALL_INITIALS: Record<WallSide, string> = {
  north: "N",
  "north-east": "NE",
  east: "E",
  "south-east": "SE",
  south: "S",
  "south-west": "SW",
  west: "W",
  "north-west": "NW",
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
    <>
      <PanelSection
        title="Footprint"
        first
        action={
          compound ? (
            <IconButton
              label={`Remove ${shownLabel}`}
              icon={Trash2}
              size="small"
              tone="danger"
              onClick={() => removePart(shown)}
            />
          ) : undefined
        }
      >
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
          <PanelRow name="Sections" label="Section">
            {/* The row is the group; a second one inside it would announce the
                same set twice and break every query that names it. */}
            <div className="flex min-w-0 flex-1 gap-1">
              {room.parts.map((part, index) => (
                <Chip
                  key={part.id}
                  label={`Select ${roomName} section ${index + 1}`}
                  pressed={part.id === shown.id}
                  onClick={() => onSelectPart?.(part.id)}
                >
                  {index + 1}
                </Chip>
              ))}
            </div>
          </PanelRow>
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

          What the floor now measures rides on the same row: it is the answer
          to having pressed the button, and it had a row of its own with
          nothing else in it.
        */}
        <PanelRow name="Floor" label="Floor">
          <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <LabelledButton
              label="Add section"
              title="Another rectangle of this room's floor — two of them make an L, or a notch. Drawn on the plan."
              icon={Plus}
              pressed={drawingSection}
              onClick={onDrawSection ?? addPart}
            />
            <span className="text-[13px] tabular-nums opacity-55">
              {drawingSection
                ? "Drag on the plan"
                : formatArea(roomFloorAreaSquareMeters(room), unit)}
            </span>
          </div>
        </PanelRow>
      </PanelSection>

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
    </>
  );
}

/**
 * A room's own wall thickness, folded away until somebody wants it.
 *
 * Almost every room is built out of whatever the apartment is built out of,
 * and a field repeating the same number in fifteen rooms would be fifteen
 * chances to disagree with the plan. So it collapses to one line that reads
 * out what this room's walls actually are and where that number came from —
 * the shape a settings row takes when its value matters more often than its
 * controls do.
 *
 * Opened, the field shows the inherited number rather than an empty box:
 * typing over it is what makes it this room's, and "Use the apartment's"
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
  const own = room.wallThicknessMeters !== null;
  const meters = wallThicknessMeters(floor, room);

  // In the unit the field below is typed in, rather than through
  // `formatLength` — a wall is never feet, and `0' 4.5"` is a reading nobody
  // takes off a tape.
  const summary = `${Number(displayValueFromMeters(meters, unit).toFixed(2))} ${displayUnitSuffix(unit)}`;

  return (
    // Not "Walls": the row of sides above is called that, and one panel cannot
    // have two controls with one name.
    <Disclosure
      label="Wall thickness"
      summary={own ? summary : `${summary}, from the apartment`}
    >
      {/* The summary line above already says whose number this is, and the
          field below says what it is. A paragraph repeating both was the third
          telling. */}
      <NumberField
        label={`${name} wall thickness`}
        unit={unit}
        meters={meters}
        limits={WALL_THICKNESS_LIMITS}
        scrubGesture={`room-wall:${room.id}`}
        onMetersChange={(next, gesture) =>
          onChange(withRoomWallThickness(room, next), gesture)
        }
        onGestureEnd={onGestureEnd}
      />
      {own ? (
        <div className="flex justify-end">
          <LabelledButton
            label="Use the apartment's wall thickness"
            icon={Undo2}
            onClick={() => onChange(withRoomWallThickness(room, null))}
          />
        </div>
      ) : null}
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
      <PanelRow name="Position">
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
      </PanelRow>
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
      <PanelRow name="Size">
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
      </PanelRow>
      <AngleField
        label={`${label} angle`}
        compactLabel="∠"
        presets
        radians={part.rotationRadians}
        onRadiansChange={(radians) =>
          onChange(withRoomPartRotation(room, part.id, radians))
        }
      />
      <CornerCutChips
        room={room}
        part={part}
        label={label}
        onChange={onChange}
      />
      <WallStateChips
        room={room}
        part={part}
        label={label}
        onChange={onChange}
      />
      <CornerCutLegs
        room={room}
        part={part}
        label={label}
        unit={unit}
        onChange={onChange}
        onGestureEnd={onGestureEnd}
      />
    </>
  );

  return <div className="flex min-w-0 flex-col gap-4">{fields}</div>;
}

/** The two legs of a clipped corner, named the way the fields read. */
const CUT_LEGS: readonly { leg: CutLeg; compact: string; noun: string }[] = [
  { leg: "widthMeters", compact: "W", noun: "width" },
  { leg: "depthMeters", compact: "D", noun: "depth" },
];

/**
 * Which corner a pair of legs belongs to, in the label column's two letters.
 *
 * The column is 56px and "North-east corner" is not; the chip that clipped it
 * is directly above, drawn facing the same way, so the initials land on the
 * corner the reader has just pressed.
 */
const CUT_LABELS: Record<PartCorner, string> = {
  "north-west": "NW cut",
  "north-east": "NE cut",
  "south-east": "SE cut",
  "south-west": "SW cut",
};

/**
 * Which sides of this rectangle are walls: pick a side, then say what it is.
 *
 * One press used to cycle a side through all three, which meant the three
 * could never be seen at once — you found out what they were by pressing a
 * wall repeatedly and watching. Every drawing tool with this problem solves it
 * the same way: the kinds are a row of buttons each drawn in the kind it sets,
 * and the thing being changed is picked separately.
 *
 * The picker was a small drawing of the rectangle, which was a good argument
 * and a bad control — a diagram among rows of chips reads as something
 * dropped in from another program. It is a row of chips like everything else
 * now, and the plan beside it draws the room far better than 96 pixels could.
 */
function WallStateChips({
  room,
  part,
  label,
  onChange,
}: {
  room: Room;
  part: RoomPart;
  label: string;
  onChange: (room: Room, gesture?: string) => void;
}) {
  const sides = partWallSides(part);
  const [picked, setPicked] = useState<WallSide | null>(null);
  // A chamfer stops being a side the moment its corner is squared, and a side
  // that is gone cannot be the one the buttons are about to change.
  const selected = picked !== null && sides.includes(picked) ? picked : null;

  return (
    <PanelRow name="Walls" label="Walls" align="top">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <ChipRow name={`${label} wall`}>
          {sides.map((wall) => {
            const state = roomPartWallState(part, wall);
            return (
              <Chip
                key={wall}
                label={`${label} ${wall} wall, ${WALL_STATE_WORDS[state]}`}
                title={`${WALL_TITLES[wall]} wall · ${WALL_STATE_WORDS[state]}`}
                pressed={wall === selected}
                onClick={() => setPicked(wall === selected ? null : wall)}
              >
                {WALL_INITIALS[wall]}
              </Chip>
            );
          })}
        </ChipRow>

        {/*
          Always all three, drawn rather than described, and dimmed until there
          is a side for them to be about. A disabled row asks for the side; a
          row that acted on whichever side was last touched would change a wall
          somebody had stopped looking at.
        */}
        <ChipRow name={`${label} wall kind`}>
          {WALL_STATES.map((state) => (
            <Chip
              key={state}
              stacked
              disabled={selected === null}
              pressed={
                selected !== null && roomPartWallState(part, selected) === state
              }
              label={
                selected === null
                  ? `Make the selected wall ${WALL_STATE_WORDS[state]}`
                  : `Make the ${selected} wall ${WALL_STATE_WORDS[state]}`
              }
              title={WALL_STATE_HINTS[state]}
              onClick={() =>
                selected === null
                  ? undefined
                  : onChange(
                      withRoomPartWallState(room, part.id, selected, state),
                    )
              }
            >
              <WallLine state={state} />
              {WALL_STATE_BUTTONS[state]}
            </Chip>
          ))}
        </ChipRow>
      </div>
    </PanelRow>
  );
}

/**
 * Which corners are clipped rather than square.
 *
 * The obvious way to take a corner off a room is to drop a rotated square on
 * it and subtract, the way a drawing tool would. That produces a path, and a
 * path has no dimensions anybody can type: after the subtract, there is
 * nothing to put in a field to adjust that corner. What a builder says about
 * it is *"it's clipped, about three feet by three feet"* — two numbers, one
 * along each wall, which is what `CornerCutLegs` below holds.
 *
 * Each chip draws the corner it clips: two walls meeting at a right angle, or
 * the chamfer across them. The state is drawn twice over — the fill says the
 * corner is on, and the glyph says what being on did to it.
 */
function CornerCutChips({
  room,
  part,
  label,
  onChange,
}: {
  room: Room;
  part: RoomPart;
  label: string;
  onChange: (room: Room, gesture?: string) => void;
}) {
  return (
    <PanelRow name="Cut corners" label="Corners">
      <ChipRow name={`${label} corners`}>
        {PART_CORNERS.map((corner) => {
          const cut = roomPartCut(part, corner);
          return (
            <Chip
              key={corner}
              label={`${label} ${corner} corner cut`}
              title={`${WALL_TITLES[corner]} corner · ${
                cut === null
                  ? "square — press to clip it"
                  : "clipped — press to square it"
              }`}
              pressed={cut !== null}
              onClick={() =>
                onChange(
                  withRoomPartCut(
                    room,
                    part.id,
                    corner,
                    cut === null ? defaultCornerCut(part, corner) : null,
                  ),
                )
              }
            >
              <CornerGlyph corner={corner} cut={cut !== null} />
            </Chip>
          );
        })}
      </ChipRow>
    </PanelRow>
  );
}

/**
 * The exact legs of each clipped corner.
 *
 * Held to what the corner at the far end of the same side has left, because
 * two cuts cannot between them be longer than the wall.
 */
function CornerCutLegs({
  room,
  part,
  label,
  unit,
  onChange,
  onGestureEnd,
}: {
  room: Room;
  part: RoomPart;
  label: string;
  unit: DisplayUnit;
  onChange: (room: Room, gesture?: string) => void;
  onGestureEnd: () => void;
}) {
  const cutCorners = PART_CORNERS.filter(
    (corner) => roomPartCut(part, corner) !== null,
  );

  return (
    <>
      {cutCorners.map((corner) => {
        const cut = roomPartCut(part, corner);
        if (cut === null) {
          return null;
        }
        return (
          <PanelRow
            key={corner}
            name={`${WALL_TITLES[corner]} corner`}
            label={CUT_LABELS[corner]}
          >
            {CUT_LEGS.map(({ leg, compact, noun }) => (
              <NumberField
                key={leg}
                label={`${label} ${corner} corner ${noun}`}
                compactLabel={compact}
                scrubGesture={`room-part-cut:${part.id}:${corner}:${noun}`}
                unit={unit}
                meters={cut[leg]}
                limits={cutLegLimits(part, corner, leg)}
                onMetersChange={(meters, gesture) =>
                  onChange(
                    withRoomPartCut(room, part.id, corner, {
                      ...cut,
                      [leg]: meters,
                    }),
                    gesture,
                  )
                }
                onGestureEnd={onGestureEnd}
              />
            ))}
          </PanelRow>
        );
      })}
    </>
  );
}
