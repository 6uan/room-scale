"use client";

import {
  Box,
  Keyboard,
  ReceiptText,
  Redo2,
  Settings,
  Undo2,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { openingName } from "@/components/opening-name";
import { LayoutSwitcher } from "@/components/layout-switcher";
import { ProjectSwitcher } from "@/components/project-switcher";
import {
  PANEL_RESERVE_PIXELS,
  RoomPlanCanvas,
} from "@/components/room-plan-canvas";
import {
  groupSelection,
  groupedRoomIds,
  selectedInstanceIds,
  type Selection,
} from "@/components/selection";
import { Chip, ChipRow } from "@/components/panel/chip";
import type { WallsMode } from "@/scene/apartment-scene";
import { ShortcutsGuide } from "@/components/shortcuts-guide";
import { pressIs } from "@/components/shortcuts";
import {
  countPlaced,
  createInstance,
  footprintRect,
  type FurnitureInstance,
  type FurnitureProduct,
  placedFurniture,
  placedNames,
  placementFor,
  roomUnder,
  roundPositions,
  shownFurniture,
  withInstance,
  withInstanceHidden,
  withInstanceName,
} from "@/domain/furniture";
import type { FloorPoint, Framing } from "@/domain/geometry";
import {
  type Layout,
  type PieceGroup,
  activeInstances,
  activeLayout,
  buildChecklist,
  createLayout,
  createUnderlay,
  duplicateLayout,
  nextId,
  nextLayoutName,
  renameLayout,
  withGroup,
  withGroupName,
  withLayoutInstances,
  withLayouts,
  withPieceMoved,
  withProducts,
  withoutGroup,
} from "@/domain/project";
import { readPlanImage } from "@/components/underlay-image";
import {
  createOpening,
  createRoom,
  drawnRoom,
  drawnSection,
  nextPartId,
  floorBounds,
  roomBounds,
  withOrigin,
  withOpenings,
  withParts,
  withRoom,
  withRoomMoved,
  withRooms,
  type Opening,
  type OpeningKind,
  type Room,
  type WallSide,
} from "@/domain/room";
import {
  metersFromDisplayValue,
  metersFromInches,
  roundToDisplayUnit,
  storedUnit,
} from "@/domain/units";
import { checkLayout, troubledInstanceIds } from "@/domain/validation";
import {
  usePreferencesStore,
  useDisplayUnit,
  useProductUnit,
} from "@/state/preferences-store";
import { useProjectStore } from "@/state/project-store";

/**
 * How big a section is when the tool was pressed rather than dragged.
 *
 * Four feet square. Big enough to see and grab on the plan, small enough that
 * it is obviously a starting point rather than an answer — the same bargain
 * `createRoom` makes for a room dropped without a drag.
 */
const DEFAULT_SECTION_METERS = metersFromInches(48);

/**
 * Loaded on the client only: Three.js wants a window, and the plan is the
 * page that renders first either way.
 */
const ApartmentScene = dynamic(
  () =>
    import("@/scene/apartment-scene").then((module) => module.ApartmentScene),
  { ssr: false },
);

/**
 * The workspace: what is in the apartment, the plan, and whatever is selected.
 *
 * Three panels rather than a page of forms, because there is one question being
 * asked at a time and the plan should be the thing you are looking at while you
 * ask it. Selecting is the spine: press a name on the left or a piece on the
 * plan, and the right-hand panel becomes that thing's editor.
 */
const NO_GROUPS: readonly PieceGroup[] = [];

/** The perspective view's three ways of drawing walls, in the switch's order. */
const WALLS_MODES: readonly {
  mode: WallsMode;
  label: string;
  title: string;
}[] = [
  {
    mode: "see-through",
    label: "See-through",
    title: "Every wall see-through, so nothing is hidden",
  },
  {
    mode: "auto",
    label: "Auto",
    title:
      "Walls between rooms see-through; an outside wall only while it is in the way",
  },
  { mode: "solid", label: "Solid", title: "Every wall solid" },
];

export function Workspace() {
  const floor = useProjectStore((state) => state.project.floor);
  const underlay = useProjectStore((state) => state.project.underlay);
  const unit = useDisplayUnit();
  const productUnit = useProductUnit();
  const setImperialLengths = usePreferencesStore(
    (state) => state.setImperialLengths,
  );
  const products = useProjectStore((state) => state.project.products);
  const instances = useProjectStore((state) => activeInstances(state.project));
  const setFloor = useProjectStore((state) => state.setFloor);
  const setUnderlay = useProjectStore((state) => state.setUnderlay);
  const setUnit = useProjectStore((state) => state.setDisplayUnit);
  const setProducts = useProjectStore((state) => state.setProducts);
  const setInstances = useProjectStore((state) => state.setInstances);
  const moveRooms = useProjectStore((state) => state.moveRooms);
  const moveInstances = useProjectStore((state) => state.moveInstances);
  const storedGroups = useProjectStore(
    (state) => activeLayout(state.project).groups,
  );
  const groups = storedGroups ?? NO_GROUPS;
  const setGroups = useProjectStore((state) => state.setGroups);
  const layouts = useProjectStore((state) => state.project.layouts);
  const activeLayoutId = useProjectStore(
    (state) => state.project.activeLayoutId,
  );
  const setLayouts = useProjectStore((state) => state.setLayouts);
  const project = useProjectStore((state) => state.project);
  const adopt = useProjectStore((state) => state.adopt);
  const setActiveLayout = useProjectStore((state) => state.setActiveLayout);
  const undo = useProjectStore((state) => state.undo);
  const redo = useProjectStore((state) => state.redo);
  const canUndo = useProjectStore((state) => state.canUndo);
  const canRedo = useProjectStore((state) => state.canRedo);
  const endGesture = useProjectStore((state) => state.endGesture);

  // Facts about this session, never about the project.
  const [selection, setSelection] = useState<Selection>(null);
  const [productProblem, setProductProblem] = useState<string | null>(null);
  /** A passing confirmation, such as that a product was saved. */
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  /**
   * Whether the apartment is being looked at from inside rather than from
   * above. Every edit happens on the plan, so arming any drawing or placing
   * mode brings the plan back without the button having to be pressed.
   */
  const [perspective, setPerspective] = useState(false);
  /** How the perspective view draws its walls. A fact about this sitting. */
  const [walls, setWalls] = useState<WallsMode>("see-through");
  /**
   * What the plan is showing, kept as it pans and zooms so the perspective
   * view can open on it. A ref, not state: the plan reports on every pan, and
   * nothing renders from it until the view is switched.
   */
  const planFramingRef = useRef<Framing | null>(null);
  const onPlanFraming = useCallback((framing: Framing) => {
    planFramingRef.current = framing;
  }, []);
  /** What the perspective view opened on, taken when it was switched to. */
  const [sceneFraming, setSceneFraming] = useState<Framing | null>(null);
  /** Where the perspective view was left, for the plan to come back to. */
  const [returnFraming, setReturnFraming] = useState<{
    readonly framing: Framing;
    readonly id: number;
  } | null>(null);
  /** Whether a drag on the plan draws a room. One room, then off again. */
  const [drawingRoom, setDrawingRoom] = useState(false);
  /**
   * The room whose next drag draws another of its rectangles, or null.
   *
   * A mode rather than something worked out from where the rectangle landed.
   * Rooms that share a wall sit one wall apart and a rectangle drawn
   * flush inside a space sits at zero — inches between them — so guessing
   * "another room or another rectangle of this one" from the geometry would
   * answer a structural question by pointer accident.
   */
  const [drawingSectionOf, setDrawingSectionOf] = useState<string | null>(null);
  /** The kind and room whose next wall click places one opening. */
  const [placingOpening, setPlacingOpening] = useState<{
    readonly roomId: string;
    readonly kind: OpeningKind;
  } | null>(null);
  /** Which side panels are folded away. A fact about this sitting. */
  const [folded, setFolded] = useState({ furniture: false });
  /** The product armed from the list, waiting for a click on the plan. */
  const [placingProduct, setPlacingProduct] = useState<FurnitureProduct | null>(
    null,
  );
  const showingPlan =
    !perspective ||
    drawingRoom ||
    drawingSectionOf !== null ||
    placingOpening !== null ||
    placingProduct !== null;

  const furniture = placedFurniture(instances, products);
  // What is set aside stays in the list, but is off the plan, out of the
  // checks, and off the bill.
  const shown = shownFurniture(furniture);
  const problems = checkLayout(floor, shown);
  const troubledIds = troubledInstanceIds(problems);
  const roomNames = new Map(
    floor.rooms.map((room) => [
      room.id,
      room.name === "" ? "an unnamed room" : room.name,
    ]),
  );
  const openingNames = new Map(
    floor.rooms.flatMap((room) =>
      room.openings.map((opening) => [opening.id, openingName(room, opening)]),
    ),
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

  /** A fresh arrangement of the same apartment, with nothing placed yet. */
  function createEmptyLayout(): void {
    const id = nextId(
      "layout",
      layouts.map((one) => one.id),
    );
    setLayouts([...layouts, createLayout(id, nextLayoutName(layouts))]);
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

  /** Reads the listing's plan and drops it under the grid, ready to be sized. */
  async function addPlanImage(file: File): Promise<void> {
    const image = await readPlanImage(file);
    const { origin, extent } = floorBounds(floor);
    setUnderlay(
      createUnderlay(image.dataUrl, image.widthPixels, image.heightPixels, {
        xMeters: origin.xMeters + extent.widthMeters / 2,
        zMeters: origin.zMeters + extent.depthMeters / 2,
      }),
    );
    // Whatever tool was armed is put down: the image is the thing to look at
    // now, and its corners are there to be dragged.
    setDrawingRoom(false);
    setPlacingOpening(null);
  }

  /**
   * A drag on the plan, given to whichever draw tool is armed.
   *
   * `to` is null when the press was a click rather than a drag, which means
   * "one here, the usual size" — centred on the point, so it arrives under the
   * pointer rather than at a corner of it. The canvas can tell a click from a
   * drag because it knows pixels; it has no business knowing how big a room
   * usually is, which is why the choice is made here.
   *
   * Which tool is armed decides what gets drawn. Nothing about the rectangle
   * itself is consulted: see `drawingSectionOf`.
   */
  function drawOnPlan(from: FloorPoint, to: FloorPoint | null): void {
    // Both paths land on whole inches or centimeters, so what is drawn begins
    // life with the kind of numbers somebody could have typed.
    const round = (meters: number) => roundToDisplayUnit(meters, unit);
    const host =
      drawingSectionOf === null
        ? undefined
        : floor.rooms.find((one) => one.id === drawingSectionOf);

    if (host !== undefined) {
      drawSection(host, from, to, round);
      return;
    }

    const id = nextId(
      "room",
      floor.rooms.map((one) => one.id),
    );
    const name = `Room ${floor.rooms.length + 1}`;
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

  /**
   * Another rectangle of `host`, where it was drawn.
   *
   * A press without a drag still adds one, centred where the pointer went
   * down, so the tool behaves the way the room tool does rather than swallowing
   * a click and looking broken.
   */
  function drawSection(
    host: Room,
    from: FloorPoint,
    to: FloorPoint | null,
    round: (meters: number) => number,
  ): void {
    const id = nextPartId(host);
    const corner =
      to ??
      ({
        xMeters: from.xMeters + DEFAULT_SECTION_METERS,
        zMeters: from.zMeters + DEFAULT_SECTION_METERS,
      } satisfies FloorPoint);
    const part = drawnSection(floor, host, id, from, corner, round);

    setFloor(withRoom(floor, withParts(host, [...host.parts, part])));
    setSelection({ kind: "room-part", roomId: host.id, id });
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

  function changeOpening(room: Room, opening: Opening, gesture?: string): void {
    setFloor(
      withRoom(
        floor,
        withOpenings(
          room,
          room.openings.map((one) => (one.id === opening.id ? opening : one)),
        ),
      ),
      gesture,
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
      case "group": {
        setFloor(
          withRooms(
            floor,
            floor.rooms.filter((one) => !selection.roomIds.includes(one.id)),
          ),
        );
        setInstances(
          instances.filter((one) => !selection.instanceIds.includes(one.id)),
        );
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
    // The form closes and says what it did: a save that left the same form
    // on screen, unchanged, read as a save that had not happened.
    setSelection(null);
    say(known ? `Saved ${product.name}` : `Added ${product.name}`);
  }

  /** A word over the plan for a moment, for a change nothing else shows. */
  function say(message: string): void {
    setNotice(message);
    if (noticeTimer.current !== null) {
      clearTimeout(noticeTimer.current);
    }
    noticeTimer.current = setTimeout(() => setNotice(null), 2200);
  }

  /**
   * Removes a product and every copy of it in every layout, as one step.
   *
   * The ordinary remove refuses a placed product (ADR 0003). This is the
   * explicit version, asked for by name from the row's menu, which says how
   * many copies it takes with it — and it is one undoable edit, so the
   * whole thing comes back together.
   */
  function deleteProductEverywhere(product: FurnitureProduct): void {
    const stripped = withLayouts(
      withProducts(
        project,
        products.filter((one) => one.id !== product.id),
      ),
      layouts.map((layout) =>
        withLayoutInstances(
          layout,
          layout.instances.filter((one) => one.productId !== product.id),
        ),
      ),
    );
    adopt(stripped, { undoable: true });
    setSelection(null);
  }

  /**
   * Rounds rooms and pieces to the nearest whole unit, moving and never
   * resizing: see `roundPositions`. A room's own pieces are rounded with it,
   * and the whole of it is one step to undo.
   */
  function roundPositionsOf(
    roomIds: readonly string[],
    instanceIds: readonly string[],
  ): void {
    const inRooms = furniture.flatMap((placed) => {
      const room = roomUnder(floor, footprintRect(placed));
      return room !== null && roomIds.includes(room.id)
        ? [placed.instance.id]
        : [];
    });
    const result = roundPositions(
      floor,
      furniture,
      { roomIds, instanceIds: [...new Set([...instanceIds, ...inRooms])] },
      metersFromDisplayValue(1, unit),
      groups,
    );
    const moved = new Map(result.instances.map((one) => [one.id, one]));
    const gesture = "round-positions";
    setFloor(withRooms(floor, result.rooms), gesture);
    setInstances(
      instances.map((one) => moved.get(one.id) ?? one),
      gesture,
    );
    endGesture();
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
        (drawingRoom ||
          drawingSectionOf !== null ||
          placingOpening !== null ||
          placingProduct !== null) &&
        pressIs("deselect", event)
      ) {
        event.preventDefault();
        setDrawingRoom(false);
        setDrawingSectionOf(null);
        setPlacingProduct(null);
        setPlacingOpening(null);
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
          <ProjectSwitcher />
          <span aria-hidden="true" className="opacity-30">
            /
          </span>
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
            onCreate={createEmptyLayout}
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
          {/* The same apartment from inside. A mode rather than a page: the
              panels on either side stay, and the plan comes back by itself
              whenever something is drawn or placed. */}
          <IconButton
            label="Perspective"
            icon={Box}
            pressed={!showingPlan}
            onClick={() => {
              if (showingPlan) {
                setSceneFraming(planFramingRef.current);
              }
              setPerspective(showingPlan);
            }}
          />
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

      {/* Two columns: the list and the plan. The details panel is for what
          is selected, and floats over the plan's right edge only while
          something is; the plan itself always has the full width, so
          selecting and deselecting never resizes it and nothing on it
          moves. The apartment's own settings are behind the gear. */}
      <div className="relative grid min-h-0 grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        {/* The catalogue sits at the bottom and grows upward as it fills; the
            layers take the rest, so spare room shows above it rather than
            below. */}
        <aside
          aria-label="Contents"
          className="grid min-w-0 overflow-hidden border-r border-black/10 dark:border-white/15"
          // The apartment list takes the rest and the furniture list is capped.
          style={{ gridTemplateRows: "minmax(0, 1fr) auto" }}
        >
          <ApartmentLayers
            floor={floor}
            furniture={furniture}
            selection={selection}
            troubledIds={troubledIds}
            onSelect={setSelection}
            onRoomChange={(room) => moveRooms([room])}
            onAddRoom={() => {
              setPlacingOpening(null);
              setDrawingSectionOf(null);
              setDrawingRoom((on) => !on);
            }}
            drawingRoom={drawingRoom}
            groups={groups}
            onGroup={(ids) => {
              const id = nextId(
                "group",
                groups.map((one) => one.id),
              );
              setGroups(withGroup(groups, id, ids));
              setSelection(groupSelection(ids, []));
            }}
            onUngroup={(id) => setGroups(withoutGroup(groups, id))}
            onRenameGroup={(id, name) =>
              setGroups(withGroupName(groups, id, name))
            }
            onToggleHidden={(id) => {
              const instance = instances.find((one) => one.id === id);
              if (instance !== undefined) {
                setInstances(
                  withInstance(
                    instances,
                    withInstanceHidden(instance, instance.hidden !== true),
                  ),
                );
              }
            }}
            onRemove={(id) => {
              setInstances(instances.filter((one) => one.id !== id));
              setSelection(null);
            }}
            onReorderRoom={(roomId, beforeRoomId) =>
              setFloor(withRoomMoved(floor, roomId, beforeRoomId))
            }
            onReorder={(id, drop) => {
              const moving = instances.find((one) => one.id === id);
              if (moving === undefined) {
                return;
              }
              const rest = instances.filter((one) => one.id !== id);
              const at =
                drop.beforeId === null
                  ? -1
                  : rest.findIndex((one) => one.id === drop.beforeId);
              // One drag, one undo: the order and the group change together.
              const gesture = `reorder:${id}`;
              setInstances(
                at === -1
                  ? [...rest, moving]
                  : [...rest.slice(0, at), moving, ...rest.slice(at)],
                gesture,
              );
              setGroups(withPieceMoved(groups, id, drop.into), gesture);
              endGesture();
            }}
            onRenamePiece={(id, name) => {
              const instance = instances.find((one) => one.id === id);
              if (instance !== undefined) {
                setInstances(
                  withInstance(instances, withInstanceName(instance, name)),
                );
              }
            }}
            onReorderGroup={(groupId, beforeId) => {
              const group = groups.find((one) => one.id === groupId);
              if (
                group === undefined ||
                (beforeId !== null && group.instanceIds.includes(beforeId))
              ) {
                return;
              }
              const moving = group.instanceIds.flatMap((id) => {
                const one = instances.find((candidate) => candidate.id === id);
                return one === undefined ? [] : [one];
              });
              const rest = instances.filter(
                (one) => !group.instanceIds.includes(one.id),
              );
              const at = rest.findIndex((one) => one.id === beforeId);
              setInstances(
                at === -1
                  ? [...rest, ...moving]
                  : [...rest.slice(0, at), ...moving, ...rest.slice(at)],
              );
            }}
            onAddToGroup={(groupId, id) =>
              setGroups(withPieceMoved(groups, id, { groupId }))
            }
          />
          <CataloguePanel
            products={products}
            instances={instances}
            unit={productUnit}
            selection={selection}
            onSelect={setSelection}
            onDelete={deleteProductEverywhere}
            onReorder={(id, beforeId) => {
              const moving = products.find((one) => one.id === id);
              if (moving === undefined) {
                return;
              }
              const rest = products.filter((one) => one.id !== id);
              const at = rest.findIndex((one) => one.id === beforeId);
              setProducts(
                at === -1
                  ? [...rest, moving]
                  : [...rest.slice(0, at), moving, ...rest.slice(at)],
              );
            }}
            collapsed={folded.furniture}
            onToggleCollapsed={() =>
              setFolded((was) => ({ ...was, furniture: !was.furniture }))
            }
            onPlace={(product) => {
              setDrawingRoom(false);
              setDrawingSectionOf(null);
              setPlacingOpening(null);
              setPlacingProduct(product);
            }}
          />
        </aside>

        <main
          aria-label={showingPlan ? "Plan" : "Perspective"}
          className="relative min-h-0 overflow-hidden"
        >
          {showingPlan ? null : (
            <div className="absolute inset-0">
              <ApartmentScene
                floor={floor}
                furniture={shown}
                unit={unit}
                productUnit={productUnit}
                framing={sceneFraming}
                onFramingChange={(framing) =>
                  setReturnFraming((was) => ({
                    framing,
                    id: (was?.id ?? 0) + 1,
                  }))
                }
                walls={walls}
              />
              {/*
                See-through by default, so nothing in any room is hidden by a
                wall from any angle; solid to see the place as it will look;
                auto to have the walls in the way fade as the camera moves.
              */}
              <div className="absolute top-3 left-3 flex w-72 rounded-lg bg-black/70 p-1 dark:bg-white/10">
                <ChipRow name="Walls">
                  {WALLS_MODES.map(({ mode, label, title }) => (
                    <Chip
                      key={mode}
                      label={`${label} walls`}
                      title={title}
                      pressed={walls === mode}
                      onClick={() => setWalls(mode)}
                    >
                      {label}
                    </Chip>
                  ))}
                </ChipRow>
              </div>
            </div>
          )}
          <div className={showingPlan ? "absolute inset-0" : "hidden"}>
            <RoomPlanCanvas
              floor={floor}
              furniture={shown}
              unit={unit}
              panelOpen={selection !== null}
              productUnit={productUnit}
              onFramingChange={onPlanFraming}
              showFraming={returnFraming}
              selectedIds={selectedInstanceIds(selection)}
              troubledIds={troubledIds}
              groupRoomIds={groupedRoomIds(selection)}
              groups={groups}
              onSelect={(instanceIds, roomIds) =>
                setSelection(groupSelection(instanceIds, roomIds))
              }
              // A room that moves carries its furniture, except what is
              // already moving with it as part of the group.
              onRoomsChange={(rooms, gesture) =>
                moveRooms(rooms, gesture, selectedInstanceIds(selection))
              }
              onInstanceChange={(instance, gesture) =>
                moveInstances([instance], gesture)
              }
              onInstancesChange={(moved, gesture) =>
                moveInstances(moved, gesture)
              }
              selectedRoomId={
                selection?.kind === "room"
                  ? selection.id
                  : selection?.kind === "room-part" ||
                      selection?.kind === "section-group"
                    ? selection.roomId
                    : null
              }
              selectedRoomPartId={
                selection?.kind === "room-part" ? selection.id : null
              }
              selectedGroupPartIds={
                selection?.kind === "section-group"
                  ? (floor.rooms
                      .find((one) => one.id === selection.roomId)
                      ?.parts.filter((part) => part.groupId === selection.id)
                      .map((part) => part.id) ?? [])
                  : []
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
              onRoomChange={(room, gesture) => moveRooms([room], gesture)}
              onGestureEnd={endGesture}
              drawing={drawingRoom || drawingSectionOf !== null}
              onDrawRoom={drawOnPlan}
              onDrawEnd={() => {
                setDrawingRoom(false);
                setDrawingSectionOf(null);
              }}
              placingOpening={placingOpening}
              onPlaceOpening={placeOpening}
              onPlaceOpeningEnd={() => setPlacingOpening(null)}
              placingProduct={placingProduct}
              onPlaceProduct={place}
              onPlaceProductEnd={() => setPlacingProduct(null)}
              underlay={underlay}
              onUnderlayChange={setUnderlay}
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
          {floor.rooms.length === 0 && showingPlan ? (
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
          {/* Short of the details panel while it is open, as the plan's own
              readings are, so a long problem does not run under it. */}
          <div
            className="pointer-events-none absolute inset-y-0 left-0"
            style={{ right: selection === null ? 0 : PANEL_RESERVE_PIXELS }}
          >
            {notice === null ? null : (
              <p
                role="status"
                className="pointer-events-none absolute bottom-16 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-4 py-1.5 text-[13px] text-white dark:bg-white/15"
              >
                {notice}
              </p>
            )}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4 pr-52">
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
                  openingNames={openingNames}
                  unit={unit}
                />
              </div>
            </div>
          </div>
        </main>

        {selection === null ? null : (
          <aside
            aria-label="Details"
            className="absolute inset-y-0 right-0 z-10 w-80 min-h-0 overflow-hidden border-l border-black/10 bg-background shadow-xl dark:border-white/15"
          >
            <Inspector
              onRoundPositions={roundPositionsOf}
              productUnit={productUnit}
              floor={floor}
              furniture={furniture}
              products={products}
              unit={unit}
              selection={selection}
              onSelect={setSelection}
              onFloorChange={setFloor}
              underlay={underlay}
              onAddPlanImage={(file) => {
                void addPlanImage(file);
              }}
              onUnderlayChange={setUnderlay}
              onRoomChange={(room, gesture) => moveRooms([room], gesture)}
              onGestureEnd={endGesture}
              onRoomRemove={removeRoom}
              drawingSectionOf={drawingSectionOf}
              onDrawSection={(room) => {
                setPlacingOpening(null);
                setDrawingRoom(false);
                setDrawingSectionOf((on) => (on === room.id ? null : room.id));
              }}
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
              onGroupRemove={(instanceIds, roomIds) => {
                setFloor(
                  withRooms(
                    floor,
                    floor.rooms.filter((one) => !roomIds.includes(one.id)),
                  ),
                );
                setInstances(
                  instances.filter((one) => !instanceIds.includes(one.id)),
                );
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
        )}
      </div>

      {guideOpen ? (
        <ShortcutsGuide unit={unit} onClose={() => setGuideOpen(false)} />
      ) : null}

      {settingsOpen ? (
        <SettingsDialog
          unit={unit}
          onUnitChange={(next) => {
            setUnit(storedUnit(next));
            if (next !== "metric") {
              setImperialLengths(
                next === "inches" ? "inches" : "feet-and-inches",
              );
            }
          }}
          floor={floor}
          onFloorChange={setFloor}
          underlay={underlay}
          onAddPlanImage={(file) => {
            void addPlanImage(file);
          }}
          onUnderlayChange={setUnderlay}
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
