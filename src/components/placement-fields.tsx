"use client";

import { AngleField } from "@/components/angle-field";
import { NumberField } from "@/components/number-field";
import { SELECTION_GROUP, shortcutSentence } from "@/components/shortcuts";
import {
  moveInstance,
  turnInstance,
  wallGaps,
  withWallGap,
  type FurnitureInstance,
  type FurnitureProduct,
  type GapSide,
} from "@/domain/furniture";
import { floorBounds, type Floor } from "@/domain/room";
import { formatAngle, formatLength, type DisplayUnit } from "@/domain/units";

export type PlacementFieldsProps = {
  floor: Floor;
  instance: FurnitureInstance;
  product: FurnitureProduct;
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
const GAP_FIELDS: readonly { side: GapSide; compact: string; noun: string }[] =
  [
    { side: "west", compact: "W", noun: "west" },
    { side: "east", compact: "E", noun: "east" },
    { side: "north", compact: "N", noun: "north" },
    { side: "south", compact: "S", noun: "south" },
  ];

export function PlacementFields({
  floor,
  instance,
  product,
  name,
  unit,
  onInstanceChange,
}: PlacementFieldsProps) {
  // Measured across the whole apartment, not one room: a piece can stand in
  // any of them, and the hallway is as valid a place as the living room.
  const { origin, extent } = floorBounds(floor);
  const placed = { instance, product };
  const gaps = wallGaps(floor, placed);

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

      {/*
        The same position, said the way a room is read: how far off each
        wall. Typing six inches here is the whole reason the numbers exist —
        nobody wants a sofa 2' 7.3" from the apartment's west corner, they
        want it six inches off the wall it faces. Only for a piece standing
        in a room; outside one there is no wall to measure from.
      */}
      {gaps.length === 0 ? null : (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">Gap to wall</p>
          <div className="grid grid-cols-2 gap-2">
            {GAP_FIELDS.map(({ side, compact, noun }) => {
              const gap = gaps.find((one) => one.side === side);
              return gap === undefined ? null : (
                <NumberField
                  key={side}
                  label={`Gap to ${noun} wall`}
                  compactLabel={compact}
                  scrubGesture={`piece-gap:${instance.id}:${side}`}
                  unit={unit}
                  meters={gap.gapMeters}
                  limits={{
                    minMeters: 0,
                    maxMeters: Math.max(extent.widthMeters, extent.depthMeters),
                  }}
                  onMetersChange={(meters) =>
                    onInstanceChange(withWallGap(floor, placed, side, meters))
                  }
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Announced as it changes, so a drag or a nudge is not silent. */}
      <p role="status" className="text-xs opacity-70">
        {name} is {formatLength(instance.position.xMeters, unit)} from the west
        wall and {formatLength(instance.position.zMeters, unit)} from the north
        wall, turned {formatAngle(instance.rotationRadians)}.
      </p>

      <p className="text-xs leading-relaxed opacity-60">
        Drag it on the plan, or select it and use the keys.{" "}
        {shortcutSentence(SELECTION_GROUP, unit)}
      </p>
    </fieldset>
  );
}
