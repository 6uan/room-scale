"use client";

import {
  countPlaced,
  createInstance,
  placementFor,
  type FurnitureInstance,
  type FurnitureProduct,
  type PlacedFurniture,
} from "@/domain/furniture";
import { nextId } from "@/domain/project";
import type { Room } from "@/domain/room";
import { formatLength, type DisplayUnit } from "@/domain/units";

export type RoomFurniturePanelProps = {
  room: Room;
  products: readonly FurnitureProduct[];
  instances: readonly FurnitureInstance[];
  furniture: readonly PlacedFurniture[];
  unit: DisplayUnit;
  onInstancesChange: (instances: readonly FurnitureInstance[]) => void;
};

/**
 * Putting furniture in the room, and taking it out again.
 *
 * A product can go in more than once — two of the same pillow are one product
 * and two placements. Where a piece lands is a starting point only; moving it
 * is the next step.
 */
export function RoomFurniturePanel({
  room,
  products,
  instances,
  furniture,
  unit,
  onInstancesChange,
}: RoomFurniturePanelProps) {
  function place(product: FurnitureProduct): void {
    const instance = createInstance(
      nextId(
        "instance",
        instances.map((existing) => existing.id),
      ),
      product.id,
      placementFor(room, instances.length),
    );
    onInstancesChange([...instances, instance]);
  }

  function remove(instance: FurnitureInstance): void {
    onInstancesChange(
      instances.filter((existing) => existing.id !== instance.id),
    );
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
            {furniture.map(({ instance, product }) => (
              <li
                key={instance.id}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-black/5 pb-2 text-sm dark:border-white/10"
              >
                <span className="font-medium">{product.name}</span>
                <span className="tabular-nums text-xs opacity-60">
                  {formatLength(product.footprint.widthMeters, unit)} ×{" "}
                  {formatLength(product.footprint.depthMeters, unit)}
                </span>
                <button
                  type="button"
                  onClick={() => remove(instance)}
                  aria-label={`Take ${product.name} out of the room`}
                  className="text-xs underline underline-offset-4 opacity-60 hover:opacity-100"
                >
                  Take out
                </button>
              </li>
            ))}
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
