"use client";

import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  createPlanProjection,
  panBy,
  projectLength,
  projectPoint,
  unprojectPoint,
  zoomAt,
  type FloorPoint,
  type PixelPoint,
  type PixelSize,
  type PlanProjection,
} from "@/domain/geometry";
import {
  clampToFloor,
  furnitureAt,
  moveInstance,
  placedNames,
  type FurnitureInstance,
  type PlacedFurniture,
} from "@/domain/furniture";
import { instanceFromKeyPress } from "@/components/placement-keys";
import { PRODUCT_DRAG_TYPE } from "@/components/catalogue-panel";
import {
  checkOpening,
  checkWalkway,
  floorBounds,
  openingEndpoints,
  pointOnFloor,
  roomsAt,
  snapRoomOrigin,
  wallOutwardNormal,
  withOrigin,
  type Floor,
  type FloorVector,
  type Opening,
  type Room,
  type Walkway,
} from "@/domain/room";
import { formatAngle, formatLength, type DisplayUnit } from "@/domain/units";

/** Space kept outside the walls for the dimension lines. */
const DIMENSION_PADDING_PIXELS = 56;
const DIMENSION_OFFSET_PIXELS = 26;
const WITNESS_GAP_PIXELS = 5;
const TICK_PIXELS = 4;
const LABEL_PIXELS = 12;
const LABEL_GAP_PIXELS = 7;

/**
 * Opacities, so a single foreground color carries the whole drawing and follows
 * the light and dark themes without a second palette. Walls are nearly solid,
 * which is how a plan marks cut material.
 */
const FLOOR_ALPHA = 0.05;
const GRID_ALPHA = 0.09;
const WALL_ALPHA = 0.88;
const JAMB_ALPHA = 0.5;
const SYMBOL_ALPHA = 0.55;
const SWING_ALPHA = 0.28;
const DIMENSION_ALPHA = 0.4;
const LABEL_ALPHA = 0.75;
const FURNITURE_FILL_ALPHA = 0.22;
const FURNITURE_EDGE_ALPHA = 0.7;
const SELECTED_FILL_ALPHA = 0.36;
const HANDLE_PIXELS = 6;

/**
 * The one color in the drawing that is not the foreground. A problem has to be
 * findable at a glance, and it reads on both the light and the dark theme —
 * the same red the forms use for a field that will not do.
 */
const PROBLEM_COLOR = "#dc2626";

/** A protected route: its preferred width filled, its minimum drawn inside. */
const WALKWAY_FILL_ALPHA = 0.07;
const WALKWAY_EDGE_ALPHA = 0.35;

/** Room names: present, and never competing with the measurements. */
const ROOM_NAME_ALPHA = 0.45;

export type RoomPlanCanvasProps = {
  floor: Floor;
  furniture: readonly PlacedFurniture[];
  unit: DisplayUnit;
  /** Which piece is being worked on, or null. Never persisted: this is UI state. */
  selectedId: string | null;
  /** Pieces the validation has something to say about, marked as they are drawn. */
  troubledIds: ReadonlySet<string>;
  onSelect: (instanceId: string | null) => void;
  onInstanceChange: (instance: FurnitureInstance) => void;
  /** Which room is being worked on, so the plan can mark and move it. */
  selectedRoomId?: string | null;
  onSelectRoom?: (roomId: string) => void;
  onRoomChange?: (room: Room) => void;
  /** A product dragged in from the catalogue, dropped where it was let go. */
  onDropProduct?: (productId: string, at: FloorPoint) => void;
};

/**
 * A drag in progress, held in a ref because moving it re-renders enough.
 *
 * Either a piece is being moved, or the view is being panned. Panning carries
 * the pixel it started from; moving carries where in the piece it was grabbed,
 * so the piece does not jump under the pointer.
 */
type Drag =
  | {
      readonly kind: "move";
      readonly pointerId: number;
      readonly instanceId: string;
      readonly grabOffset: FloorPoint;
    }
  | {
      readonly kind: "room";
      readonly pointerId: number;
      readonly roomId: string;
      /** Where in the room it was grabbed, so it does not jump under the pointer. */
      readonly grabOffset: FloorPoint;
    }
  | {
      readonly kind: "pan";
      readonly pointerId: number;
      readonly from: PixelPoint;
    };

/**
 * A top-down view of the room, drawn to scale on a 2D canvas, and the place
 * furniture is dragged around.
 *
 * The canvas is a picture of the room, not the way to understand it: the
 * numbers beside it stay authoritative, and this element carries a text
 * description for anyone who cannot see the drawing. Everything a drag does,
 * the fields and the arrow keys beside it do too.
 *
 * A canvas has no nodes to hit test against, so a pointer position goes back
 * through the plan projection into meters and the question is answered against
 * the floor — the same footprints validation measures.
 */
export function RoomPlanCanvas({
  floor,
  furniture,
  unit,
  selectedId,
  troubledIds,
  onSelect,
  onInstanceChange,
  onDropProduct,
  selectedRoomId = null,
  onSelectRoom,
  onRoomChange,
}: RoomPlanCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState(false);
  const { ref: frameRef, size } = useElementSize<HTMLDivElement>();

  // Null until the view is moved, so the plan re-fits itself as the apartment
  // grows or the panel resizes. Once it has been panned or zoomed, it stays
  // where it was put — a view that jumps back is a view you cannot work in.
  const [view, setView] = useState<PlanProjection | null>(null);
  const fitted = planProjectionFor(floor, size);
  const projection = view ?? fitted;

  // Read by the pointer handlers, which must use the same transform the last
  // paint used rather than one recomputed from stale state.
  const projectionRef = useRef(projection);
  useEffect(() => {
    projectionRef.current = projection;
  }, [projection]);

  // Space turns the pointer into a hand, as it does in every canvas tool. Held
  // in a ref for the handlers and in state for the cursor.
  const panningRef = useRef(false);
  const [panReady, setPanReady] = useState(false);

  /**
   * Whether the plan is taking pointer input for the view.
   *
   * Focus is the toggle: click into the plan and it pans and zooms; click away
   * and a stray trackpad swipe cannot send the drawing off somewhere. It also
   * costs nothing to explain — the focus ring already says which it is.
   */
  const [active, setActive] = useState(false);
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width <= 0 || size.height <= 0) {
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      // No 2D canvas — jsdom under test, or a browser that refuses one. The
      // numeric panel beside this still shows the whole room.
      return;
    }

    // Back the canvas with real device pixels so hairlines and text stay crisp,
    // then work in CSS pixels for the rest of the drawing.
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.width * ratio);
    canvas.height = Math.round(size.height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const style = window.getComputedStyle(canvas);
    drawPlan(context, {
      projection,
      floor,
      furniture,
      unit,
      selectedId,
      selectedRoomId,
      troubledIds,
      viewport: size,
      color: style.color,
      fontFamily: style.fontFamily,
    });
  }, [
    floor,
    furniture,
    unit,
    selectedId,
    selectedRoomId,
    troubledIds,
    size,
    projection,
  ]);

  /** Wheel: pan, unless a modifier makes it a zoom toward the pointer. */
  function handleWheel(
    event: WheelEventInit & { preventDefault(): void },
  ): void {
    const canvas = canvasRef.current;
    if (!canvas || !activeRef.current) {
      // Not clicked into: the wheel belongs to whatever is behind it, and the
      // plan stays where it was left.
      return;
    }
    // The page must not scroll out from under a plan being panned, which means
    // a listener React cannot give us: its own wheel handlers are passive.
    event.preventDefault();
    const box = canvas.getBoundingClientRect();
    const at = {
      x: (event.clientX ?? 0) - box.left,
      y: (event.clientY ?? 0) - box.top,
    };
    const current = projectionRef.current;

    if (event.ctrlKey || event.metaKey) {
      // A wheel notch is about 100 units; a trackpad pinch arrives in ones.
      const factor = Math.exp(-(event.deltaY ?? 0) / 250);
      setView(
        zoomAt(
          current,
          factor,
          at,
          fitted.pixelsPerMeter * MIN_ZOOM,
          fitted.pixelsPerMeter * MAX_ZOOM,
        ),
      );
      return;
    }

    setView(panBy(current, -(event.deltaX ?? 0), -(event.deltaY ?? 0)));
  }

  // Held in a ref so the listener below never goes stale without being
  // torn down and rebuilt on every render.
  const wheelRef = useRef(handleWheel);
  useEffect(() => {
    wheelRef.current = handleWheel;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const listener = (event: globalThis.WheelEvent) => wheelRef.current(event);
    canvas.addEventListener("wheel", listener, { passive: false });
    return () => canvas.removeEventListener("wheel", listener);
  }, []);

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>): void {
    const canvas = canvasRef.current;
    const point =
      canvas && floorPointAt(canvas, floor, event, projectionRef.current);
    if (!canvas || !point) {
      return;
    }

    const box = canvas.getBoundingClientRect();
    const hit = furnitureAt(furniture, point);
    // Furniture first: it stands on the room, so it is what you are pointing
    // at when the two are in the same place. Rooms later in the list win over
    // earlier ones, being the ones drawn on top.
    const room = hit === null ? (roomsAt(floor, point).at(-1) ?? null) : null;

    // Space held, the middle button, or floor with nothing on it: the view
    // moves instead of anything in it.
    if (
      panningRef.current ||
      event.button === 1 ||
      (hit === null && room === null)
    ) {
      if (hit === null && room === null && !panningRef.current) {
        onSelect(null);
      }
      dragRef.current = {
        kind: "pan",
        pointerId: event.pointerId,
        from: { x: event.clientX - box.left, y: event.clientY - box.top },
      };
      setDragging(true);
      canvas.setPointerCapture?.(event.pointerId);
      return;
    }

    if (hit === null && room !== null) {
      onSelectRoom?.(room.id);
      dragRef.current = {
        kind: "room",
        pointerId: event.pointerId,
        roomId: room.id,
        grabOffset: {
          xMeters: point.xMeters - room.origin.xMeters,
          zMeters: point.zMeters - room.origin.zMeters,
        },
      };
      setDragging(true);
      canvas.focus();
      canvas.setPointerCapture?.(event.pointerId);
      return;
    }
    if (hit === null) {
      return;
    }

    onSelect(hit.instance.id);
    dragRef.current = {
      kind: "move",
      pointerId: event.pointerId,
      instanceId: hit.instance.id,
      grabOffset: {
        xMeters: point.xMeters - hit.instance.position.xMeters,
        zMeters: point.zMeters - hit.instance.position.zMeters,
      },
    };
    setDragging(true);
    // Focus follows the grab, so a piece can be dragged roughly into place and
    // then nudged the last centimeter without reaching for the mouse again.
    canvas.focus();
    canvas.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>): void {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas || drag.pointerId !== event.pointerId) {
      return;
    }

    if (drag.kind === "room") {
      const moving = floor.rooms.find((one) => one.id === drag.roomId);
      const point = floorPointAt(canvas, floor, event, projectionRef.current);
      if (moving === undefined || point === null) {
        return;
      }
      // Snapped as it is dragged, so a room shares a wall by being brought up
      // against one rather than by arithmetic.
      onRoomChange?.(
        withOrigin(
          moving,
          snapRoomOrigin(floor, moving, {
            xMeters: point.xMeters - drag.grabOffset.xMeters,
            zMeters: point.zMeters - drag.grabOffset.zMeters,
          }),
        ),
      );
      return;
    }

    if (drag.kind === "pan") {
      const box = canvas.getBoundingClientRect();
      const to = { x: event.clientX - box.left, y: event.clientY - box.top };
      setView(
        panBy(projectionRef.current, to.x - drag.from.x, to.y - drag.from.y),
      );
      dragRef.current = { ...drag, from: to };
      return;
    }

    const placed = furniture.find(
      ({ instance }) => instance.id === drag.instanceId,
    );
    const point = floorPointAt(canvas, floor, event, projectionRef.current);
    if (!placed || !point) {
      return;
    }

    onInstanceChange(
      moveInstance(
        placed.instance,
        clampToFloor(floor, {
          xMeters: point.xMeters - drag.grabOffset.xMeters,
          zMeters: point.zMeters - drag.grabOffset.zMeters,
        }),
      ),
    );
  }

  function handleDrop(event: DragEvent<HTMLCanvasElement>): void {
    const canvas = canvasRef.current;
    const productId = event.dataTransfer.getData(PRODUCT_DRAG_TYPE);
    const point =
      canvas && floorPointAt(canvas, floor, event, projectionRef.current);
    if (!canvas || !point || productId === "") {
      return;
    }
    event.preventDefault();
    onDropProduct?.(productId, clampToFloor(floor, point));
  }

  function handleKeyUp(event: KeyboardEvent<HTMLCanvasElement>): void {
    if (event.key === " ") {
      panningRef.current = false;
      setPanReady(false);
    }
  }

  function endDrag(event: PointerEvent<HTMLCanvasElement>): void {
    if (dragRef.current?.pointerId !== event.pointerId) {
      return;
    }
    dragRef.current = null;
    setDragging(false);
    canvasRef.current?.releasePointerCapture?.(event.pointerId);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLCanvasElement>): void {
    if (event.key === "Escape") {
      onSelect(null);
      return;
    }

    // Back to the whole apartment, the way every canvas tool spells it.
    if (event.key === "0" || event.key === "1") {
      event.preventDefault();
      setView(null);
      return;
    }

    if (event.key === " ") {
      event.preventDefault();
      panningRef.current = true;
      setPanReady(true);
      return;
    }

    const placed = furniture.find(({ instance }) => instance.id === selectedId);
    const next = placed && instanceFromKeyPress(floor, placed.instance, event);
    if (!next) {
      return;
    }
    // Only once a key has been acted on: an arrow with nothing selected still
    // scrolls the page, which is what an arrow normally does.
    event.preventDefault();
    onInstanceChange(next);
  }

  return (
    <div ref={frameRef} className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        role="img"
        tabIndex={0}
        aria-label={describeFloor(floor, furniture, unit)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes(PRODUCT_DRAG_TYPE)) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }
        }}
        onDrop={handleDrop}
        onFocus={() => setActive(true)}
        onBlur={() => {
          setActive(false);
          panningRef.current = false;
          setPanReady(false);
        }}
        className={`block h-full w-full touch-none outline-none ${
          dragging
            ? "cursor-grabbing"
            : panReady
              ? "cursor-grab"
              : "cursor-pointer"
        }`}
      />

      {/* Said once, where it is needed, and gone as soon as it is not. */}
      {active ? null : (
        <p className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs text-white dark:bg-white/15">
          Click the plan to move around it
        </p>
      )}
    </div>
  );
}

/**
 * The floor point under a pointer, in meters, or null when the room cannot be
 * drawn at this size.
 *
 * The element is measured here rather than read from state, so a pointer landing
 * during a resize is placed against the canvas as it actually is.
 */
function floorPointAt(
  canvas: HTMLCanvasElement,
  floor: Floor,
  event: { clientX: number; clientY: number },
  projection: PlanProjection,
): FloorPoint | null {
  const box = canvas.getBoundingClientRect();
  // The projection the last paint used, not a freshly fitted one: once the
  // plan has been panned or zoomed, a fitted projection would put every click
  // where the drawing used to be.
  const point = unprojectPoint(projection, {
    x: event.clientX - box.left,
    y: event.clientY - box.top,
  });
  if (point === null) {
    return null;
  }

  // The projection covers a wall all round the apartment, and starts at the
  // north-west corner of everything on it rather than at the floor's zero.
  const { origin } = floorBounds(floor);
  return {
    xMeters: point.xMeters + origin.xMeters - floor.wallThicknessMeters,
    zMeters: point.zMeters + origin.zMeters - floor.wallThicknessMeters,
  };
}

/**
 * The projection the plan is drawn with. Shared by the drawing and the hit
 * testing, so a click lands where the piece appears rather than near it.
 */
function planProjectionFor(floor: Floor, viewport: PixelSize): PlanProjection {
  const thickness = floor.wallThicknessMeters;
  const { extent } = floorBounds(floor);
  return createPlanProjection(
    {
      widthMeters: extent.widthMeters + thickness * 2,
      depthMeters: extent.depthMeters + thickness * 2,
    },
    viewport,
    DIMENSION_PADDING_PIXELS,
  );
}

/** The same information as the drawing, for assistive technology. */
function describeFloor(
  floor: Floor,
  furniture: readonly PlacedFurniture[],
  unit: DisplayUnit,
): string {
  if (floor.rooms.length === 0) {
    return "Plan view of an apartment with no rooms in it yet.";
  }

  const { extent } = floorBounds(floor);
  const shell =
    `Plan view of an apartment ${formatLength(extent.widthMeters, unit)} across ` +
    `and ${formatLength(extent.depthMeters, unit)} down, ` +
    `holding ${floor.rooms.length} ${floor.rooms.length === 1 ? "room" : "rooms"}: ` +
    `${floor.rooms.map((room) => describeRoom(room, unit)).join("; ")}.`;

  return `${shell} ${describeFurniture(furniture, unit)}`;
}

/** One room: how big it is, where it stands, and what is cut into its walls. */
function describeRoom(room: Room, unit: DisplayUnit): string {
  const name = room.name === "" ? "an unnamed room" : room.name;
  const size =
    `${formatLength(room.widthMeters, unit)} wide by ` +
    `${formatLength(room.depthMeters, unit)} deep`;
  const at =
    `${formatLength(room.origin.xMeters, unit)} from the west and ` +
    `${formatLength(room.origin.zMeters, unit)} from the north`;

  if (room.openings.length === 0) {
    return `${name}, ${size}, at ${at}, with no openings`;
  }

  const openings = room.openings
    .map(
      (opening) =>
        `${opening.kind === "passage" ? "an open passage" : `a ${opening.kind}`} ` +
        `${formatLength(opening.widthMeters, unit)} wide on the ${opening.wall} wall`,
    )
    .join(", ");

  return `${name}, ${size}, at ${at}, with ${openings}`;
}

/**
 * Where each piece is, not only what it is. Position is editable now, so it is
 * part of what the drawing says and has to be readable without seeing it.
 */
function describeFurniture(
  furniture: readonly PlacedFurniture[],
  unit: DisplayUnit,
): string {
  if (furniture.length === 0) {
    return "Nothing placed in it yet.";
  }

  const names = placedNames(furniture);
  const pieces = furniture
    .map(({ instance, product }, index) => {
      const turn =
        instance.rotationRadians === 0
          ? ""
          : `, turned ${formatAngle(instance.rotationRadians)}`;
      return (
        `${names[index]}, ${formatLength(product.footprint.widthMeters, unit)} by ` +
        `${formatLength(product.footprint.depthMeters, unit)}, ` +
        `${formatLength(instance.position.xMeters, unit)} from the west wall and ` +
        `${formatLength(instance.position.zMeters, unit)} from the north wall${turn}`
      );
    })
    .join("; ");

  return `${furniture.length} ${furniture.length === 1 ? "piece" : "pieces"} placed: ${pieces}.`;
}

type DrawOptions = {
  projection: PlanProjection;
  floor: Floor;
  furniture: readonly PlacedFurniture[];
  unit: DisplayUnit;
  selectedId: string | null;
  selectedRoomId: string | null;
  troubledIds: ReadonlySet<string>;
  viewport: PixelSize;
  color: string;
  fontFamily: string;
};

/** Everything the drawing helpers need to place a floor coordinate in pixels. */
type PlanFrame = {
  toPixels: (point: FloorPoint) => PixelPoint;
  wallPixels: number;
  color: string;
};

function drawPlan(
  context: CanvasRenderingContext2D,
  {
    projection,
    floor,
    furniture,
    unit,
    selectedId,
    selectedRoomId,
    troubledIds,
    viewport,
    color,
    fontFamily,
  }: DrawOptions,
): void {
  context.clearRect(0, 0, viewport.width, viewport.height);

  const thickness = floor.wallThicknessMeters;
  const { origin, extent } = floorBounds(floor);

  // The projection arrives already fitted — and possibly panned and zoomed
  // since. Everything below works in whatever transform it is handed.
  if (projection.pixelsPerMeter <= 0) {
    return;
  }

  const frame: PlanFrame = {
    toPixels: (point) =>
      projectPoint(projection, {
        xMeters: point.xMeters - origin.xMeters + thickness,
        zMeters: point.zMeters - origin.zMeters + thickness,
      }),
    wallPixels: projectLength(projection, thickness),
    color,
  };

  // Every room's walls first, as solid rings, then every floor punched out of
  // them. Doing it room by room would leave one room's wall drawn over the
  // next room's floor wherever two of them share one.
  for (const room of floor.rooms) {
    drawRoomWalls(context, frame, room);
  }
  for (const room of floor.rooms) {
    punchRoomFloor(context, frame, room);
  }
  for (const room of floor.rooms) {
    drawMeterGrid(context, inRoom(frame, room), room);
  }

  // Openings are cut from the finished wall band, which is the order a plan is
  // read in — and the only order that opens a doorway through a shared wall.
  for (const { room, opening } of drawableOpenings(floor)) {
    cutOpening(context, inRoom(frame, room), room, opening);
  }
  for (const { room, opening } of drawableOpenings(floor)) {
    drawOpeningSymbol(context, inRoom(frame, room), room, opening);
  }

  for (const room of floor.rooms) {
    drawRoomName(context, frame, room, fontFamily);
    if (room.id === selectedRoomId) {
      markSelectedRoom(context, frame, room);
    }
  }

  // Under the furniture, because a route is floor rather than a thing standing
  // on it, and over the grid, because it is the more important measurement.
  for (const walkway of floor.walkways) {
    if (checkWalkway(walkway) === null) {
      drawWalkway(context, frame, walkway);
    }
  }

  for (const placed of furniture) {
    drawFurniture(context, frame, placed, {
      selected: placed.instance.id === selectedId,
      troubled: troubledIds.has(placed.instance.id),
    });
  }

  drawDimensions(context, {
    widthMeters: extent.widthMeters,
    depthMeters: extent.depthMeters,
    unit,
    color,
    fontFamily,
    inside: frame.toPixels(origin),
    floorWidth: projectLength(projection, extent.widthMeters),
    floorDepth: projectLength(projection, extent.depthMeters),
    wallPixels: frame.wallPixels,
  });
}

/** A frame that takes points in one room's own coordinates. */
function inRoom(frame: PlanFrame, room: Room): PlanFrame {
  return {
    ...frame,
    toPixels: (point) => frame.toPixels(pointOnFloor(room, point)),
  };
}

/** Openings that are actually on their wall. The rest are reported, not drawn. */
function drawableOpenings(
  floor: Floor,
): readonly { room: Room; opening: Opening }[] {
  return floor.rooms.flatMap((room) =>
    room.openings
      .filter((opening) => checkOpening(room, opening) === null)
      .map((opening) => ({ room, opening })),
  );
}

/** One room's walls, as a solid ring around the space it measures. */
function drawRoomWalls(
  context: CanvasRenderingContext2D,
  frame: PlanFrame,
  room: Room,
): void {
  const inside = frame.toPixels(room.origin);
  const width = spanPixels(frame, room.widthMeters);
  const depth = spanPixels(frame, room.depthMeters);

  context.save();
  context.globalAlpha = WALL_ALPHA;
  context.fillStyle = frame.color;
  context.fillRect(
    inside.x - frame.wallPixels,
    inside.y - frame.wallPixels,
    width + frame.wallPixels * 2,
    depth + frame.wallPixels * 2,
  );
  context.restore();
}

/** The room's own floor, cleared out of the wall band and tinted. */
function punchRoomFloor(
  context: CanvasRenderingContext2D,
  frame: PlanFrame,
  room: Room,
): void {
  const inside = frame.toPixels(room.origin);
  const width = spanPixels(frame, room.widthMeters);
  const depth = spanPixels(frame, room.depthMeters);

  context.clearRect(inside.x, inside.y, width, depth);
  context.save();
  context.globalAlpha = FLOOR_ALPHA;
  context.fillStyle = frame.color;
  context.fillRect(inside.x, inside.y, width, depth);
  context.restore();
}

/**
 * The room's name, in the middle of it.
 *
 * An apartment of unlabelled rectangles is a puzzle. This is the one piece of
 * text inside the plan, and it is what makes it a floor plan rather than a
 * diagram.
 */
function drawRoomName(
  context: CanvasRenderingContext2D,
  frame: PlanFrame,
  room: Room,
  fontFamily: string,
): void {
  if (room.name === "") {
    return;
  }

  const center = frame.toPixels({
    xMeters: room.origin.xMeters + room.widthMeters / 2,
    zMeters: room.origin.zMeters + room.depthMeters / 2,
  });

  context.save();
  context.globalAlpha = ROOM_NAME_ALPHA;
  context.fillStyle = frame.color;
  context.font = `${LABEL_PIXELS}px ${fontFamily}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(room.name, center.x, center.y);
  context.restore();
}

/** The selected room, outlined inside its own walls. */
function markSelectedRoom(
  context: CanvasRenderingContext2D,
  frame: PlanFrame,
  room: Room,
): void {
  const inside = frame.toPixels(room.origin);
  const width = spanPixels(frame, room.widthMeters);
  const depth = spanPixels(frame, room.depthMeters);

  context.save();
  context.globalAlpha = SELECTED_FILL_ALPHA;
  context.fillStyle = frame.color;
  context.fillRect(inside.x, inside.y, width, depth);
  context.globalAlpha = 1;
  context.strokeStyle = frame.color;
  context.lineWidth = 2;
  context.setLineDash([6, 4]);
  context.strokeRect(inside.x, inside.y, width, depth);
  context.restore();
}

/** A length in meters, in pixels, read off the frame itself. */
function spanPixels(frame: PlanFrame, meters: number): number {
  const from = frame.toPixels({ xMeters: 0, zMeters: 0 });
  const to = frame.toPixels({ xMeters: meters, zMeters: meters });
  return to.x - from.x;
}

/**
 * A placed piece, at its true footprint.
 *
 * Drawn as the rectangle the product actually occupies, rotated about its own
 * center — which is where the instance's position is. A prettier shape later
 * still has to sit inside exactly this rectangle, because this is what the
 * validation measures.
 *
 * The selected piece is drawn heavier, with a handle at each corner. Corners
 * are what show a rotation: a turned rectangle is otherwise just a rectangle.
 *
 * A piece the validation objects to is outlined in red. That is a pointer to
 * the list beside the plan, never the report itself — a color cannot say which
 * two pieces overlap or by how much.
 */
function drawFurniture(
  context: CanvasRenderingContext2D,
  frame: PlanFrame,
  { instance, product }: PlacedFurniture,
  { selected, troubled }: { selected: boolean; troubled: boolean },
): void {
  const center = frame.toPixels(instance.position);
  const origin = frame.toPixels({ xMeters: 0, zMeters: 0 });
  const widthPixels =
    frame.toPixels({ xMeters: product.footprint.widthMeters, zMeters: 0 }).x -
    origin.x;
  const depthPixels =
    frame.toPixels({ xMeters: 0, zMeters: product.footprint.depthMeters }).y -
    origin.y;

  const left = -widthPixels / 2;
  const top = -depthPixels / 2;

  context.save();
  context.translate(center.x, center.y);
  // Positive rotation turns +X toward +Z, and screen Y follows Z, so the
  // canvas's own rotation is already the right way round.
  context.rotate(instance.rotationRadians);

  const edge = troubled ? PROBLEM_COLOR : frame.color;

  context.globalAlpha = selected ? SELECTED_FILL_ALPHA : FURNITURE_FILL_ALPHA;
  context.fillStyle = edge;
  context.fillRect(left, top, widthPixels, depthPixels);

  context.globalAlpha = troubled ? 1 : FURNITURE_EDGE_ALPHA;
  context.strokeStyle = edge;
  context.lineWidth = selected ? 2.5 : 1.5;
  context.strokeRect(left, top, widthPixels, depthPixels);

  if (selected) {
    for (const [x, y] of [
      [left, top],
      [left + widthPixels, top],
      [left + widthPixels, top + depthPixels],
      [left, top + depthPixels],
    ] as const) {
      context.fillRect(
        x - HANDLE_PIXELS / 2,
        y - HANDLE_PIXELS / 2,
        HANDLE_PIXELS,
        HANDLE_PIXELS,
      );
    }
  }

  context.restore();
}

/**
 * A protected route, as the strip of floor it needs.
 *
 * The preferred width is filled and the minimum is drawn as a line inside it,
 * so the band shows both numbers at once: the edge you want to keep, and the
 * edge you cannot cross.
 */
function drawWalkway(
  context: CanvasRenderingContext2D,
  frame: PlanFrame,
  walkway: Walkway,
): void {
  const start = frame.toPixels(walkway.start);
  const end = frame.toPixels(walkway.end);
  const lengthPixels = Math.hypot(end.x - start.x, end.y - start.y);
  if (lengthPixels <= 0) {
    return;
  }

  // The projection maps floor X to canvas X and floor Z to canvas Y at one
  // positive scale, so the route's angle on screen is the angle on the floor.
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const perMeter = lengthPixels / walkwayLength(walkway);
  const preferred = walkway.preferredWidthMeters * perMeter;
  const minimum = walkway.minimumWidthMeters * perMeter;

  context.save();
  context.translate((start.x + end.x) / 2, (start.y + end.y) / 2);
  context.rotate(angle);

  context.fillStyle = frame.color;
  context.strokeStyle = frame.color;

  context.globalAlpha = WALKWAY_FILL_ALPHA;
  context.fillRect(-lengthPixels / 2, -preferred / 2, lengthPixels, preferred);

  context.globalAlpha = WALKWAY_EDGE_ALPHA;
  context.lineWidth = 1;
  context.setLineDash([5, 4]);
  context.strokeRect(-lengthPixels / 2, -minimum / 2, lengthPixels, minimum);

  context.restore();
}

function walkwayLength(walkway: Walkway): number {
  return Math.hypot(
    walkway.end.xMeters - walkway.start.xMeters,
    walkway.end.zMeters - walkway.start.zMeters,
  );
}

/** A one-meter grid, so the drawing reads as a measurement and not a sketch. */
function drawMeterGrid(
  context: CanvasRenderingContext2D,
  frame: PlanFrame,
  room: Room,
): void {
  context.save();
  context.globalAlpha = GRID_ALPHA;
  context.strokeStyle = frame.color;
  context.lineWidth = 1;
  context.beginPath();

  for (let xMeters = 1; xMeters < room.widthMeters; xMeters += 1) {
    const top = frame.toPixels({ xMeters, zMeters: 0 });
    const bottom = frame.toPixels({ xMeters, zMeters: room.depthMeters });
    // Half-pixel offset keeps a one-pixel line on one pixel rather than two.
    context.moveTo(Math.round(top.x) + 0.5, top.y);
    context.lineTo(Math.round(bottom.x) + 0.5, bottom.y);
  }

  for (let zMeters = 1; zMeters < room.depthMeters; zMeters += 1) {
    const left = frame.toPixels({ xMeters: 0, zMeters });
    const right = frame.toPixels({ xMeters: room.widthMeters, zMeters });
    context.moveTo(left.x, Math.round(left.y) + 0.5);
    context.lineTo(right.x, Math.round(right.y) + 0.5);
  }

  context.stroke();
  context.restore();
}

/** Removes the wall across an opening, leaving a clean hole through it. */
function cutOpening(
  context: CanvasRenderingContext2D,
  frame: PlanFrame,
  room: Room,
  opening: Opening,
): void {
  const { start, end } = openingEndpoints(room, opening);
  const normal = wallOutwardNormal(opening.wall);
  const a = frame.toPixels(start);
  const b = frame.toPixels(end);
  const outX = normal.dx * frame.wallPixels;
  const outY = normal.dz * frame.wallPixels;

  const xs = [a.x, b.x, a.x + outX, b.x + outX];
  const ys = [a.y, b.y, a.y + outY, b.y + outY];
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);

  // Bleed half a pixel through the wall only. Widening across the opening
  // instead would make it measure wider than it is.
  const bleedX = normal.dx === 0 ? 0 : 0.5;
  const bleedY = normal.dz === 0 ? 0 : 0.5;

  context.clearRect(
    minX - bleedX,
    minY - bleedY,
    Math.max(...xs) - minX + bleedX * 2,
    Math.max(...ys) - minY + bleedY * 2,
  );
}

function drawOpeningSymbol(
  context: CanvasRenderingContext2D,
  frame: PlanFrame,
  room: Room,
  opening: Opening,
): void {
  const { start, end } = openingEndpoints(room, opening);
  const normal = wallOutwardNormal(opening.wall);
  const a = frame.toPixels(start);
  const b = frame.toPixels(end);
  const through = (point: PixelPoint, fraction: number): PixelPoint => ({
    x: point.x + normal.dx * frame.wallPixels * fraction,
    y: point.y + normal.dz * frame.wallPixels * fraction,
  });

  context.save();
  context.strokeStyle = frame.color;
  context.lineCap = "butt";

  // Jambs, drawn on every kind: they close the wall where it was cut.
  context.globalAlpha = JAMB_ALPHA;
  context.lineWidth = 1;
  strokeSegments(context, [
    [a, through(a, 1)],
    [b, through(b, 1)],
  ]);

  if (opening.kind === "window") {
    // Glass, down the middle of the wall band.
    context.globalAlpha = SYMBOL_ALPHA;
    context.lineWidth = 1.5;
    strokeSegments(context, [[through(a, 0.5), through(b, 0.5)]]);
  }

  if (opening.kind === "door") {
    drawDoorSwing(context, opening, a, b, normal);
  }

  context.restore();
}

/** The leaf drawn open at a right angle, with the arc it sweeps. */
function drawDoorSwing(
  context: CanvasRenderingContext2D,
  opening: Extract<Opening, { kind: "door" }>,
  a: PixelPoint,
  b: PixelPoint,
  normal: FloorVector,
): void {
  const hinge = opening.hinge === "start" ? a : b;
  const farJamb = opening.hinge === "start" ? b : a;
  const widthPixels = Math.hypot(farJamb.x - hinge.x, farJamb.y - hinge.y);
  if (widthPixels <= 0) {
    return;
  }

  // The projection maps floor X to canvas X and floor Z to canvas Y at the same
  // positive scale, so the wall's outward normal is already a canvas direction.
  // It points out of the room, so an inward swing is the other way.
  const reach = opening.swing === "inward" ? -widthPixels : widthPixels;
  const tip = {
    x: hinge.x + normal.dx * reach,
    y: hinge.y + normal.dz * reach,
  };

  context.globalAlpha = SYMBOL_ALPHA;
  context.lineWidth = 2;
  strokeSegments(context, [[hinge, tip]]);

  // Sweep from the open leaf round to the closed position at the far jamb. The
  // cross product says which way that quarter turn goes on screen, where Y
  // points down and so angles run clockwise.
  const cross =
    (tip.x - hinge.x) * (farJamb.y - hinge.y) -
    (tip.y - hinge.y) * (farJamb.x - hinge.x);

  context.globalAlpha = SWING_ALPHA;
  context.lineWidth = 1;
  context.beginPath();
  context.arc(
    hinge.x,
    hinge.y,
    widthPixels,
    Math.atan2(tip.y - hinge.y, tip.x - hinge.x),
    Math.atan2(farJamb.y - hinge.y, farJamb.x - hinge.x),
    cross < 0,
  );
  context.stroke();
}

function strokeSegments(
  context: CanvasRenderingContext2D,
  segments: readonly (readonly [PixelPoint, PixelPoint])[],
): void {
  context.beginPath();
  for (const [from, to] of segments) {
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
  }
  context.stroke();
}

type DimensionOptions = {
  widthMeters: number;
  depthMeters: number;
  unit: DisplayUnit;
  color: string;
  fontFamily: string;
  inside: PixelPoint;
  floorWidth: number;
  floorDepth: number;
  wallPixels: number;
};

/**
 * Dimension lines outside the walls, measuring the apartment end to end.
 *
 * One pair for the whole plan rather than a pair per room: a room's own numbers
 * are in the fields beside it, and five sets of dimension lines would bury the
 * drawing they are meant to explain.
 */
function drawDimensions(
  context: CanvasRenderingContext2D,
  {
    widthMeters,
    depthMeters,
    unit,
    color,
    fontFamily,
    inside,
    floorWidth,
    floorDepth,
    wallPixels,
  }: DimensionOptions,
): void {
  context.save();
  context.font = `${LABEL_PIXELS}px ${fontFamily}`;
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 1;
  context.textAlign = "center";
  context.textBaseline = "middle";

  const outerTop = inside.y - wallPixels;
  const outerLeft = inside.x - wallPixels;

  // Width, above the room.
  const widthY = outerTop - DIMENSION_OFFSET_PIXELS;
  const widthLabel = formatLength(widthMeters, unit);
  const widthGap = context.measureText(widthLabel).width / 2 + LABEL_GAP_PIXELS;
  const midX = inside.x + floorWidth / 2;

  context.globalAlpha = DIMENSION_ALPHA;
  strokeSegments(context, [
    [
      { x: inside.x, y: widthY },
      { x: Math.max(inside.x, midX - widthGap), y: widthY },
    ],
    [
      { x: Math.min(inside.x + floorWidth, midX + widthGap), y: widthY },
      { x: inside.x + floorWidth, y: widthY },
    ],
    ...tickAt({ x: inside.x, y: widthY }),
    ...tickAt({ x: inside.x + floorWidth, y: widthY }),
    ...witness({ x: inside.x, y: widthY }, { x: inside.x, y: outerTop }, "y"),
    ...witness(
      { x: inside.x + floorWidth, y: widthY },
      { x: inside.x + floorWidth, y: outerTop },
      "y",
    ),
  ]);

  context.globalAlpha = LABEL_ALPHA;
  context.fillText(widthLabel, midX, widthY);

  // Depth, up the left side, reading along the wall it measures.
  const depthX = outerLeft - DIMENSION_OFFSET_PIXELS;
  const depthLabel = formatLength(depthMeters, unit);
  const depthGap = context.measureText(depthLabel).width / 2 + LABEL_GAP_PIXELS;
  const midY = inside.y + floorDepth / 2;

  context.globalAlpha = DIMENSION_ALPHA;
  strokeSegments(context, [
    [
      { x: depthX, y: inside.y },
      { x: depthX, y: Math.max(inside.y, midY - depthGap) },
    ],
    [
      { x: depthX, y: Math.min(inside.y + floorDepth, midY + depthGap) },
      { x: depthX, y: inside.y + floorDepth },
    ],
    ...tickAt({ x: depthX, y: inside.y }),
    ...tickAt({ x: depthX, y: inside.y + floorDepth }),
    ...witness({ x: depthX, y: inside.y }, { x: outerLeft, y: inside.y }, "x"),
    ...witness(
      { x: depthX, y: inside.y + floorDepth },
      { x: outerLeft, y: inside.y + floorDepth },
      "x",
    ),
  ]);

  context.globalAlpha = LABEL_ALPHA;
  context.translate(depthX, midY);
  context.rotate(-Math.PI / 2);
  context.fillText(depthLabel, 0, 0);

  context.restore();
}

/** The slash an architect puts where a dimension line meets its extent. */
function tickAt(
  at: PixelPoint,
): readonly (readonly [PixelPoint, PixelPoint])[] {
  return [
    [
      { x: at.x - TICK_PIXELS, y: at.y - TICK_PIXELS },
      { x: at.x + TICK_PIXELS, y: at.y + TICK_PIXELS },
    ],
  ];
}

/** The thin line joining a dimension line back to the wall it measures. */
function witness(
  from: PixelPoint,
  to: PixelPoint,
  axis: "x" | "y",
): readonly (readonly [PixelPoint, PixelPoint])[] {
  const gap = Math.sign(to[axis] - from[axis]) * WITNESS_GAP_PIXELS;
  return [
    [
      axis === "y"
        ? { x: from.x, y: from.y + gap }
        : { x: from.x + gap, y: from.y },
      to,
    ],
  ];
}

/** Tracks an element's CSS pixel size, so the canvas can match it. */
function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<PixelSize>({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }

    const measure = () => {
      const rect = element.getBoundingClientRect();
      setSize((previous) =>
        previous.width === rect.width && previous.height === rect.height
          ? previous
          : { width: rect.width, height: rect.height },
      );
    };

    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}
