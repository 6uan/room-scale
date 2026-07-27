"use client";

import { AngleField } from "@/components/angle-field";
import { NumberField } from "@/components/number-field";
import { PLACEMENT_KEY_HINT } from "@/components/placement-keys";
import {
  moveInstance,
  turnInstance,
  type FurnitureInstance,
} from "@/domain/furniture";
import { floorBounds, type Floor } from "@/domain/room";
import { formatAngle, formatLength, type DisplayUnit } from "@/domain/units";

export type PlacementFieldsProps = {
  floor: Floor;
  instance: FurnitureInstance;
  name: string;
  unit: DisplayUnit;
  onInstanceChange: (instance: FurnitureInstance) => void;
};

/**
 * Where the selected piece stands, as numbers.
 *
 * Position is the center of the footprint, measured from the same corner the
 * openings are: west for X, north for Z. Only the center is held on the floor —
 * a piece may still overhang a wall, which is a thing to be told about rather
 * than prevented.
 */
export function PlacementFields({
  floor,
  instance,
  name,
  unit,
  onInstanceChange,
}: PlacementFieldsProps) {
  // Measured across the whole apartment, not one room: a piece can stand in
  // any of them, and the hallway is as valid a place as the living room.
  const { origin, extent } = floorBounds(floor);

  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <legend className="px-1 text-sm font-medium">Where {name} sits</legend>

      <div className="flex flex-wrap gap-4">
        <NumberField
          label="From west"
          unit={unit}
          meters={instance.position.xMeters}
          limits={{
            minMeters: origin.xMeters,
            maxMeters: origin.xMeters + extent.widthMeters,
          }}
          onMetersChange={(xMeters) =>
            onInstanceChange(
              moveInstance(instance, { ...instance.position, xMeters }),
            )
          }
        />
        <NumberField
          label="From north"
          unit={unit}
          meters={instance.position.zMeters}
          limits={{
            minMeters: origin.zMeters,
            maxMeters: origin.zMeters + extent.depthMeters,
          }}
          onMetersChange={(zMeters) =>
            onInstanceChange(
              moveInstance(instance, { ...instance.position, zMeters }),
            )
          }
        />
        <AngleField
          label="Turn"
          radians={instance.rotationRadians}
          onRadiansChange={(radians) =>
            onInstanceChange(turnInstance(instance, radians))
          }
        />
      </div>

      {/* Announced as it changes, so a drag or a nudge is not silent. */}
      <p role="status" className="text-xs opacity-70">
        {name} is {formatLength(instance.position.xMeters, unit)} from the west
        wall and {formatLength(instance.position.zMeters, unit)} from the north
        wall, turned {formatAngle(instance.rotationRadians)}.
      </p>

      <p className="text-xs leading-relaxed opacity-60">
        Drag it on the plan, or select it and use the keys. {PLACEMENT_KEY_HINT}
      </p>
    </fieldset>
  );
}
