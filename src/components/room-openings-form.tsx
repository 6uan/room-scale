"use client";

import { NumberField } from "@/components/number-field";
import { openingName } from "@/components/opening-name";
import {
  MIN_OPENING_METERS,
  WALL_SIDES,
  checkOpening,
  wallLengthMeters,
  withOpeningWall,
  type Door,
  type Opening,
  type OpeningKind,
  type OpeningProblem,
  type Room,
  type WallSide,
} from "@/domain/room";
import { formatLength, type DisplayUnit } from "@/domain/units";

const KINDS: readonly { kind: OpeningKind; label: string }[] = [
  { kind: "door", label: "Door" },
  { kind: "window", label: "Window" },
  { kind: "passage", label: "Passage" },
];

/** Which side of the plan each wall is drawn on, so the list matches the view. */
const WALL_LABELS: Record<WallSide, string> = {
  north: "North (top)",
  east: "East (right)",
  south: "South (bottom)",
  west: "West (left)",
};

export type RoomOpeningsFormProps = {
  room: Room;
  placingKind?: OpeningKind | null;
  onAddOpening: (kind: OpeningKind) => void;
};

/** Arms the plan to put a door, window, or passage on this room's wall. */
export function RoomOpeningsForm({
  room,
  placingKind = null,
  onAddOpening,
}: RoomOpeningsFormProps) {
  return (
    <div className="flex flex-col gap-3 border-t border-black/10 pt-4 dark:border-white/15">
      <h3 className="text-xs font-medium">Openings</h3>
      <div className="flex flex-wrap gap-2">
        {KINDS.map(({ kind, label }) => (
          <button
            key={kind}
            type="button"
            onClick={() => onAddOpening(kind)}
            aria-pressed={placingKind === kind}
            className={`rounded-md border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10 ${
              placingKind === kind
                ? "bg-black/10 dark:bg-white/15"
                : "bg-transparent"
            }`}
          >
            {placingKind === kind
              ? `Placing ${label.toLowerCase()}…`
              : `Add ${label.toLowerCase()}`}
          </button>
        ))}
      </div>

      <p className="text-xs leading-relaxed opacity-60">
        {placingKind === null
          ? room.openings.length === 0
            ? "Choose a kind, then click the wall where it belongs."
            : `${room.openings.length} ${room.openings.length === 1 ? "opening" : "openings"}. Select one in the Apartment list or on the plan to edit its measurements.`
          : `Click a ${room.name === "" ? "room" : room.name} wall to place it. Press Esc to stop.`}
      </p>
    </div>
  );
}

export type OpeningFieldsProps = {
  opening: Opening;
  room: Room;
  unit: DisplayUnit;
  onChange: (opening: Opening) => void;
  onRemove: () => void;
};

/** Exact numeric editing for one selected opening. */
export function OpeningFields({
  opening,
  room,
  unit,
  onChange,
  onRemove,
}: OpeningFieldsProps) {
  const wallLength = wallLengthMeters(room, opening.wall);
  const problem = checkOpening(room, opening);
  const name = openingName(room, opening);

  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border border-black/10 p-4 dark:border-white/15">
      {/* A direct child of the fieldset, so it names the group. */}
      <legend className="px-1 text-sm font-medium">{name}</legend>

      <SelectField
        label={`${name} wall`}
        visibleLabel="Wall"
        value={opening.wall}
        options={WALL_SIDES.map((wall) => ({
          value: wall,
          label: WALL_LABELS[wall],
        }))}
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

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name.toLowerCase()}`}
          className="text-xs opacity-60 underline underline-offset-4 hover:opacity-100"
        >
          Remove
        </button>
      </div>
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
  }
}
