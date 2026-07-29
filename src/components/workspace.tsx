"use client";

import Link from "next/link";
import { useState } from "react";
import { ApartmentLayers } from "@/components/apartment-layers";
import { CataloguePanel } from "@/components/catalogue-panel";
import { Inspector } from "@/components/inspector";
import { LayoutProblems } from "@/components/layout-problems";
import { LayoutSwitcher } from "@/components/layout-switcher";
import { RoomPlanCanvas } from "@/components/room-plan-canvas";
import { selectedInstanceId, type Selection } from "@/components/selection";
import {
  countPlaced,
  createInstance,
  placedFurniture,
  placedNames,
  placementFor,
  withInstance,
  type FurnitureInstance,
  type FurnitureProduct,
} from "@/domain/furniture";
import type { FloorPoint } from "@/domain/geometry";
import {
  activeInstances,
  buildChecklist,
  duplicateLayout,
  nextId,
  nextLayoutName,
  renameLayout,
  type Layout,
} from "@/domain/project";
import {
  createOpening,
  createRoom,
  createWalkway,
  nextRoomOrigin,
  withFloorWalkways,
  withOpenings,
  withRoom,
  withRooms,
  type OpeningKind,
  type Room,
  type Walkway,
} from "@/domain/room";
import { checkLayout, troubledInstanceIds } from "@/domain/validation";
import { useProjectStore } from "@/state/project-store";

/**
 * The workspace: what is in the apartment, the plan, and whatever is selected.
 *
 * Three panels rather than a page of forms, because there is one question being
 * asked at a time and the plan should be the thing you are looking at while you
 * ask it. Selecting is the spine: press a name on the left or a piece on the
 * plan, and the right-hand panel becomes that thing's editor.
 */
export function Workspace() {
  const floor = useProjectStore((state) => state.project.floor);
  const unit = useProjectStore((state) => state.project.displayUnit);
  const products = useProjectStore((state) => state.project.products);
  const instances = useProjectStore((state) => activeInstances(state.project));
  const setFloor = useProjectStore((state) => state.setFloor);
  const setUnit = useProjectStore((state) => state.setDisplayUnit);
  const setProducts = useProjectStore((state) => state.setProducts);
  const setInstances = useProjectStore((state) => state.setInstances);
  const layouts = useProjectStore((state) => state.project.layouts);
  const activeLayoutId = useProjectStore(
    (state) => state.project.activeLayoutId,
  );
  const setLayouts = useProjectStore((state) => state.setLayouts);
  const setActiveLayout = useProjectStore((state) => state.setActiveLayout);

  // A fact about this session, never about the project.
  const [selection, setSelection] = useState<Selection>(null);
  const [productProblem, setProductProblem] = useState<string | null>(null);

  const furniture = placedFurniture(instances, products);
  const problems = checkLayout(floor, furniture);
  const troubledIds = troubledInstanceIds(problems);
  const roomNames = new Map(
    floor.rooms.map((room) => [
      room.id,
      room.name === "" ? "an unnamed room" : room.name,
    ]),
  );
  const walkwayNames = new Map(
    floor.walkways.map((walkway) => [
      walkway.id,
      walkway.name === "" ? "A route" : walkway.name,
    ]),
  );
  const namesById = new Map(
    placedNames(furniture).map((name, index) => [
      furniture[index]?.instance.id ?? "",
      name,
    ]),
  );

  // What each arrangement costs, so the switcher is a comparison rather than a
  // list of names. Derived, like every other total in the project.
  const totalsById = new Map(
    layouts.map((layout) => [
      layout.id,
      buildChecklist(products, layout.instances).totalCents,
    ]),
  );

  function duplicate(): void {
    const current =
      layouts.find((one) => one.id === activeLayoutId) ?? layouts[0];
    if (current === undefined) {
      return;
    }
    const id = nextId(
      "layout",
      layouts.map((one) => one.id),
    );
    setLayouts([
      ...layouts,
      duplicateLayout(current, id, nextLayoutName(layouts)),
    ]);
    // Switched to, because a copy you are not looking at is not a comparison.
    setActiveLayout(id);
    setSelection(null);
  }

  function removeLayout(layout: Layout): void {
    const rest = layouts.filter((one) => one.id !== layout.id);
    const next = rest[0];
    if (next === undefined) {
      return;
    }
    setLayouts(rest);
    setActiveLayout(next.id);
    setSelection(null);
  }

  function addRoom(): void {
    const id = nextId(
      "room",
      floor.rooms.map((one) => one.id),
    );
    const room = createRoom(
      id,
      `Room ${floor.rooms.length + 1}`,
      nextRoomOrigin(floor),
    );
    setFloor(withRooms(floor, [...floor.rooms, room]));
    setSelection({ kind: "room", id });
  }

  function removeRoom(room: Room): void {
    setFloor(
      withRooms(
        floor,
        floor.rooms.filter((one) => one.id !== room.id),
      ),
    );
    setSelection(null);
  }

  function addOpening(room: Room, kind: OpeningKind): void {
    const id = nextId(
      "opening",
      floor.rooms.flatMap((one) => one.openings.map((opening) => opening.id)),
    );
    setFloor(
      withRoom(
        floor,
        withOpenings(room, [...room.openings, createOpening(kind, id, room)]),
      ),
    );
  }

  function addWalkway(): void {
    const id = nextId(
      "walkway",
      floor.walkways.map((one) => one.id),
    );
    setFloor(
      withFloorWalkways(floor, [...floor.walkways, createWalkway(id, floor)]),
    );
    setSelection({ kind: "walkway", id });
  }

  /** Puts a product in the room, either where it was dropped or in the middle. */
  function place(product: FurnitureProduct, at?: FloorPoint): void {
    const instance = createInstance(
      nextId(
        "instance",
        instances.map((one) => one.id),
      ),
      product.id,
      at ?? placementFor(floor, instances.length),
    );
    setInstances([...instances, instance]);
    setSelection({ kind: "instance", id: instance.id });
  }

  function saveProduct(product: FurnitureProduct): void {
    setProductProblem(null);
    const known = products.some((one) => one.id === product.id);
    setProducts(
      known
        ? products.map((one) => (one.id === product.id ? product : one))
        : [...products, product],
    );
    setSelection({ kind: "product", id: product.id });
  }

  function removeProduct(product: FurnitureProduct): void {
    // Refused rather than cascaded: deleting a product out from under the
    // copies standing in the room is the one thing ADR 0003 rules out.
    const placed = countPlaced(instances, product.id);
    if (placed > 0) {
      setProductProblem(
        `${product.name} is still in the room ${placed === 1 ? "once" : `${placed} times`}. Take it out first.`,
      );
      return;
    }
    setProducts(products.filter((one) => one.id !== product.id));
    setSelection(null);
  }

  return (
    <div className="grid h-dvh grid-rows-[auto_minmax(0,1fr)] bg-black/[0.02] dark:bg-white/[0.02]">
      <header className="flex items-center justify-between gap-4 border-b border-black/10 px-4 py-2 dark:border-white/15">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-semibold tracking-tight">RoomScale</h1>
          <LayoutSwitcher
            layouts={layouts}
            activeId={activeLayoutId}
            totalsById={totalsById}
            onSwitch={(id) => {
              setActiveLayout(id);
              setSelection(null);
            }}
            onRename={(layout, name) =>
              setLayouts(
                layouts.map((one) =>
                  one.id === layout.id ? renameLayout(one, name) : one,
                ),
              )
            }
            onDuplicate={duplicate}
            onRemove={removeLayout}
          />
        </div>
        <Link
          href="/overview"
          className="rounded-md border border-black/15 px-2.5 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Overview and prices
        </Link>
      </header>

      <div className="grid min-h-0 grid-cols-[minmax(0,16rem)_minmax(0,1fr)_minmax(0,20rem)]">
        <aside
          aria-label="Contents"
          className="grid min-w-0 grid-rows-[minmax(0,1fr)_minmax(min-content,auto)] overflow-hidden border-r border-black/10 dark:border-white/15"
        >
          <ApartmentLayers
            floor={floor}
            furniture={furniture}
            selection={selection}
            troubledIds={troubledIds}
            onSelect={setSelection}
            onAddRoom={addRoom}
            onAddWalkway={addWalkway}
          />
          <CataloguePanel
            products={products}
            instances={instances}
            unit={unit}
            selection={selection}
            onSelect={setSelection}
            onPlace={place}
          />
        </aside>

        <main aria-label="Plan" className="relative min-h-0 overflow-hidden">
          <div className="absolute inset-0">
            <RoomPlanCanvas
              floor={floor}
              furniture={furniture}
              unit={unit}
              selectedId={selectedInstanceId(selection)}
              troubledIds={troubledIds}
              onSelect={(id) =>
                setSelection(id === null ? null : { kind: "instance", id })
              }
              onInstanceChange={(instance) =>
                setInstances(withInstance(instances, instance))
              }
              onDropProduct={(productId, at) => {
                const product = products.find((one) => one.id === productId);
                if (product !== undefined) {
                  place(product, at);
                }
              }}
            />
          </div>

          {/* Over the plan rather than beside it: the drawing gets the room,
              and the verdict is still the first thing under your eye. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4">
            <div className="pointer-events-auto inline-block max-w-full rounded-lg bg-black/70 px-3 py-2 backdrop-blur dark:bg-white/10">
              <LayoutProblems
                problems={problems}
                names={namesById}
                roomNames={roomNames}
                walkwayNames={walkwayNames}
                unit={unit}
              />
            </div>
          </div>
        </main>

        <aside
          aria-label="Details"
          className="min-h-0 overflow-hidden border-l border-black/10 dark:border-white/15"
        >
          <Inspector
            floor={floor}
            furniture={furniture}
            products={products}
            unit={unit}
            selection={selection}
            onSelect={setSelection}
            onFloorChange={setFloor}
            onUnitChange={setUnit}
            onRoomChange={(room) => setFloor(withRoom(floor, room))}
            onRoomRemove={removeRoom}
            onAddOpening={addOpening}
            onInstanceChange={(instance: FurnitureInstance) =>
              setInstances(withInstance(instances, instance))
            }
            onInstanceRemove={(instance: FurnitureInstance) => {
              setInstances(instances.filter((one) => one.id !== instance.id));
              setSelection(null);
            }}
            onWalkwaysChange={(walkways: readonly Walkway[]) =>
              setFloor(withFloorWalkways(floor, walkways))
            }
            onProductSave={saveProduct}
            onProductRemove={removeProduct}
            productProblem={productProblem}
            newProductId={nextId(
              "product",
              products.map((one) => one.id),
            )}
          />
        </aside>
      </div>
    </div>
  );
}
