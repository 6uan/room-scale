"use client";

import {
  DoorOpen,
  MoveHorizontal,
  PanelsTopLeft,
  type LucideIcon,
} from "lucide-react";
import { IconButton } from "@/components/icon-button";
import { NumberField } from "@/components/number-field";
import { Chip, ChipRow } from "@/components/panel/chip";
import { PanelRow } from "@/components/panel/row";
import { PanelSection } from "@/components/panel/section";
import {
  openingDefaultName,
  openingListName,
  openingName,
} from "@/components/opening-name";
import { TextField } from "@/components/product-form";
import {
  checkOpening,
  type Door,
  MIN_OPENING_METERS,
  type Opening,
  openingGapsMeters,
  openingHeights,
  type OpeningKind,
  type OpeningProblem,
  partWallSides,
  type Room,
  roomPart,
  wallLengthMeters,
  type WallSide,
  withOpeningEndGap,
  withOpeningHeights,
  withOpeningName,
  withOpeningStartGap,
  withOpeningWall,
  withOpeningWidthFromStart,
} from "@/domain/room";
import { formatLength, type DisplayUnit } from "@/domain/units";

const KINDS: readonly { kind: OpeningKind; label: string; icon: LucideIcon }[] =
  [
    { kind: "door", label: "door", icon: DoorOpen },
    { kind: "window", label: "window", icon: PanelsTopLeft },
    { kind: "passage", label: "passage", icon: MoveHorizontal },
  ];

/**
 * Which side of the plan each wall is drawn on, so the list matches the view.
 *
 * A clipped corner leaves a chamfer, which is named for the corner it replaced
 * and takes a door like any other wall.
 */
const WALL_LABELS: Record<WallSide, string> = {
  north: "North wall (top)",
  "north-east": "North-east corner",
  east: "East wall (right)",
  "south-east": "South-east corner",
  south: "South wall (bottom)",
  "south-west": "South-west corner",
  west: "West wall (left)",
  "north-west": "North-west corner",
};

/** Two letters for a chamfer, one for a square side, as the room's wall row has them. */
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

export type RoomOpeningsFormProps = {
  room: Room;
  placingKind?: OpeningKind | null;
  onAddOpening: (kind: OpeningKind) => void;
  /** Opens the opening's own editor, the same selection the list makes. */
  onSelectOpening?: (opening: Opening) => void;
};

/**
 * Arms the plan to put a door, window, or passage on this room's wall, and
 * lists what the room already has — each row selectable for exact editing.
 *
 * The rows used to carry a red trash can each, which put three or four of
 * them in one panel beside the room's own. A row is the way to the opening
 * now, and the opening's panel is where it is deleted, by name.
 */
export function RoomOpeningsForm({
  room,
  placingKind = null,
  onAddOpening,
  onSelectOpening,
}: RoomOpeningsFormProps) {
  return (
    <PanelSection
      title="Openings"
      action={
        /* Lit while the plan is waiting for the wall, rather than reworded:
           the button you press to stop is the one you pressed to start. */
        <div className="flex items-center gap-0.5">
          {KINDS.map(({ kind, label, icon }) => (
            <IconButton
              key={kind}
              label={`Add ${label}`}
              icon={icon}
              size="small"
              pressed={placingKind === kind}
              onClick={() => onAddOpening(kind)}
            />
          ))}
        </div>
      }
    >
      {room.openings.length === 0 ? null : (
        <ul className="flex flex-col gap-1">
          {room.openings.map((opening) => (
            <li key={opening.id} className="flex">
              <button
                type="button"
                onClick={() => onSelectOpening?.(opening)}
                className="min-w-0 flex-1 truncate rounded px-1.5 py-1 text-left text-sm hover:bg-black/5 dark:hover:bg-white/10"
              >
                {openingListName(room, opening)}
                <span className="opacity-50"> · {opening.wall} wall</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/*
        One line, and only where it is the next thing to do. What an opening
        already in the list can be done to, its own row and the plan show
        better than a sentence under them does.
      */}
      {placingKind === null && room.openings.length > 0 ? null : (
        <p className="text-xs leading-relaxed opacity-55">
          {placingKind === null
            ? "Pick a kind, then click a wall."
            : "Click a wall to place it. Esc to stop."}
        </p>
      )}
    </PanelSection>
  );
}

export type OpeningFieldsProps = {
  opening: Opening;
  room: Room;
  unit: DisplayUnit;
  /** `gesture` groups a scrub of one field into one undo step. */
  onChange: (opening: Opening, gesture?: string) => void;
  onGestureEnd?: () => void;
};

/**
 * Exact editing for one selected opening, on the same rows as every other
 * panel: chips for a choice of two or three, compact fields for a length.
 *
 * It was the last panel still built from loose controls — a bordered box
 * repeating the panel's own name, a dropdown for the wall and one for each
 * of the door's three settings, and a feet-and-inches echo under each field.
 * A dropdown hides the two or three answers there are until it is opened;
 * chips show them, and the wall chips read N, E, S, W the way the room's own
 * wall row does.
 */
export function OpeningFields({
  opening,
  room,
  unit,
  onChange,
  onGestureEnd,
}: OpeningFieldsProps) {
  // This opening's own section, rather than the room's first: walls differ in
  // length between sections, and a chamfer exists only on the one that is cut.
  const part = roomPart(room, opening.partId);
  const wallLength = wallLengthMeters(room, opening.wall, opening.partId);
  const problem = checkOpening(room, opening);
  const name = openingName(room, opening);
  const gaps = openingGapsMeters(room, opening);
  const heights = openingHeights(opening);

  return (
    <>
      <PanelSection first>
        <TextField
          label="Name"
          value={opening.name ?? ""}
          placeholder={openingDefaultName(room, opening)}
          problem={null}
          onValueChange={(value) => onChange(withOpeningName(opening, value))}
        />

        <PanelRow name="Wall" label="Wall">
          <ChipRow name={`${name} wall`}>
            {(part === undefined ? [] : partWallSides(part)).map((wall) => (
              <Chip
                key={wall}
                label={WALL_LABELS[wall]}
                pressed={opening.wall === wall}
                onClick={() => onChange(withOpeningWall(room, opening, wall))}
              >
                {WALL_INITIALS[wall]}
              </Chip>
            ))}
          </ChipRow>
        </PanelRow>

        {/*
          Read along the wall: the gap from the start corner, the opening,
          the gap to the end corner — the three numbers the plan draws beside
          a selected opening, and what a tape reads from either corner. The
          stored center is not shown; it is a number nobody measures.
        */}
        <PanelRow name="Along the wall">
          <NumberField
            label="Gap from the start corner"
            compactLabel="Start"
            scrubGesture={`opening-field:${opening.id}:start`}
            unit={unit}
            meters={gaps.startMeters}
            limits={{ minMeters: 0, maxMeters: wallLength }}
            onMetersChange={(meters, gesture) =>
              onChange(withOpeningStartGap(opening, meters), gesture)
            }
            {...(onGestureEnd === undefined ? {} : { onGestureEnd })}
          />
          <NumberField
            label="Width"
            compactLabel="W"
            scrubGesture={`opening-field:${opening.id}:width`}
            unit={unit}
            meters={opening.widthMeters}
            limits={{ minMeters: MIN_OPENING_METERS, maxMeters: wallLength }}
            onMetersChange={(meters, gesture) =>
              onChange(withOpeningWidthFromStart(opening, meters), gesture)
            }
            {...(onGestureEnd === undefined ? {} : { onGestureEnd })}
          />
          <NumberField
            label="Gap to the end corner"
            compactLabel="End"
            scrubGesture={`opening-field:${opening.id}:end`}
            unit={unit}
            meters={gaps.endMeters}
            limits={{ minMeters: 0, maxMeters: wallLength }}
            onMetersChange={(meters, gesture) =>
              onChange(withOpeningEndGap(room, opening, meters), gesture)
            }
            {...(onGestureEnd === undefined ? {} : { onGestureEnd })}
          />
        </PanelRow>

        {/*
          How high it runs, in the apartment's unit: a window from its sill to
          its head, a door or passage from the floor to its head. These are
          what the perspective view cuts through the wall.
        */}
        <PanelRow name="Up the wall">
          {opening.kind === "window" ? (
            <NumberField
              label="Sill height"
              compactLabel="Sill"
              scrubGesture={`opening-field:${opening.id}:sill`}
              unit={unit}
              meters={heights.sillMeters}
              limits={{ minMeters: 0, maxMeters: room.heightMeters }}
              onMetersChange={(sillMeters, gesture) =>
                onChange(withOpeningHeights(opening, { sillMeters }), gesture)
              }
              {...(onGestureEnd === undefined ? {} : { onGestureEnd })}
            />
          ) : null}
          <NumberField
            label="Head height"
            compactLabel="Head"
            scrubGesture={`opening-field:${opening.id}:head`}
            unit={unit}
            meters={heights.headMeters}
            limits={{
              minMeters: MIN_OPENING_METERS,
              maxMeters: room.heightMeters,
            }}
            onMetersChange={(headMeters, gesture) =>
              onChange(withOpeningHeights(opening, { headMeters }), gesture)
            }
            {...(onGestureEnd === undefined ? {} : { onGestureEnd })}
          />
        </PanelRow>

        {problem === null ? null : (
          <p role="alert" className="text-xs text-red-600">
            {problemMessage(problem, wallLength, unit)}
          </p>
        )}
      </PanelSection>

      {opening.kind === "door" ? (
        <DoorFields door={opening} name={name} onChange={onChange} />
      ) : null}
    </>
  );
}

function DoorFields({
  door,
  name,
  onChange,
}: {
  door: Door;
  name: string;
  onChange: (opening: Opening) => void;
}) {
  return (
    <PanelSection title="Door">
      <ChoiceRow
        name={`${name} style`}
        label="Style"
        value={door.style}
        options={[
          { value: "swing", label: "Hinged" },
          { value: "bifold", label: "Bifold" },
          { value: "sliding", label: "Sliding" },
        ]}
        onChange={(style) => onChange({ ...door, style })}
      />
      <ChoiceRow
        name={`${name} hinge`}
        label="Hinge"
        value={door.hinge}
        options={[
          { value: "start", label: "Start", title: "At the start of the wall" },
          { value: "end", label: "End", title: "At the end of the wall" },
        ]}
        onChange={(hinge) => onChange({ ...door, hinge })}
      />
      <ChoiceRow
        name={`${name} swing`}
        label="Swing"
        value={door.swing}
        options={[
          { value: "inward", label: "In", title: "Into the room" },
          { value: "outward", label: "Out", title: "Out of the room" },
        ]}
        onChange={(swing) => onChange({ ...door, swing })}
      />
    </PanelSection>
  );
}

/** A labelled row of chips, exactly one of them pressed. */
function ChoiceRow<T extends string>({
  name,
  label,
  value,
  options,
  onChange,
}: {
  /** The group's accessible name, unique across every opening. */
  name: string;
  label: string;
  value: T;
  options: readonly { value: T; label: string; title?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <PanelRow name={label} label={label}>
      <ChipRow name={name}>
        {options.map((option) => (
          <Chip
            key={option.value}
            label={option.title ?? option.label}
            {...(option.title === undefined ? {} : { title: option.title })}
            pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Chip>
        ))}
      </ChipRow>
    </PanelRow>
  );
}

function problemMessage(
  problem: OpeningProblem,
  wallLengthMeters: number,
  unit: DisplayUnit,
): string {
  switch (problem) {
    case "not-a-number":
      return "Enter a number for both gaps and the width.";
    case "too-narrow":
      return `An opening is at least ${formatLength(MIN_OPENING_METERS, unit)} wide.`;
    case "off-wall":
      return `This runs past the end of a ${formatLength(wallLengthMeters, unit)} wall.`;
    case "open-wall":
      return "This wall is open — there is no wall to cut it through.";
    case "above-ceiling":
      return "Its top is above the ceiling.";
    case "no-height":
      return "Its top has to be above its bottom.";
  }
}
