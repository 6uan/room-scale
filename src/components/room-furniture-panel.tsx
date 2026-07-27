"use client";

import type { KeyboardEvent } from "react";
import { AngleField } from "@/components/angle-field";
import { NumberField } from "@/components/number-field";
import {
  PLACEMENT_KEY_HINT,
  instanceFromKeyPress,
} from "@/components/placement-keys";
import {
  countPlaced,
  createInstance,
  moveInstance,
  placedNames,
  placementFor,
  turnInstance,
  type FurnitureInstance,
  type FurnitureProduct,
  type PlacedFurniture,
} from "@/domain/furniture";
import { nextId } from "@/domain/project";
import { floorBounds, type Floor } from "@/domain/room";
import { formatAngle, formatLength, type DisplayUnit } from "@/domain/units";

export type RoomFurniturePanelProps = {
  floor: Floor;
  products: readonly FurnitureProduct[];
  instances: readonly FurnitureInstance[];
  furniture: readonly PlacedFurniture[];
  unit: DisplayUnit;
  selectedId: string | null;
  onInstancesChange: (instances: readonly FurnitureInstance[]) => void;
  onSelect: (instanceId: string | null) => void;
  onInstanceChange: (instance: FurnitureInstance) => void;
};

/**
 * Putting furniture in the room, taking it out again, and saying where a piece
 * stands.
 *
 * A product can go in more than once — two of the same pillow are one product
 * and two placements. Selecting a piece here opens its position and rotation as
 * numbers, which is the way in that does not need the drawing: everything the
 * canvas can be dragged to do can be typed, and the arrow keys work on the
 * selected piece from either side.
 */
export function RoomFurniturePanel({
  floor,
  products,
  instances,
  furniture,
  unit,
  selectedId,
  onInstancesChange,
  onSelect,
  onInstanceChange,
}: RoomFurniturePanelProps) {
  const names = placedNames(furniture);

  function place(product: FurnitureProduct): void {
    const instance = createInstance(
      nextId(
        "instance",
        instances.map((existing) => existing.id),
      ),
      product.id,
      placementFor(floor, instances.length),
    );
    onInstancesChange([...instances, instance]);
    // Selected as it lands, so it can be moved straight away.
    onSelect(instance.id);
  }

  function remove(instance: FurnitureInstance): void {
    onInstancesChange(
      instances.filter((existing) => existing.id !== instance.id),
    );
  }

  /** Arrow keys work from the name too, so selecting and moving are one reach. */
  function nudge(
    event: KeyboardEvent<HTMLButtonElement>,
    { instance }: PlacedFurniture,
  ): void {
    if (instance.id !== selectedId) {
      return;
    }
    const next = instanceFromKeyPress(floor, instance, event);
    if (next === null) {
      return;
    }
    event.preventDefault();
    onInstanceChange(next);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">In the room</h3>
        {furniture.length === 0 ? (
          <p className="text-sm opacity-60">
            Nothing placed yet. Add something from the catalogue below.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {furniture.map((placed, index) => {
              const { instance, product } = placed;
              const name = names[index] ?? product.name;
              const selected = instance.id === selectedId;

              return (
                <li
                  key={instance.id}
                  className="flex flex-col gap-3 border-b border-black/5 pb-2 dark:border-white/10"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onSelect(selected ? null : instance.id)}
                      onKeyDown={(event) => nudge(event, placed)}
                      className={`font-medium underline-offset-4 hover:underline ${
                        selected ? "underline" : ""
                      }`}
                    >
                      {name}
                    </button>
                    <span className="tabular-nums text-xs opacity-60">
                      {formatLength(product.footprint.widthMeters, unit)} ×{" "}
                      {formatLength(product.footprint.depthMeters, unit)}
                    </span>
                    <button
                      type="button"
                      onClick={() => remove(instance)}
                      aria-label={`Take ${name} out of the room`}
                      className="text-xs underline underline-offset-4 opacity-60 hover:opacity-100"
                    >
                      Take out
                    </button>
                  </div>

                  {selected ? (
                    <PlacementFields
                      floor={floor}
                      instance={instance}
                      name={name}
                      unit={unit}
                      onInstanceChange={onInstanceChange}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-medium">From the catalogue</h3>
        {products.length === 0 ? (
          <p className="text-sm opacity-60">
            The catalogue is empty. Add furniture on the Furniture page first.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {products.map((product) => {
              const placed = countPlaced(instances, product.id);
              return (
                <li
                  key={product.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm"
                >
                  <span>
                    {product.name}
                    {placed === 0 ? null : (
                      <span className="ml-2 text-xs opacity-60">
                        {placed} in the room
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => place(product)}
                    aria-label={`Place ${product.name} in the room`}
                    className="rounded-md border border-black/15 px-2.5 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
                  >
                    Place
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

type PlacementFieldsProps = {
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
function PlacementFields({
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
