"use client";

import { AngleField } from "@/components/angle-field";
import { NumberField } from "@/components/number-field";
import { PanelRow } from "@/components/panel/row";
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
  unit: DisplayUnit;
  onInstanceChange: (instance: FurnitureInstance) => void;
};

/** The four gaps, two to a row, named the way the fields read. */
const GAP_ROWS: readonly (readonly {
  side: GapSide;
  compact: string;
  noun: string;
}[])[] = [
  [
    { side: "west", compact: "W", noun: "west" },
    { side: "east", compact: "E", noun: "east" },
  ],
  [
    { side: "north", compact: "N", noun: "north" },
    { side: "south", compact: "S", noun: "south" },
  ],
];

/** The turns a piece of furniture is actually put at. */
const FURNITURE_TURNS = [0, 90, 180, 270] as const;

/**
 * Where the selected piece stands, as numbers.
 *
 * Built on the same rows as the room panel, so a piece and a room read the
 * same way: a position row, a turn row, and the size in feet under them.
 * Position is the center of the footprint, measured from the same corner the
 * openings are: west for X, north for Z. Only the center is held on the floor —
 * a piece may still overhang a wall, which is a thing to be told about rather
 * than prevented.
 *
 * The gaps say the same position the way a room is read: how far off each
 * wall. Typing six inches there is the whole reason the numbers exist —
 * nobody wants a sofa 2' 7.3" from the apartment's west corner, they want it
 * six inches off the wall it faces. Only for a piece standing in a room;
 * outside one there is no wall to measure from.
 */
export function PlacementFields({
  floor,
  instance,
  product,
  unit,
  onInstanceChange,
}: PlacementFieldsProps) {
  // Measured across the whole apartment, not one room: a piece can stand in
  // any of them, and the hallway is as valid a place as the living room.
  const { origin, extent } = floorBounds(floor);
  const placed = { instance, product };
  const gaps = wallGaps(floor, placed);
  const reach = Math.max(extent.widthMeters, extent.depthMeters);

  return (
    <>
      <PanelRow name="Position">
        <NumberField
          label="From west"
          compactLabel="X"
          scrubGesture={`piece-field:${instance.id}:x`}
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
          compactLabel="Y"
          scrubGesture={`piece-field:${instance.id}:y`}
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
      </PanelRow>
      <AngleField
        label="Turn"
        compactLabel="∠"
        presets={FURNITURE_TURNS}
        radians={instance.rotationRadians}
        onRadiansChange={(radians) =>
          onInstanceChange(turnInstance(instance, radians))
        }
      />
      {/* Announced as it changes so a drag or a nudge is not silent, but
          not shown: the gaps below say where the piece is in words a room is
          read in, and a coordinate from the apartment's corner is not. */}
      <p role="status" className="sr-only">
        {formatLength(instance.position.xMeters, unit)} from west,{" "}
        {formatLength(instance.position.zMeters, unit)} from north, turned{" "}
        {formatAngle(instance.rotationRadians)}
      </p>

      {gaps.length === 0
        ? null
        : GAP_ROWS.map((row, index) => (
            <PanelRow
              key={index}
              name={index === 0 ? "Gap to wall" : "Gap to wall, continued"}
              label={index === 0 ? "Gaps" : ""}
            >
              {row.map(({ side, compact, noun }) => {
                const gap = gaps.find((one) => one.side === side);
                return gap === undefined ? null : (
                  <NumberField
                    key={side}
                    label={`Gap to ${noun} wall`}
                    compactLabel={compact}
                    scrubGesture={`piece-gap:${instance.id}:${side}`}
                    unit={unit}
                    meters={gap.gapMeters}
                    limits={{ minMeters: 0, maxMeters: reach }}
                    onMetersChange={(meters) =>
                      onInstanceChange(withWallGap(floor, placed, side, meters))
                    }
                  />
                );
              })}
            </PanelRow>
          ))}
    </>
  );
}
