"use client";

import { Keyboard, ReceiptText, Redo2, Settings, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ApartmentLayers } from "@/components/apartment-layers";
import {
  ButtonGroup,
  IconButton,
  LabelledButton,
} from "@/components/icon-button";
import { CataloguePanel } from "@/components/catalogue-panel";
import { EmptyPlan } from "@/components/empty-plan";
import { Inspector } from "@/components/inspector";
import { ListDrawer } from "@/components/list-drawer";
import { SettingsDialog } from "@/components/settings-dialog";
import { LayoutProblems } from "@/components/layout-problems";
import { LayoutSwitcher } from "@/components/layout-switcher";
import { RoomPlanCanvas } from "@/components/room-plan-canvas";
import { selectedInstanceId, type Selection } from "@/components/selection";
import { ShortcutsGuide } from "@/components/shortcuts-guide";
import { pressIs } from "@/components/shortcuts";
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
  calibratedUnderlay,
  createUnderlay,
  duplicateLayout,
  nextId,
  nextLayoutName,
  renameLayout,
  type Layout,
} from "@/domain/project";
import { readPlanImage } from "@/components/underlay-image";
import {
  createOpening,
  createRoom,
  drawnRoom,
  floorBounds,
  roomBounds,
  withOrigin,
  withOpenings,
  withRoom,
  withRooms,
  type Opening,
  type OpeningKind,
  type Room,
  type WallSide,
} from "@/domain/room";
import { roundToDisplayUnit } from "@/domain/units";
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
  const underlay = useProjectStore((state) => state.project.underlay);
  const unit = useProjectStore((state) => state.project.displayUnit);
  const products = useProjectStore((state) => state.project.products);
  const instances = useProjectStore((state) => activeInstances(state.project));
  const setFloor = useProjectStore((state) => state.setFloor);
  const setUnderlay = useProjectStore((state) => state.setUnderlay);
  const setUnit = useProjectStore((state) => state.setDisplayUnit);
  const setProducts = useProjectStore((state) => state.setProducts);
  const setInstances = useProjectStore((state) => state.setInstances);
  const layouts = useProjectStore((state) => state.project.layouts);
  const activeLayoutId = useProjectStore(
    (state) => state.project.activeLayoutId,
  );
  const setLayouts = useProjectStore((state) => state.setLayouts);
  const setActiveLayout = useProjectStore((state) => state.setActiveLayout);
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);
  const canUndo = useProjectStore((state) => state.canUndo);
  const canRedo = useProjectStore((state) => state.canRedo);
  const endGesture = useProjectStore((state) => state.endGesture);

  // Facts about this session, never about the project.
  const [selection, setSelection] = useState<Selection>(null);
  const [productProblem, setProductProblem] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  /** Whether a drag on the plan draws a room. One room, then off again. */
  const [drawingRoom, setDrawingRoom] = useState(false);
  /** The kind and room whose next wall click places one opening. */
  const [placingOpening, setPlacingOpening] = useState<{
    readonly roomId: string;
    readonly kind: OpeningKind;
  } | null>(null);
  /** Whether the plan is waiting for the underlay's calibration line. */
  const [calibrating, setCalibrating] = useState(false);
  /** The drawn line, held until its real length is typed and applied. */
  const [calibrationLine, setCalibrationLine] = useState<{
    readonly from: FloorPoint;
    readonly to: FloorPoint;
  } | null>(null);

  const furniture = placedFurniture(instances, products);
  const problems = checkLayout(floor, furniture);
  const troubledIds = troubledInstanceIds(problems);
  const roomNames = new Map(
    floor.rooms.map((room) => [
      room.id,
      room.name === "" ? "an unnamed room" : room.name,
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

  function duplicate(current: Layout): void {
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

  /**
   * Adds a room drawn on the plan.
   *
   * `to` is null when the press was a click rather than a drag, which means "a
   * room here, the usual size" — centred on the point, so it arrives under the
   * pointer rather than at a corner of it. The canvas can tell a click from a
   * drag because it knows pixels; it has no business knowing how big a room
   * usually is, which is why the choice is made here.
   */
  /** Reads the listing's plan, drops it under the grid, and asks for scale. */
  async function addPlanImage(file: File): Promise<void> {
    const image = await readPlanImage(file);
    const { origin, extent } = floorBounds(floor);
    setUnderlay(
      createUnderlay(image.dataUrl, image.widthPixels, image.heightPixels, {
        xMeters: origin.xMeters + extent.widthMeters / 2,
        zMeters: origin.zMeters + extent.depthMeters / 2,
      }),
    );
    // Straight into calibration: an unscaled plan is not yet a measurement.
    setDrawingRoom(false);
    setPlacingOpening(null);
    setCalibrationLine(null);
    setCalibrating(true);
  }

  /** The typed length reaches the drawn line, and the image takes its scale. */
  function applyCalibration(realMeters: number): void {
    if (underlay === null || calibrationLine === null) {
      return;
    }
    setUnderlay(
      calibratedUnderlay(
        underlay,
        calibrationLine.from,
        calibrationLine.to,
        realMeters,
      ),
    );
    setCalibrationLine(null);
  }

  function drawRoom(from: FloorPoint, to: FloorPoint | null): void {
    const id = nextId(
      "room",
      floor.rooms.map((one) => one.id),
    );
    const name = `Room ${floor.rooms.length + 1}`;

    // Both paths land on whole inches or centimeters, so a room begins life
    // with the kind of numbers somebody could have typed.
    const round = (meters: number) => roundToDisplayUnit(meters, unit);
    const room =
      to === null
        ? centredRoom(createRoom(id, name, from), {
            xMeters: round(from.xMeters),
            zMeters: round(from.zMeters),
          })
        : drawnRoom(floor, id, name, from, to, round);

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

  function startOpeningPlacement(room: Room, kind: OpeningKind): void {
    setDrawingRoom(false);
    setPlacingOpening((current) =>
      current?.roomId === room.id && current.kind === kind
        ? null
        : { roomId: room.id, kind },
    );
  }

  function placeOpening(
    roomId: string,
    kind: OpeningKind,
    partId: string,
    wall: WallSide,
    centerMeters: number,
  ): void {
    const room = floor.rooms.find((one) => one.id === roomId);
    if (room === undefined) {
      return;
    }
    const id = nextId(
      "opening",
      floor.rooms.flatMap((one) => one.openings.map((opening) => opening.id)),
    );
    const opening = createOpening(kind, id, room, wall, centerMeters, partId);
    setFloor(withRoom(floor, withOpenings(room, [...room.openings, opening])));
    setSelection({ kind: "opening", roomId: room.id, id });
  }

  function changeOpening(room: Room, opening: Opening): void {
    setFloor(
      withRoom(
        floor,
        withOpenings(
          room,
          room.openings.map((one) => (one.id === opening.id ? opening : one)),
        ),
      ),
    );
  }

  function removeOpening(room: Room, opening: Opening): void {
    setFloor(
      withRoom(
        floor,
        withOpenings(
          room,
          room.openings.filter((one) => one.id !== opening.id),
        ),
      ),
    );
    // Removed from its own editor, the selection is gone with it. Removed
    // from the room's panel, the room stays selected and the work goes on.
    if (selection?.kind === "opening" && selection.id === opening.id) {
      setSelection(null);
    }
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

  /**
   * Removes whatever is selected.
   *
   * Only safe to put on a single key because it is undoable — before this step
   * a deleted room was gone, and the only way back was remembering what it
   * said. A product still in the apartment is refused rather than cascaded,
   * which is `removeProduct`'s rule and ADR 0003's.
   */
  function removeSelected(): void {
    if (selection === null) {
      return;
    }
    switch (selection.kind) {
      case "room": {
        const room = floor.rooms.find((one) => one.id === selection.id);
        if (room !== undefined) {
          removeRoom(room);
        }
        return;
      }
      case "room-part": {
        const room = floor.rooms.find((one) => one.id === selection.roomId);
        if (room === undefined || room.parts.length === 1) {
          return;
        }
        setFloor(
          withRoom(floor, {
            ...room,
            parts: room.parts.filter((part) => part.id !== selection.id),
            openings: room.openings.filter(
              (opening) => opening.partId !== selection.id,
            ),
          }),
        );
        setSelection({ kind: "room", id: room.id });
        return;
      }
      case "opening": {
        const room = floor.rooms.find((one) => one.id === selection.roomId);
        const opening = room?.openings.find((one) => one.id === selection.id);
        if (room !== undefined && opening !== undefined) {
          removeOpening(room, opening);
        }
        return;
      }
      case "instance": {
        setInstances(instances.filter((one) => one.id !== selection.id));
        setSelection(null);
        return;
      }
      case "product": {
        const product = products.find((one) => one.id === selection.id);
        if (product !== undefined) {
          removeProduct(product);
        }
        return;
      }
    }
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

  /**
   * The keys that belong to the whole workspace rather than to the plan.
   *
   * On the window, because a room selected from the list on the left leaves
   * focus on a button there, and ⌘Z has to work from wherever you are. Anything
   * typed into a field is left alone: an input has its own undo and its own
   * Delete, and taking those over would be the tool fighting the browser.
   *
   * Registered on every render rather than once, so the handler is never
   * looking at a stale selection. A keydown listener costs nothing to rebind.
   */
  useEffect(() => {
    function handle(event: KeyboardEvent): void {
      if (isTyping(event.target)) {
        return;
      }
      // Before everything else: Escape gets somebody out of a mode from
      // wherever they are. The plan handles it too, but pressing "Add room"
      // leaves focus on the button rather than on the plan.
      if (
        (drawingRoom || placingOpening !== null || calibrating) &&
        pressIs("deselect", event)
      ) {
        event.preventDefault();
        setDrawingRoom(false);
        setPlacingOpening(null);
        setCalibrating(false);
      } else if (pressIs("undo", event)) {
        event.preventDefault();
        undo();
      } else if (pressIs("redo", event)) {
        event.preventDefault();
        redo();
      } else if (pressIs("delete", event)) {
        event.preventDefault();
        removeSelected();
      } else if (pressIs("guide", event)) {
        event.preventDefault();
        setGuideOpen(true);
      }
    }

    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  });

  return (
    <div className="grid h-dvh grid-rows-[auto_minmax(0,1fr)] bg-black/[0.02] dark:bg-white/[0.02]">
      <header className="flex items-center justify-between gap-4 border-b border-black/10 px-4 py-2.5 dark:border-white/15">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="shrink-0 text-[15px] font-semibold tracking-tight">
            RoomScale
          </h1>
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
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Beside the plan rather than buried in a menu: the two things you
              reach for after a drag that went wrong. Disabled says there is
              nothing to take back, which is worth knowing. */}
          <ButtonGroup>
            <IconButton
              label="Undo"
              icon={Undo2}
              size="small"
              disabled={!canUndo}
              onClick={undo}
            />
            <IconButton
              label="Redo"
              icon={Redo2}
              size="small"
              disabled={!canRedo}
              onClick={redo}
            />
          </ButtonGroup>
          <IconButton
            label="Keys"
            icon={Keyboard}
            onClick={() => setGuideOpen(true)}
          />
          <IconButton
            label="Settings"
            icon={Settings}
            pressed={settingsOpen}
            onClick={() => setSettingsOpen(true)}
          />
          {/* The list is the thing you leave with, so it keeps its words. It
              opens over the plan now rather than replacing it, and says which
              it is doing with aria-pressed rather than by rewording itself.

              "Shopping list" rather than "Overview and prices", which named
              the page it used to navigate to instead of the thing it holds.
              This is the word anybody would say out loud for it. */}
          <LabelledButton
            label="Shopping list"
            icon={ReceiptText}
            pressed={listOpen}
            onClick={() => setListOpen((open) => !open)}
          />
        </div>
      </header>

      <div className="grid min-h-0 grid-cols-[minmax(0,16rem)_minmax(0,1fr)_minmax(0,20rem)]">
        {/* The catalogue sits at the bottom and grows upward as it fills; the
            layers take the rest, so spare room shows above it rather than
            below. */}
        <aside
          aria-label="Contents"
          className="grid min-w-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden border-r border-black/10 dark:border-white/15"
        >
          <ApartmentLayers
            floor={floor}
            furniture={furniture}
            selection={selection}
            troubledIds={troubledIds}
            onSelect={setSelection}
            onRoomChange={(room) => setFloor(withRoom(floor, room))}
            onAddRoom={() => {
              setPlacingOpening(null);
              setDrawingRoom((on) => !on);
            }}
            drawingRoom={drawingRoom}
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
              onInstanceChange={(instance, gesture) =>
                setInstances(withInstance(instances, instance), gesture)
              }
              selectedRoomId={
                selection?.kind === "room"
                  ? selection.id
                  : selection?.kind === "room-part"
                    ? selection.roomId
                    : null
              }
              selectedRoomPartId={
                selection?.kind === "room-part" ? selection.id : null
              }
              onSelectRoom={(id) => setSelection({ kind: "room", id })}
              onSelectRoomPart={(roomId, id) =>
                setSelection({ kind: "room-part", roomId, id })
              }
              selectedOpeningId={
                selection?.kind === "opening" ? selection.id : null
              }
              onSelectOpening={(roomId, id) =>
                setSelection({ kind: "opening", roomId, id })
              }
              onRoomChange={(room, gesture) =>
                setFloor(withRoom(floor, room), gesture)
              }
              onGestureEnd={endGesture}
              drawing={drawingRoom}
              onDrawRoom={drawRoom}
              onDrawEnd={() => setDrawingRoom(false)}
              placingOpening={placingOpening}
              onPlaceOpening={placeOpening}
              onPlaceOpeningEnd={() => setPlacingOpening(null)}
              underlay={underlay}
              calibrating={calibrating}
              onCalibrateLine={(from, to) => setCalibrationLine({ from, to })}
              onCalibrateEnd={() => setCalibrating(false)}
              onDropProduct={(productId, at) => {
                const product = products.find((one) => one.id === productId);
                if (product !== undefined) {
                  place(product, at);
                }
              }}
            />
          </div>

          {/* Only until there is one room, and never dismissed — a plan with
              something on it says what it is without being told. */}
          {floor.rooms.length === 0 ? (
            <EmptyPlan
              drawing={drawingRoom}
              onDrawRoom={() => {
                setPlacingOpening(null);
                setDrawingRoom((on) => !on);
              }}
              onAddPlanImage={(file) => {
                void addPlanImage(file);
              }}
            />
          ) : null}

          {/* Over the plan rather than beside it: the drawing gets the room,
              and a problem is still the first thing under your eye. The band
              itself only exists when there is something in it — an empty chip
              sitting over the corner of the drawing is the same nuisance as
              the all-clear it used to hold. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4">
            <div
              className={
                problems.length === 0
                  ? ""
                  : "pointer-events-auto inline-block max-w-full rounded-lg bg-black/70 px-3 py-2 backdrop-blur dark:bg-white/10"
              }
            >
              <LayoutProblems
                problems={problems}
                names={namesById}
                roomNames={roomNames}
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
            underlay={underlay}
            calibrating={calibrating}
            calibrationLine={calibrationLine}
            onAddPlanImage={(file) => {
              void addPlanImage(file);
            }}
            onCalibrateToggle={() => {
              setCalibrationLine(null);
              setCalibrating((on) => !on);
            }}
            onApplyCalibration={applyCalibration}
            onUnderlayChange={setUnderlay}
            onRoomChange={(room, gesture) =>
              setFloor(withRoom(floor, room), gesture)
            }
            onGestureEnd={endGesture}
            onRoomRemove={removeRoom}
            onAddOpening={startOpeningPlacement}
            placingOpening={placingOpening}
            onOpeningChange={changeOpening}
            onOpeningRemove={removeOpening}
            onInstanceChange={(instance: FurnitureInstance) =>
              setInstances(withInstance(instances, instance))
            }
            onInstanceRemove={(instance: FurnitureInstance) => {
              setInstances(instances.filter((one) => one.id !== instance.id));
              setSelection(null);
            }}
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

      {guideOpen ? (
        <ShortcutsGuide unit={unit} onClose={() => setGuideOpen(false)} />
      ) : null}

      {settingsOpen ? (
        <SettingsDialog
          unit={unit}
          onUnitChange={setUnit}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}

      {listOpen ? <ListDrawer onClose={() => setListOpen(false)} /> : null}
    </div>
  );
}

/**
 * Whether the keystroke belongs to a field somebody is typing in.
 *
 * A number field's own undo, and its own Delete, are the browser's to handle.
 * The workspace only takes a key when nothing is being typed into.
 */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/** The same room, moved so the point given is its middle rather than a corner. */
function centredRoom(room: Room, at: FloorPoint): Room {
  const bounds = roomBounds(room);
  return withOrigin(room, {
    xMeters: at.xMeters - bounds.widthMeters / 2,
    zMeters: at.zMeters - bounds.depthMeters / 2,
  });
}
