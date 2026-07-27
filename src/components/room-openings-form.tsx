"use client";

import { NumberField } from "@/components/number-field";
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
  unit: DisplayUnit;
  onOpeningsChange: (openings: readonly Opening[]) => void;
  onAddOpening: (kind: OpeningKind) => void;
};

/** Adding, positioning, and removing the doors, windows, and passages. */
export function RoomOpeningsForm({
  room,
  unit,
  onOpeningsChange,
  onAddOpening,
}: RoomOpeningsFormProps) {
  function replace(opening: Opening, next: Opening): void {
    onOpeningsChange(
      room.openings.map((existing) =>
        existing.id === opening.id ? next : existing,
      ),
    );
  }

  function remove(opening: Opening): void {
    onOpeningsChange(
      room.openings.filter((existing) => existing.id !== opening.id),
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        {KINDS.map(({ kind, label }) => (
          <button
            key={kind}
            type="button"
            onClick={() => onAddOpening(kind)}
            className="rounded-md border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            Add {label.toLowerCase()}
          </button>
        ))}
      </div>

      {room.openings.length === 0 ? (
        <p className="text-sm opacity-60">
          No openings yet. The room is drawn as four unbroken walls.
        </p>
      ) : (
        <ul className="flex flex-col gap-5">
          {room.openings.map((opening, index) => (
            <li key={opening.id}>
              <OpeningFields
                opening={opening}
                ordinal={ordinalOf(room.openings, opening, index)}
                room={room}
                unit={unit}
                onChange={(next) => replace(opening, next)}
                onRemove={() => remove(opening)}
              />
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs leading-relaxed opacity-60">
        Centers are measured along the wall: from the west end on the north and
        south walls, from the north end on the east and west walls.
      </p>
    </div>
  );
}

type OpeningFieldsProps = {
  opening: Opening;
  ordinal: number;
  room: Room;
  unit: DisplayUnit;
  onChange: (opening: Opening) => void;
  onRemove: () => void;
};

function OpeningFields({
  opening,
  ordinal,
  room,
  unit,
  onChange,
  onRemove,
}: OpeningFieldsProps) {
  const wallLength = wallLengthMeters(room, opening.wall);
  const problem = checkOpening(room, opening);
  // Prefixed with the room, because an apartment has more than one Door 1.
  const name = `${room.name === "" ? "Room" : room.name} ${kindLabel(
    opening.kind,
  ).toLowerCase()} ${ordinal}`;

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

function kindLabel(kind: OpeningKind): string {
  return kind === "door" ? "Door" : kind === "window" ? "Window" : "Passage";
}

/** Numbers each kind separately, so the list reads "Door 1, Door 2, Window 1". */
function ordinalOf(
  openings: readonly Opening[],
  opening: Opening,
  index: number,
): number {
  return (
    openings
      .slice(0, index)
      .filter((existing) => existing.kind === opening.kind).length + 1
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
