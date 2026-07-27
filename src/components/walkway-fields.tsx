"use client";

import { NumberField } from "@/components/number-field";
import {
  MIN_WALKWAY_LENGTH_METERS,
  checkWalkway,
  floorBounds,
  walkwayLengthMeters,
  type Floor,
  type Walkway,
  type WalkwayProblem,
} from "@/domain/room";
import { formatLength, type DisplayUnit } from "@/domain/units";

export type WalkwayFieldsProps = {
  walkway: Walkway;
  floor: Floor;
  unit: DisplayUnit;
  onChange: (walkway: Walkway) => void;
  onRemove: () => void;
};

export function WalkwayFields({
  walkway,
  floor,
  unit,
  onChange,
  onRemove,
}: WalkwayFieldsProps) {
  const problem = checkWalkway(walkway);
  const name = walkway.name === "" ? "Route" : walkway.name;

  return (
    <fieldset className="flex flex-col gap-4 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <legend className="px-1 text-sm font-medium">{name}</legend>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${walkway.id}-name`} className="text-sm font-medium">
          Name
        </label>
        <input
          id={`${walkway.id}-name`}
          type="text"
          value={walkway.name}
          onChange={(event) =>
            onChange({ ...walkway, name: event.target.value })
          }
          placeholder="To the guest room"
          className="rounded-md border border-black/15 bg-transparent px-2.5 py-1.5 text-sm dark:border-white/20"
        />
      </div>

      {/* Both ends, measured from the same corner the openings are. */}
      <End
        label={`${name} start`}
        point={walkway.start}
        floor={floor}
        unit={unit}
        onChange={(start) => onChange({ ...walkway, start })}
      />
      <End
        label={`${name} end`}
        point={walkway.end}
        floor={floor}
        unit={unit}
        onChange={(end) => onChange({ ...walkway, end })}
      />

      <div className="flex flex-wrap gap-4">
        <NumberField
          label="Needs at least"
          unit={unit}
          meters={walkway.minimumWidthMeters}
          limits={{ minMeters: 0.2, maxMeters: 3 }}
          onMetersChange={(minimumWidthMeters) =>
            onChange({ ...walkway, minimumWidthMeters })
          }
        />
        <NumberField
          label="Would rather have"
          unit={unit}
          meters={walkway.preferredWidthMeters}
          limits={{ minMeters: 0.2, maxMeters: 3 }}
          onMetersChange={(preferredWidthMeters) =>
            onChange({ ...walkway, preferredWidthMeters })
          }
        />
      </div>

      <p className="text-xs opacity-60">
        {formatLength(walkwayLengthMeters(walkway), unit)} long.
      </p>

      {problem === null ? null : (
        <p role="alert" className="text-xs text-red-600">
          {problemMessage(problem, unit)}
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="text-xs underline underline-offset-4 opacity-60 hover:opacity-100"
        >
          Remove
        </button>
      </div>
    </fieldset>
  );
}

/** One end of a route: how far east, and how far south. */
function End({
  label,
  point,
  floor,
  unit,
  onChange,
}: {
  label: string;
  point: { xMeters: number; zMeters: number };
  floor: Floor;
  unit: DisplayUnit;
  onChange: (point: { xMeters: number; zMeters: number }) => void;
}) {
  const { origin, extent } = floorBounds(floor);

  return (
    <div className="flex flex-wrap items-end gap-4">
      <span className="w-full text-xs uppercase tracking-[0.15em] opacity-60">
        {label}
      </span>
      <NumberField
        label={`${label} from west`}
        unit={unit}
        meters={point.xMeters}
        limits={{
          minMeters: origin.xMeters,
          maxMeters: origin.xMeters + extent.widthMeters,
        }}
        onMetersChange={(xMeters) => onChange({ ...point, xMeters })}
      />
      <NumberField
        label={`${label} from north`}
        unit={unit}
        meters={point.zMeters}
        limits={{
          minMeters: origin.zMeters,
          maxMeters: origin.zMeters + extent.depthMeters,
        }}
        onMetersChange={(zMeters) => onChange({ ...point, zMeters })}
      />
    </div>
  );
}

function problemMessage(problem: WalkwayProblem, unit: DisplayUnit): string {
  switch (problem) {
    case "not-a-number":
      return "Enter a number for both ends and both widths.";
    case "too-short":
      return `Both ends are in nearly the same place. A route is at least ${formatLength(
        MIN_WALKWAY_LENGTH_METERS,
        unit,
      )} long.`;
    case "preferred-below-minimum":
      return "The width you would rather have cannot be less than the width you need.";
  }
}
