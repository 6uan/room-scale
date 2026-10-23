"use client";

import {
  DoorOpen,
  MoveHorizontal,
  PanelsTopLeft,
  type LucideIcon,
} from "lucide-react";
import { IconButton } from "@/components/icon-button";
import { NumberField } from "@/components/number-field";
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
  type OpeningKind,
  type OpeningProblem,
  partWallSides,
  type Room,
  roomPart,
  wallLengthMeters,
  type WallSide,
  withOpeningName,
  withOpeningWall,
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
  north: "North (top)",
  "north-east": "North-east corner",
  east: "East (right)",
  "south-east": "South-east corner",
  south: "South (bottom)",
  "south-west": "South-west corner",
  west: "West (left)",
  "north-west": "North-west corner",
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
  onChange: (opening: Opening) => void;
};

/** Exact numeric editing for one selected opening. */
export function OpeningFields({
  opening,
  room,
  unit,
  onChange,
}: OpeningFieldsProps) {
  // This opening's own section, rather than the room's first: walls differ in
  // length between sections, and a chamfer exists only on the one that is cut.
  const part = roomPart(room, opening.partId);
  const wallLength = wallLengthMeters(room, opening.wall, opening.partId);
  const problem = checkOpening(room, opening);
  const name = openingName(room, opening);

  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border border-black/10 p-4 dark:border-white/15">
      {/* A direct child of the fieldset, so it names the group. */}
      <legend className="px-1 text-sm font-medium">{name}</legend>

      <TextField
        label="Name"
        value={opening.name ?? ""}
        placeholder={openingDefaultName(room, opening)}
        problem={null}
        onValueChange={(value) => onChange(withOpeningName(opening, value))}
      />

      <SelectField
        label={`${name} wall`}
        visibleLabel="Wall"
        value={opening.wall}
        options={(part === undefined ? [] : partWallSides(part)).map(
          (wall) => ({
            value: wall,
            label: WALL_LABELS[wall],
          }),
        )}
        onChange={(wall) =>
          onChange(withOpeningWall(room, opening, wall as WallSide))
        }
      />

      <div className="flex flex-wrap gap-4">
        <NumberField
          label="Center"
          unit={unit}
          meters={opening.centerMeters}
          limits={{ minMeters: 0, maxMeters: wallLength }}
          onMetersChange={(centerMeters) =>
            onChange({ ...opening, centerMeters })
          }
        />
        <NumberField
          label="Width"
          unit={unit}
          meters={opening.widthMeters}
          limits={{ minMeters: MIN_OPENING_METERS, maxMeters: wallLength }}
          onMetersChange={(widthMeters) =>
            onChange({ ...opening, widthMeters })
          }
        />
      </div>

      {opening.kind === "door" ? (
        <DoorFields door={opening} name={name} onChange={onChange} />
      ) : null}

      {problem === null ? null : (
        <p role="alert" className="text-xs text-red-600">
          {problemMessage(problem, wallLength, unit)}
        </p>
      )}
    </fieldset>
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
    <div className="flex flex-wrap gap-4">
      <SelectField
        label={`${name} hinge`}
        visibleLabel="Hinge"
        value={door.hinge}
        options={[
          { value: "start", label: "Start of wall" },
          { value: "end", label: "End of wall" },
        ]}
        onChange={(hinge) =>
          onChange({ ...door, hinge: hinge as Door["hinge"] })
        }
      />
      <SelectField
        label={`${name} swing`}
        visibleLabel="Swing"
        value={door.swing}
        options={[
          { value: "inward", label: "Into the room" },
          { value: "outward", label: "Out of the room" },
        ]}
        onChange={(swing) =>
          onChange({ ...door, swing: swing as Door["swing"] })
        }
      />
      <SelectField
        label={`${name} style`}
        visibleLabel="Style"
        value={door.style}
        options={[
          { value: "swing", label: "Hinged" },
          { value: "bifold", label: "Bifold" },
          { value: "sliding", label: "Sliding" },
        ]}
        onChange={(style) =>
          onChange({ ...door, style: style as Door["style"] })
        }
      />
    </div>
  );
}

type SelectFieldProps = {
  /** The accessible name, which has to stay unique across every opening. */
  label: string;
  visibleLabel: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
};

function SelectField({
  label,
  visibleLabel,
  value,
  options,
  onChange,
}: SelectFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium" aria-hidden="true">
        {visibleLabel}
      </span>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-black/15 bg-transparent px-2.5 py-1.5 text-sm dark:border-white/20"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function problemMessage(
  problem: OpeningProblem,
  wallLengthMeters: number,
  unit: DisplayUnit,
): string {
  switch (problem) {
    case "not-a-number":
      return "Enter a number for both the center and the width.";
    case "too-narrow":
      return `An opening is at least ${formatLength(MIN_OPENING_METERS, unit)} wide.`;
    case "off-wall":
      return `This runs past the end of a ${formatLength(wallLengthMeters, unit)} wall.`;
    case "open-wall":
      return "This wall is open — there is no wall to cut it through.";
  }
}
