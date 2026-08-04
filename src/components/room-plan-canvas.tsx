"use client";

import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from "react";
import {
  MAX_ZOOM,
  MAX_ZOOM_STEP,
  MIN_ZOOM,
  clampToViewport,
  createPlanProjection,
  panBy,
  projectLength,
  projectPoint,
  unprojectPoint,
  zoomAt,
  type FloorExtent,
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
import { roomGridLines } from "@/components/room-grid";
import { pressIs } from "@/components/shortcuts";
import type { Gesture } from "@/state/project-store";
import { PRODUCT_DRAG_TYPE } from "@/components/catalogue-panel";
import {
  WALL_SIDES,
  checkOpening,
  drawnRoom,
  floorAreaSquareMeters,
  floorBounds,
  maxWallThicknessMeters,
  cutFromHandlePoint,
  metersAlongOpeningWall,
  moveOpening,
  partWallFrame,
  partWallSides,
  openingAtPoint,
  openingEndpoints,
  openingWallThicknessMeters,
  pointAlongWall,
  pointInRoom,
  pointOnFloor,
  pointOnRoomPart,
  primaryRoomPart,
  resizeOpeningJamb,
  resizeRoomPartEdgeToPoint,
  roomPart,
  roomPartContains,
  roomPartCutHandles,
  roomPartIsCut,
  roomPartLocalPolygon,
  roomPartPivotRect,
  roomsAt,
  roomBounds,
  snapRoomOrigin,
  snapRoomPartOrigin,
  snapRoomPartResize,
  snapRoomResize,
  wallPlacementAt,
  wallOutwardNormalOnFloor,
  wallStretches,
  withOrigin,
  withRoomPartCut,
  withRoomPartOrigin,
  withRoomPartRotation,
  type Floor,
  type FloorVector,
  type Opening,
  type OpeningJamb,
  type OpeningKind,
  type Room,
  type PartCorner,
  type RoomEdge,
  type RoomPart,
  type WallFrame,
  type WallSide,
  type WallStretch,
} from "@/domain/room";
import {
  degreesFromRadians,
  formatAngle,
  formatArea,
  formatLength,
  normalizeRadians,
  radiansFromDegrees,
  roundToDisplayUnit,
  type DisplayUnit,
} from "@/domain/units";
import {
  resizedUnderlay,
  underlayCorners,
  underlayExtentMeters,
  type PlanUnderlay,
  type UnderlayCorner,
} from "@/domain/project";

/**
 * Space kept around the apartment when it is fitted, so its walls are not
 * against the edge of the panel.
 */
const PLAN_PADDING_PIXELS = 40;
const LABEL_PIXELS = 12;

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
const FURNITURE_FILL_ALPHA = 0.22;
const FURNITURE_EDGE_ALPHA = 0.7;
const SELECTED_FILL_ALPHA = 0.36;
const HANDLE_PIXELS = 6;

/**
 * How near a handle counts as holding it. Larger than the handle is drawn,
 * because a six pixel square is a hard thing to hit and an easy thing to miss
 * by one pixel.
 */
const HANDLE_GRAB_PIXELS = 9;

/**
 * What the pointer says it will do here.
 *
 * Written out in full because Tailwind reads class names as text: a name built
 * out of pieces at runtime is a name it never sees and never generates.
 */
const CURSORS = {
  none: "cursor-default",
  pan: "cursor-grab",
  panning: "cursor-grabbing",
  move: "cursor-move",
  rotate: "cursor-crosshair",
  "resize-x": "cursor-ew-resize",
  "resize-y": "cursor-ns-resize",
  "resize-nwse": "cursor-nwse-resize",
  "resize-nesw": "cursor-nesw-resize",
} as const;

type Cursor = keyof typeof CURSORS;

/** Which way a handle stretches the room, so the pointer can say so. */
function cursorForEdges(edges: readonly RoomEdge[]): Cursor {
  if (edges.length === 1) {
    return edges[0] === "west" || edges[0] === "east" ? "resize-x" : "resize-y";
  }
  // A corner: north-west and south-east lie on one diagonal, the others on
  // the opposite one.
  const northWest = edges.includes("north") === edges.includes("west");
  return northWest ? "resize-nwse" : "resize-nesw";
}

/** A jamb moves along its wall — a chamfer's runs on one of the diagonals. */
function cursorForWall(wall: WallSide): Cursor {
  switch (wall) {
    case "north":
    case "south":
      return "resize-x";
    case "east":
    case "west":
      return "resize-y";
    case "north-west":
    case "south-east":
      return "resize-nesw";
    case "north-east":
    case "south-west":
      return "resize-nwse";
  }
}

/**
 * The one color in the drawing that is not the foreground. A problem has to be
 * findable at a glance, and it reads on both the light and the dark theme —
 * the same red the forms use for a field that will not do.
 */
const PROBLEM_COLOR = "#dc2626";

/**
 * How far a pointer must travel before a drag counts as drawing a room.
 *
 * Below it the press was a click, and a click means "a room here, the usual
 * size". Measured in pixels because the question is whether a hand moved; at
 * a low zoom a firm drag covers only a few centimeters of floor.
 */
const DRAW_THRESHOLD_PIXELS = 6;

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
  /**
   * A changed piece, and what is doing the changing.
   *
   * The gesture is what makes one drag one press of ⌘Z. A drag calls this a
   * couple of hundred times and every call carries the same string, so the
   * history collapses them; `onGestureEnd` is what closes it when the pointer
   * comes up. See `src/state/history.ts`.
   */
  onInstanceChange: (instance: FurnitureInstance, gesture?: Gesture) => void;
  /** Which room is being worked on, so the plan can mark and move it. */
  selectedRoomId?: string | null;
  /** A selected rectangle inside the room; null means the whole room module. */
  selectedRoomPartId?: string | null;
  onSelectRoom?: (roomId: string) => void;
  onSelectRoomPart?: (roomId: string, partId: string) => void;
  onRoomChange?: (room: Room, gesture?: Gesture) => void;
  /** Which wall opening is being worked on. */
  selectedOpeningId?: string | null;
  onSelectOpening?: (roomId: string, openingId: string) => void;
  /** The drag or the held key is over. The next one is a new step back. */
  onGestureEnd?: () => void;
  /** A product dragged in from the catalogue, dropped where it was let go. */
  onDropProduct?: (productId: string, at: FloorPoint) => void;
  /**
   * Whether a drag on the plan draws a new room instead of panning it.
   *
   * A mode rather than a modifier, and rather than taking over the plain drag
   * that already pans: a plan you cannot push around while laying rooms out
   * would be worse than one that needs a button pressed first. It lasts one
   * room, so the drag straight afterwards adjusts that room rather than
   * starting another.
   */
  drawing?: boolean;
  /**
   * A room drawn on the plan: two opposite corners, or one corner and null
   * where it was a click rather than a drag. A click means "a room here, the
   * usual size" — the canvas knows pixels and so can tell the two apart, but
   * it has no business knowing how big a room usually is.
   */
  onDrawRoom?: (from: FloorPoint, to: FloorPoint | null) => void;
  /**
   * The mode is over: a room was drawn, or Escape called it off.
   *
   * One room per press. The next thing anybody does after drawing a room is
   * drag it into place, and a mode that stayed armed would answer that by
   * drawing another room on top of it.
   */
  onDrawEnd?: () => void;
  /** A one-shot request to put this kind of opening on this room's next wall. */
  placingOpening?: {
    readonly roomId: string;
    readonly kind: OpeningKind;
  } | null;
  onPlaceOpening?: (
    roomId: string,
    kind: OpeningKind,
    partId: string,
    wall: WallSide,
    centerMeters: number,
  ) => void;
  onPlaceOpeningEnd?: () => void;
  /** The listing's plan, drawn dimmed beneath everything and traced over. */
  underlay?: PlanUnderlay | null;
  onUnderlayChange?: (underlay: PlanUnderlay) => void;
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
      readonly kind: "part";
      readonly pointerId: number;
      readonly roomId: string;
      readonly partId: string;
      readonly grabOffset: FloorPoint;
    }
  | {
      readonly kind: "resize";
      readonly pointerId: number;
      readonly roomId: string;
      /** Null means the one-part room itself; otherwise resize this part. */
      readonly partId: string | null;
      /** One or two walls: an edge moves one, a corner moves both. */
      readonly edges: readonly RoomEdge[];
    }
  | {
      /** Both legs of a clipped corner at once, following the chamfer. */
      readonly kind: "part-cut";
      readonly pointerId: number;
      readonly roomId: string;
      readonly partId: string;
      readonly corner: PartCorner;
    }
  | {
      readonly kind: "part-rotate";
      readonly pointerId: number;
      readonly roomId: string;
      readonly partId: string;
      /** The pointer's bearing from the pivot when the handle was grabbed. */
      readonly grabAngleRadians: number;
      readonly startRotationRadians: number;
    }
  | {
      readonly kind: "opening-move";
      readonly pointerId: number;
      readonly roomId: string;
      readonly openingId: string;
      /** Where inside the opening it was grabbed, along its wall. */
      readonly grabOffsetMeters: number;
    }
  | {
      readonly kind: "opening-resize";
      readonly pointerId: number;
      readonly roomId: string;
      readonly openingId: string;
      readonly jamb: OpeningJamb;
    }
  | {
      readonly kind: "pan";
      readonly pointerId: number;
      readonly from: PixelPoint;
    }
  | {
      /** A new room being dragged out. Both corners are in floor meters. */
      readonly kind: "draw";
      readonly pointerId: number;
      readonly from: FloorPoint;
      readonly fromPixel: PixelPoint;
    }
  | {
      /** One corner of the underlay, sizing the image against the drawing. */
      readonly kind: "underlay-resize";
      readonly pointerId: number;
      readonly corner: UnderlayCorner;
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
  selectedRoomPartId = null,
  onSelectRoom,
  onSelectRoomPart,
  onRoomChange,
  selectedOpeningId = null,
  onSelectOpening,
  onGestureEnd,
  drawing = false,
  onDrawRoom,
  onDrawEnd,
  placingOpening = null,
  onPlaceOpening,
  onPlaceOpeningEnd,
  underlay = null,
  onUnderlayChange,
}: RoomPlanCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const { ref: frameRef, size } = useElementSize<HTMLDivElement>();

  // Null until the view is moved, so the plan re-fits itself as the apartment
  // grows or the panel resizes. Once it has been panned or zoomed, it stays
  // where it was put — a view that jumps back is a view you cannot work in.
  const [view, setView] = useState<PlanProjection | null>(null);
  const fitted = planProjectionFor(floor, underlay, size);
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

  /**
   * Whether the plan is taking pointer input for the view.
   *
   * Focus is the toggle: click into the plan and it pans and zooms; click away
   * and a stray trackpad swipe cannot send the drawing off somewhere. It also
   * costs nothing to explain — the focus ring already says which it is.
   */
  /**
   * The coordinates in the readout: the selected room's north-west corner, an
   * opening's center on the floor, or the selected piece's centre.
   *
   * Not the pointer. A number that changes as the mouse drifts is one nobody
   * can read off, and the corner is the same number the panel on the right
   * holds — so the readout and the field agree rather than nearly agreeing.
   */
  const selectedOpening = findOpening(floor, selectedOpeningId);
  const selectedRoom = floor.rooms.find((room) => room.id === selectedRoomId);
  const selectedPart = selectedRoom?.parts.find(
    (part) => part.id === selectedRoomPartId,
  );
  const at =
    selectedPart?.origin ??
    (selectedRoom === undefined ? null : roomBounds(selectedRoom).origin) ??
    (selectedOpening === null
      ? null
      : pointOnFloor(
          selectedOpening.room,
          pointAlongWall(
            selectedOpening.room,
            selectedOpening.opening.wall,
            selectedOpening.opening.centerMeters,
            selectedOpening.opening.partId,
          ),
        )) ??
    furniture.find(({ instance }) => instance.id === selectedId)?.instance
      .position ??
    null;

  /** What the pointer is over, kept in state because it is only a cursor. */
  const [cursor, setCursor] = useState<Cursor>("none");

  /**
   * The far corner of a room being drawn, or null when none is.
   *
   * State rather than a ref, unlike the drag itself: this one has to repaint
   * on every move, because the rectangle following the pointer *is* the
   * feedback. There is nothing else on screen saying how big the room will be.
   */
  const [drawnTo, setDrawnTo] = useState<FloorPoint | null>(null);

  /**
   * The underlay whose corners can be taken hold of, or null.
   *
   * Only while nothing is selected and no tool is armed — which is exactly
   * when the panel carrying the image's own fields is the one on screen. The
   * moment a room is selected to trace, the handles are out of the way of the
   * drawing they are there to serve.
   */
  const resizableUnderlay =
    underlay !== null &&
    underlay.visible &&
    !drawing &&
    placingOpening === null &&
    selectedId === null &&
    selectedRoomId === null &&
    selectedOpeningId === null
      ? underlay
      : null;

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
      selectedId,
      selectedRoomId,
      selectedRoomPartId,
      selectedOpeningId,
      troubledIds,
      viewport: size,
      color: style.color,
      fontFamily: style.fontFamily,
      drawnRect:
        drawnTo === null || dragRef.current?.kind !== "draw"
          ? null
          : { from: dragRef.current.from, to: drawnTo },
      underlayHandles: resizableUnderlay,
    });
  }, [
    floor,
    furniture,
    unit,
    selectedId,
    selectedRoomId,
    selectedRoomPartId,
    selectedOpeningId,
    troubledIds,
    size,
    projection,
    drawnTo,
    resizableUnderlay,
  ]);

  /**
   * A view, moved back if it has pushed the apartment off the screen.
   *
   * Everything that changes the view goes through this. Panning has no natural
   * limit — the origin is a number of pixels — so without it one hard swipe
   * leaves an empty grid and no clue which way to go back. Zoom to fit is one
   * key away, but a tool should not need rescuing.
   */
  function held(next: PlanProjection): PlanProjection {
    return clampToViewport(next, fittedRect(floor, underlay), size);
  }

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
      // A wheel notch is about 100 units and a trackpad pinch arrives in ones,
      // so the rate alone cannot serve both: one notch used to be a third of
      // the way in. Capped per event, a notch is a step you can follow and a
      // pinch is untouched, being far below the cap already.
      const factor = clampZoomStep(Math.exp(-(event.deltaY ?? 0) / 250));
      setView(
        held(
          zoomAt(
            current,
            factor,
            at,
            fitted.pixelsPerMeter * MIN_ZOOM,
            fitted.pixelsPerMeter * MAX_ZOOM,
          ),
        ),
      );
      return;
    }

    setView(held(panBy(current, -(event.deltaX ?? 0), -(event.deltaY ?? 0))));
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
    const point = canvas && floorPointAt(canvas, event, projectionRef.current);
    if (!canvas || !point) {
      return;
    }

    // The view stops fitting itself the moment anything is dragged.
    //
    // While it fits, growing a room grows the apartment, which rescales the
    // plan, which moves the floor point under a pointer that has not itself
    // moved — so the room grows again, and a wall dragged outward runs away
    // from the hand dragging it. Pinning the transform for the drag makes a
    // pixel worth the same distance from the first frame to the last. Zoom to
    // fit is one key away when the apartment has finished changing shape.
    setView(projectionRef.current);

    const box = canvas.getBoundingClientRect();

    // The underlay's own corners, before anything else looks at the press.
    // They are only offered while nothing is selected, which is exactly when
    // the panel showing the image's fields is the one on screen — so they are
    // never in the way of tracing a room over the picture.
    const underlayCorner =
      resizableUnderlay === null
        ? null
        : underlayCornerAt(resizableUnderlay, projectionRef.current, {
            x: event.clientX - box.left,
            y: event.clientY - box.top,
          });
    if (underlayCorner !== null) {
      dragRef.current = {
        kind: "underlay-resize",
        pointerId: event.pointerId,
        corner: underlayCorner,
      };
      setCursor("move");
      canvas.focus();
      canvas.setPointerCapture?.(event.pointerId);
      return;
    }

    // Opening placement is one wall click. It is scoped to the room whose
    // inspector armed it, so a shared wall is not ambiguously stored twice.
    if (placingOpening !== null) {
      const room = floor.rooms.find((one) => one.id === placingOpening.roomId);
      const placement =
        room === undefined
          ? null
          : wallPlacementAt(
              room,
              pointInRoom(room, point),
              pointerReachMeters(floor, projectionRef.current),
            );
      if (room !== undefined && placement !== null) {
        onPlaceOpening?.(
          room.id,
          placingOpening.kind,
          placement.partId,
          placement.wall,
          roundToDisplayUnit(placement.alongMeters, unit),
        );
        onPlaceOpeningEnd?.();
      }
      canvas.focus();
      return;
    }

    // Drawing takes the drag before anything else looks at it. In this mode
    // the pointer is for making a room, not for finding one.
    if (drawing) {
      dragRef.current = {
        kind: "draw",
        pointerId: event.pointerId,
        from: point,
        fromPixel: { x: event.clientX - box.left, y: event.clientY - box.top },
      };
      canvas.focus();
      canvas.setPointerCapture?.(event.pointerId);
      return;
    }

    const openingHandle = openingHandleAt(
      floor,
      selectedOpeningId,
      projectionRef.current,
      {
        x: event.clientX - box.left,
        y: event.clientY - box.top,
      },
    );
    if (openingHandle !== null && !panningRef.current) {
      dragRef.current = {
        kind: "opening-resize",
        pointerId: event.pointerId,
        roomId: openingHandle.roomId,
        openingId: openingHandle.openingId,
        jamb: openingHandle.jamb,
      };
      setCursor(cursorForWall(openingHandle.wall));
      canvas.focus();
      canvas.setPointerCapture?.(event.pointerId);
      return;
    }

    const openingHit = openingAt(
      floor,
      point,
      pointerReachMeters(floor, projectionRef.current),
    );
    if (openingHit !== null && !panningRef.current) {
      const local = pointInRoom(openingHit.room, point);
      onSelectOpening?.(openingHit.room.id, openingHit.opening.id);
      dragRef.current = {
        kind: "opening-move",
        pointerId: event.pointerId,
        roomId: openingHit.room.id,
        openingId: openingHit.opening.id,
        grabOffsetMeters:
          metersAlongOpeningWall(openingHit.room, openingHit.opening, local) -
          openingHit.opening.centerMeters,
      };
      setCursor("move");
      canvas.focus();
      canvas.setPointerCapture?.(event.pointerId);
      return;
    }

    const grabbed = handleAt(
      floor,
      selectedRoomId,
      selectedRoomPartId,
      projectionRef.current,
      {
        x: event.clientX - box.left,
        y: event.clientY - box.top,
      },
    );
    if (grabbed !== null && !panningRef.current) {
      if (grabbed.kind === "rotate") {
        const room = floor.rooms.find((one) => one.id === grabbed.roomId);
        const part = room?.parts.find((one) => one.id === grabbed.partId);
        if (room === undefined || part === undefined) {
          return;
        }
        // The drag pivots on the section's center: it spins where it stands.
        const pivot = roomPartPivotRect(part).center;
        dragRef.current = {
          kind: "part-rotate",
          pointerId: event.pointerId,
          roomId: grabbed.roomId,
          partId: grabbed.partId,
          grabAngleRadians: Math.atan2(
            point.zMeters - pivot.zMeters,
            point.xMeters - pivot.xMeters,
          ),
          startRotationRadians: part.rotationRadians,
        };
        setCursor("rotate");
      } else if (grabbed.kind === "cut") {
        dragRef.current = {
          kind: "part-cut",
          pointerId: event.pointerId,
          roomId: grabbed.roomId,
          partId: grabbed.partId,
          corner: grabbed.corner,
        };
        setCursor("move");
      } else {
        dragRef.current = {
          kind: "resize",
          pointerId: event.pointerId,
          roomId: grabbed.roomId,
          partId: grabbed.partId,
          edges: grabbed.edges,
        };
        setCursor(cursorForEdges(grabbed.edges));
      }
      canvas.focus();
      canvas.setPointerCapture?.(event.pointerId);
      return;
    }

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
      setCursor("panning");
      canvas.setPointerCapture?.(event.pointerId);
      return;
    }

    if (hit === null && room !== null) {
      const part =
        room.id === selectedRoomId && selectedRoomPartId !== null
          ? roomPartAt(room, point)
          : null;
      if (part !== null) {
        onSelectRoomPart?.(room.id, part.id);
        dragRef.current = {
          kind: "part",
          pointerId: event.pointerId,
          roomId: room.id,
          partId: part.id,
          grabOffset: {
            xMeters: point.xMeters - part.origin.xMeters,
            zMeters: point.zMeters - part.origin.zMeters,
          },
        };
        setCursor("move");
        canvas.focus();
        canvas.setPointerCapture?.(event.pointerId);
        return;
      }
      onSelectRoom?.(room.id);
      dragRef.current = {
        kind: "room",
        pointerId: event.pointerId,
        roomId: room.id,
        grabOffset: {
          xMeters: point.xMeters - roomBounds(room).origin.xMeters,
          zMeters: point.zMeters - roomBounds(room).origin.zMeters,
        },
      };
      setCursor("move");
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
    setCursor("move");
    // Focus follows the grab, so a piece can be dragged roughly into place and
    // then nudged the last centimeter without reaching for the mouse again.
    canvas.focus();
    canvas.setPointerCapture?.(event.pointerId);
  }

  /** The cursor for whatever is under the pointer, when nothing is being moved. */
  function hoverCursor(
    canvas: HTMLCanvasElement,
    event: PointerEvent<HTMLCanvasElement>,
  ): Cursor {
    if (panningRef.current) {
      return "pan";
    }

    const box = canvas.getBoundingClientRect();
    const openingHandle = openingHandleAt(
      floor,
      selectedOpeningId,
      projectionRef.current,
      {
        x: event.clientX - box.left,
        y: event.clientY - box.top,
      },
    );
    if (openingHandle !== null) {
      return cursorForWall(openingHandle.wall);
    }

    const overUnderlay =
      resizableUnderlay === null
        ? null
        : underlayCornerAt(resizableUnderlay, projectionRef.current, {
            x: event.clientX - box.left,
            y: event.clientY - box.top,
          });
    if (overUnderlay !== null) {
      // The image is never turned, so the diagonal a corner stretches along is
      // the one it looks like it stretches along.
      return overUnderlay === "north-west" || overUnderlay === "south-east"
        ? "resize-nwse"
        : "resize-nesw";
    }

    const grabbed = handleAt(
      floor,
      selectedRoomId,
      selectedRoomPartId,
      projectionRef.current,
      {
        x: event.clientX - box.left,
        y: event.clientY - box.top,
      },
    );
    if (grabbed !== null) {
      switch (grabbed.kind) {
        case "rotate":
          return "rotate";
        // A chamfer's grab moves both of its legs, in whichever direction the
        // hand goes. There is no one axis to promise.
        case "cut":
          return "move";
        case "resize":
          return cursorForEdges(grabbed.edges);
      }
    }

    const point = floorPointAt(canvas, event, projectionRef.current);
    if (point === null) {
      return "none";
    }
    if (furnitureAt(furniture, point) !== null) {
      return "move";
    }
    if (
      openingAt(
        floor,
        point,
        pointerReachMeters(floor, projectionRef.current),
      ) !== null
    ) {
      return "move";
    }
    // Floor with nothing on it is where a drag pans, so it offers a hand.
    return roomsAt(floor, point).length > 0 ? "move" : "pan";
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>): void {
    const drag = dragRef.current;
    const canvas = canvasRef.current;

    if (canvas && drag === null) {
      setCursor(hoverCursor(canvas, event));
    }

    if (!drag || !canvas || drag.pointerId !== event.pointerId) {
      return;
    }

    if (drag.kind === "opening-move" || drag.kind === "opening-resize") {
      const found = findOpening(floor, drag.openingId, drag.roomId);
      const point = floorPointAt(canvas, event, projectionRef.current);
      if (found === null || point === null) {
        return;
      }
      const local = pointInRoom(found.room, point);
      const alongMeters = roundToDisplayUnit(
        metersAlongOpeningWall(found.room, found.opening, local) -
          (drag.kind === "opening-move" ? drag.grabOffsetMeters : 0),
        unit,
      );
      const next =
        drag.kind === "opening-move"
          ? moveOpening(found.room, found.opening, alongMeters)
          : resizeOpeningJamb(
              found.room,
              found.opening,
              drag.jamb,
              alongMeters,
            );
      onRoomChange?.(
        replaceOpening(found.room, next),
        `opening-${drag.kind === "opening-move" ? "move" : "resize"}:${drag.openingId}`,
      );
      return;
    }

    if (drag.kind === "part-cut") {
      const room = floor.rooms.find((one) => one.id === drag.roomId);
      const part = room?.parts.find((one) => one.id === drag.partId);
      const point = floorPointAt(canvas, event, projectionRef.current);
      if (room === undefined || part === undefined || point === null) {
        return;
      }
      onRoomChange?.(
        withRoomPartCut(
          room,
          drag.partId,
          drag.corner,
          // Rounded to the unit on screen, so a dragged chamfer lands on two
          // numbers somebody would have typed.
          cutFromHandlePoint(part, drag.corner, point, (meters) =>
            roundToDisplayUnit(meters, unit),
          ),
        ),
        `room-part-cut:${drag.partId}:${drag.corner}`,
      );
      return;
    }

    if (drag.kind === "part-rotate") {
      const room = floor.rooms.find((one) => one.id === drag.roomId);
      const part = room?.parts.find((one) => one.id === drag.partId);
      const point = floorPointAt(canvas, event, projectionRef.current);
      if (room === undefined || part === undefined || point === null) {
        return;
      }
      const pivot = roomPartPivotRect(part).center;
      const angle = Math.atan2(
        point.zMeters - pivot.zMeters,
        point.xMeters - pivot.xMeters,
      );
      onRoomChange?.(
        withRoomPartRotation(
          room,
          drag.partId,
          draggedRotation(
            drag.startRotationRadians + angle - drag.grabAngleRadians,
          ),
        ),
        `room-part-rotate:${drag.partId}`,
      );
      return;
    }

    if (drag.kind === "resize") {
      const sizing = floor.rooms.find((one) => one.id === drag.roomId);
      const point = floorPointAt(canvas, event, projectionRef.current);
      if (sizing === undefined || point === null) {
        return;
      }
      // A turned part's walls lie on no axis line, so its edges chase the
      // pointer in the part's own frame instead — exactly under the hand,
      // rounded to the unit on screen, with nothing to axis-snap to.
      const turnedPart =
        drag.partId === null
          ? primaryRoomPart(sizing)
          : sizing.parts.find((one) => one.id === drag.partId);
      if (turnedPart !== undefined && turnedPart.rotationRadians !== 0) {
        const next = drag.edges.reduce(
          (room, edge) =>
            resizeRoomPartEdgeToPoint(room, turnedPart.id, edge, point, (m) =>
              roundToDisplayUnit(m, unit),
            ),
          sizing,
        );
        onRoomChange?.(
          next,
          drag.partId === null
            ? `room-resize:${drag.roomId}`
            : `room-part-resize:${drag.partId}`,
        );
        return;
      }
      // Rounded to the unit on screen, so a dragged wall lands on the same
      // kind of number a typed one does.
      const next = drag.edges.reduce(
        (room, edge) =>
          drag.partId === null
            ? snapRoomResize(
                floor,
                room,
                edge,
                roundToDisplayUnit(
                  edge === "west" || edge === "east"
                    ? point.xMeters
                    : point.zMeters,
                  unit,
                ),
              )
            : snapRoomPartResize(
                floor,
                room,
                drag.partId,
                edge,
                roundToDisplayUnit(
                  edge === "west" || edge === "east"
                    ? point.xMeters
                    : point.zMeters,
                  unit,
                ),
              ),
        sizing,
      );
      onRoomChange?.(
        next,
        drag.partId === null
          ? `room-resize:${drag.roomId}`
          : `room-part-resize:${drag.partId}`,
      );
      return;
    }

    if (drag.kind === "part") {
      const room = floor.rooms.find((one) => one.id === drag.roomId);
      const part = room?.parts.find((one) => one.id === drag.partId);
      const point = floorPointAt(canvas, event, projectionRef.current);
      if (room === undefined || part === undefined || point === null) {
        return;
      }
      const origin = snapRoomPartOrigin(floor, room, part, {
        xMeters: roundToDisplayUnit(
          point.xMeters - drag.grabOffset.xMeters,
          unit,
        ),
        zMeters: roundToDisplayUnit(
          point.zMeters - drag.grabOffset.zMeters,
          unit,
        ),
      });
      onRoomChange?.(
        withRoomPartOrigin(room, part.id, origin),
        `room-part-move:${part.id}`,
      );
      return;
    }

    if (drag.kind === "room") {
      const moving = floor.rooms.find((one) => one.id === drag.roomId);
      const point = floorPointAt(canvas, event, projectionRef.current);
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
        `room-move:${drag.roomId}`,
      );
      return;
    }

    if (drag.kind === "draw") {
      setDrawnTo(floorPointAt(canvas, event, projectionRef.current));
      return;
    }

    if (drag.kind === "underlay-resize") {
      const point = floorPointAt(canvas, event, projectionRef.current);
      if (underlay === null || point === null) {
        return;
      }
      onUnderlayChange?.(resizedUnderlay(underlay, drag.corner, point));
      return;
    }

    if (drag.kind === "pan") {
      const box = canvas.getBoundingClientRect();
      const to = { x: event.clientX - box.left, y: event.clientY - box.top };
      setView(
        held(
          panBy(projectionRef.current, to.x - drag.from.x, to.y - drag.from.y),
        ),
      );
      dragRef.current = { ...drag, from: to };
      return;
    }

    const placed = furniture.find(
      ({ instance }) => instance.id === drag.instanceId,
    );
    const point = floorPointAt(canvas, event, projectionRef.current);
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
      `piece-move:${drag.instanceId}`,
    );
  }

  /**
   * A double-click drills into a compound room without changing what a normal
   * room drag means. Hit testing the parts here unconditionally is important:
   * the first part must be selectable from the canvas before any part is
   * already selected in the sidebar.
   */
  function handleDoubleClick(event: MouseEvent<HTMLCanvasElement>): void {
    if (
      event.button !== 0 ||
      drawing ||
      placingOpening !== null ||
      panningRef.current
    ) {
      return;
    }
    const canvas = canvasRef.current;
    const point =
      canvas === null
        ? null
        : floorPointAt(canvas, event, projectionRef.current);
    const room = point === null ? null : (roomsAt(floor, point).at(-1) ?? null);
    const part =
      room === null || point === null ? null : roomPartAt(room, point);
    if (room === null || part === null) {
      return;
    }
    event.preventDefault();
    if (room.parts.length === 1) {
      onSelectRoom?.(room.id);
    } else {
      onSelectRoomPart?.(room.id, part.id);
    }
    canvas?.focus();
  }

  function handleDrop(event: DragEvent<HTMLCanvasElement>): void {
    const canvas = canvasRef.current;
    const productId = event.dataTransfer.getData(PRODUCT_DRAG_TYPE);
    const point = canvas && floorPointAt(canvas, event, projectionRef.current);
    if (!canvas || !point || productId === "") {
      return;
    }
    event.preventDefault();
    onDropProduct?.(productId, clampToFloor(floor, point));
  }

  function handleKeyUp(event: KeyboardEvent<HTMLCanvasElement>): void {
    if (pressIs("pan-space", event)) {
      panningRef.current = false;
      setCursor("none");
      return;
    }
    // A key let go ends the nudge it was making, so holding an arrow is one
    // step back and tapping it three times is three.
    if (pressIs("nudge", event) || pressIs("turn", event)) {
      onGestureEnd?.();
    }
  }

  function endDrag(event: PointerEvent<HTMLCanvasElement>): void {
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId) {
      return;
    }

    if (drag.kind === "draw") {
      const canvas = canvasRef.current;
      const box = canvas?.getBoundingClientRect();
      const to = canvas && floorPointAt(canvas, event, projectionRef.current);
      const travelled =
        box === undefined
          ? 0
          : Math.hypot(
              event.clientX - box.left - drag.fromPixel.x,
              event.clientY - box.top - drag.fromPixel.y,
            );
      // Measured in pixels rather than meters, because the question is whether
      // a hand moved — and at low zoom a firm drag is a few centimeters.
      onDrawRoom?.(drag.from, travelled >= DRAW_THRESHOLD_PIXELS ? to : null);
      dragRef.current = null;
      setDrawnTo(null);
      setCursor("none");
      canvas?.releasePointerCapture?.(event.pointerId);
      // One room, then out of the mode. Staying armed reads like a saving —
      // an apartment is fifteen rooms — but the thing anybody does straight
      // after drawing a room is adjust it, and a plan that answers that by
      // drawing another room on top fights every attempt.
      onDrawEnd?.();
      return;
    }

    dragRef.current = null;
    setCursor("none");
    canvasRef.current?.releasePointerCapture?.(event.pointerId);
    onGestureEnd?.();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLCanvasElement>): void {
    if (pressIs("deselect", event)) {
      if (drawing || placingOpening !== null) {
        // Called off rather than deselecting: in this mode Escape is the way
        // out of the mode, which is the nearer of the two things it could mean.
        dragRef.current = null;
        setDrawnTo(null);
        if (drawing) {
          onDrawEnd?.();
        } else {
          onPlaceOpeningEnd?.();
        }
        return;
      }
      onSelect(null);
      return;
    }

    // Back to the whole apartment, the way every canvas tool spells it.
    if (pressIs("zoom-fit", event)) {
      event.preventDefault();
      setView(null);
      return;
    }

    if (pressIs("pan-space", event)) {
      event.preventDefault();
      panningRef.current = true;
      setCursor("pan");
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
    onInstanceChange(next, `piece-key:${placed.instance.id}`);
  }

  return (
    <div ref={frameRef} className="relative h-full w-full overflow-hidden">
      {/*
        The listing's plan, under the drawing rather than in it. A separate
        element instead of canvas paint, so the floor punches and opening cuts
        — which clear the canvas to transparent — reveal the image instead of
        erasing it. The projection is a uniform scale and shift, which is
        exactly what absolute positioning can express.
      */}
      {underlay === null || !underlay.visible
        ? null
        : (() => {
            const frame = underlayFrame(underlay, projection);
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={underlay.imageDataUrl}
                alt="The floor plan being traced"
                className="pointer-events-none absolute max-w-none opacity-40 dark:opacity-30"
                style={{
                  left: frame.left,
                  top: frame.top,
                  width: frame.width,
                  height: frame.height,
                }}
              />
            );
          })()}
      <canvas
        ref={canvasRef}
        role="img"
        tabIndex={0}
        aria-label={describeFloor(floor, furniture, unit)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={handleDoubleClick}
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
          setCursor("none");
          // A key held as focus leaves never sends its keyup here.
          onGestureEnd?.();
        }}
        className={`block h-full w-full touch-none outline-none ${
          drawing || placingOpening !== null
            ? "cursor-crosshair"
            : CURSORS[cursor]
        }`}
      />

      {/*
        The measurements used to be drawn on the plan, in dimension lines
        outside its walls. They cost the drawing its margins and told you the
        same two numbers however far you zoomed in.

        They are text now, and split by how often they change: what the floor
        adds up to sits in one corner and rarely moves, while the coordinates
        of whatever is selected sit in the opposite one. Putting a number that
        changes next to a number that does not makes both harder to read.
      */}
      {/*
        Both are readings of a floor, so neither exists until there is one.
        "0.0 sq ft" in one corner and "x — y —" in the other are two things to
        read that answer nothing, on the one screen where somebody is deciding
        whether this tool is worth their afternoon.
      */}
      {floor.rooms.length === 0 ? null : (
        <>
          <p className="pointer-events-none absolute left-3 top-3 rounded-lg bg-black/70 px-3 py-1.5 font-mono text-[13px] tabular-nums text-white/90 dark:bg-white/10">
            {formatArea(floorAreaSquareMeters(floor), unit)}
          </p>

          <p className="pointer-events-none absolute right-3 bottom-3 flex gap-3 rounded-lg bg-black/70 px-3 py-1.5 font-mono text-[13px] tabular-nums text-white/90 dark:bg-white/10">
            <span>
              {at === null ? "x —" : `x ${formatLength(at.xMeters, unit)}`}
            </span>
            <span>
              {at === null ? "y —" : `y ${formatLength(at.zMeters, unit)}`}
            </span>
          </p>
        </>
      )}

      {drawing ? (
        <p className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/70 px-4 py-1.5 text-[13px] text-white dark:bg-white/15">
          Drag out a room, or click to drop one. Esc to stop.
        </p>
      ) : null}

      {placingOpening === null ? null : (
        <p className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/70 px-4 py-1.5 text-[13px] text-white dark:bg-white/15">
          Click the wall for the {placingOpening.kind}. Esc to stop.
        </p>
      )}

      {/* Said once, where it is needed, and gone as soon as it is not — and
          never on an empty floor, where the invitation in the middle of the
          canvas is already saying something more useful. */}
      {active ||
      drawing ||
      placingOpening !== null ||
      floor.rooms.length === 0 ? null : (
        <p className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/70 px-4 py-1.5 text-[13px] text-white dark:bg-white/15">
          {selectedRoomPartId !== null
            ? "Drag or resize this section here, or type its X/Y and W/D"
            : selectedRoomId !== null
              ? selectedRoom?.parts.length === 1
                ? "Drag or resize the room here, or type its X/Y and W/D"
                : "Drag the room, or double-click a section to edit it"
              : selectedOpeningId !== null
                ? "Drag the opening or a jamb, or type its measurements"
                : "Click the plan to pan and zoom"}
        </p>
      )}
    </div>
  );
}

/** What a pointer near the selected room can take hold of. */
type GrabbedHandle =
  | {
      readonly kind: "resize";
      readonly roomId: string;
      readonly partId: string | null;
      readonly edges: readonly RoomEdge[];
    }
  | {
      readonly kind: "rotate";
      readonly roomId: string;
      readonly partId: string;
    }
  | {
      readonly kind: "cut";
      readonly roomId: string;
      readonly partId: string;
      readonly corner: PartCorner;
    };

/**
 * The handle under a pointer, if the selected room has one there.
 *
 * Measured in pixels rather than meters, because a handle is a thing on the
 * screen: it stays the same size to grab however far the plan is zoomed out,
 * which is the whole reason it is worth having.
 */
function handleAt(
  floor: Floor,
  selectedRoomId: string | null,
  selectedRoomPartId: string | null,
  projection: PlanProjection,
  at: PixelPoint,
): GrabbedHandle | null {
  const room = floor.rooms.find((one) => one.id === selectedRoomId);
  if (room === undefined) {
    return null;
  }
  const part =
    selectedRoomPartId === null
      ? room.parts.length === 1
        ? primaryRoomPart(room)
        : undefined
      : room.parts.find((one) => one.id === selectedRoomPartId);
  if (part === undefined) {
    return null;
  }

  const rotate = rotateHandlePixel(
    part,
    (point) => projectPoint(projection, point),
    projectLength(projection, maxWallThicknessMeters(floor)),
  );
  if (
    Math.abs(rotate.x - at.x) <= HANDLE_GRAB_PIXELS &&
    Math.abs(rotate.y - at.y) <= HANDLE_GRAB_PIXELS
  ) {
    return { kind: "rotate", roomId: room.id, partId: part.id };
  }

  // Before the resize handles: a chamfer's grab sits near the corner handle it
  // replaced the point of, and the more specific one should win.
  for (const handle of roomPartCutHandles(part)) {
    const point = projectPoint(projection, handle.at);
    if (
      Math.abs(point.x - at.x) <= HANDLE_GRAB_PIXELS &&
      Math.abs(point.y - at.y) <= HANDLE_GRAB_PIXELS
    ) {
      return {
        kind: "cut",
        roomId: room.id,
        partId: part.id,
        corner: handle.corner,
      };
    }
  }

  for (const handle of roomPartHandles(part)) {
    const point = projectPoint(projection, handle.at);
    if (
      Math.abs(point.x - at.x) <= HANDLE_GRAB_PIXELS &&
      Math.abs(point.y - at.y) <= HANDLE_GRAB_PIXELS
    ) {
      return {
        kind: "resize",
        roomId: room.id,
        partId: selectedRoomPartId,
        edges: handle.edges,
      };
    }
  }
  return null;
}

/** The last-authored part under a floor point, matching canvas draw order. */
function roomPartAt(room: Room, point: FloorPoint): RoomPart | null {
  return (
    room.parts.filter((part) => roomPartContains(part, point)).at(-1) ?? null
  );
}

type FoundOpening = { readonly room: Room; readonly opening: Opening };

function findOpening(
  floor: Floor,
  openingId: string | null,
  roomId?: string,
): FoundOpening | null {
  if (openingId === null) {
    return null;
  }
  const rooms =
    roomId === undefined
      ? floor.rooms
      : floor.rooms.filter((room) => room.id === roomId);
  for (const room of rooms) {
    const opening = room.openings.find((one) => one.id === openingId);
    if (opening !== undefined) {
      return { room, opening };
    }
  }
  return null;
}

/** The last-drawn opening under a floor point. */
function openingAt(
  floor: Floor,
  point: FloorPoint,
  reachMeters: number,
): FoundOpening | null {
  for (let index = floor.rooms.length - 1; index >= 0; index -= 1) {
    const room = floor.rooms[index];
    if (room === undefined) {
      continue;
    }
    const opening = openingAtPoint(room, pointInRoom(room, point), reachMeters);
    if (opening !== null) {
      return { room, opening };
    }
  }
  return null;
}

/**
 * The selected opening jamb under a pixel, if there is one.
 *
 * Like room handles, these keep a fixed screen target however far out the plan
 * is zoomed.
 */
function openingHandleAt(
  floor: Floor,
  selectedOpeningId: string | null,
  projection: PlanProjection,
  at: PixelPoint,
): {
  roomId: string;
  openingId: string;
  jamb: OpeningJamb;
  wall: WallSide;
} | null {
  const found = findOpening(floor, selectedOpeningId);
  if (found === null || checkOpening(found.room, found.opening) !== null) {
    return null;
  }
  const endpoints = openingEndpoints(found.room, found.opening);
  for (const jamb of ["start", "end"] as const) {
    const point = projectPoint(
      projection,
      pointOnFloor(found.room, endpoints[jamb]),
    );
    if (
      Math.abs(point.x - at.x) <= HANDLE_GRAB_PIXELS &&
      Math.abs(point.y - at.y) <= HANDLE_GRAB_PIXELS
    ) {
      return {
        roomId: found.room.id,
        openingId: found.opening.id,
        jamb,
        wall: found.opening.wall,
      };
    }
  }
  return null;
}

/** The underlay corner under a pixel, if one is within reach of it. */
function underlayCornerAt(
  underlay: PlanUnderlay,
  projection: PlanProjection,
  at: PixelPoint,
): UnderlayCorner | null {
  for (const { corner, at: point } of underlayCorners(underlay)) {
    const pixel = projectPoint(projection, point);
    if (
      Math.abs(pixel.x - at.x) <= HANDLE_GRAB_PIXELS &&
      Math.abs(pixel.y - at.y) <= HANDLE_GRAB_PIXELS
    ) {
      return corner;
    }
  }
  return null;
}

/** Fixed pointer reach converted from screen pixels into floor meters. */
function pointerReachMeters(floor: Floor, projection: PlanProjection): number {
  return Math.max(
    maxWallThicknessMeters(floor),
    HANDLE_GRAB_PIXELS / projection.pixelsPerMeter,
  );
}

function replaceOpening(room: Room, next: Opening): Room {
  return {
    ...room,
    openings: room.openings.map((opening) =>
      opening.id === next.id ? next : opening,
    ),
  };
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
  // No correction: the projection maps floor coordinates straight to pixels,
  // and running it backwards gives floor coordinates straight back. This is
  // what makes a pinned projection actually pin the drag — the mapping no
  // longer depends on where the rooms happen to be.
  return point;
}

/**
 * How much floor an empty plan shows, in meters across.
 *
 * A new project has nothing to fit, and fitting nothing gives a rectangle of
 * zero that zooms to infinity. Twelve meters is a two-bedroom apartment's worth
 * of floor: enough that a room dragged out at a real size looks like a real
 * size, and the grid squares read as the meters they are.
 */
const EMPTY_FLOOR_SPAN_METERS = 12;

/**
 * What the plan fits into its viewport: the apartment plus its shell all
 * round, stretched to keep the whole underlay reachable — an image being
 * traced is no use half off the screen.
 */
function fittedRect(
  floor: Floor,
  underlay: PlanUnderlay | null,
): { origin: FloorPoint; extent: FloorExtent } {
  const thickness = maxWallThicknessMeters(floor);
  const { origin, extent } = floorBounds(floor);
  const empty = floor.rooms.length === 0;
  const span = empty ? EMPTY_FLOOR_SPAN_METERS / 2 : 0;
  let west = origin.xMeters - thickness - span;
  let north = origin.zMeters - thickness - span;
  let east = origin.xMeters + extent.widthMeters + thickness + span;
  let south = origin.zMeters + extent.depthMeters + thickness + span;

  if (underlay !== null && underlay.visible) {
    const image = underlayExtentMeters(underlay);
    west = Math.min(west, underlay.origin.xMeters);
    north = Math.min(north, underlay.origin.zMeters);
    east = Math.max(east, underlay.origin.xMeters + image.widthMeters);
    south = Math.max(south, underlay.origin.zMeters + image.depthMeters);
  }

  return {
    origin: { xMeters: west, zMeters: north },
    extent: { widthMeters: east - west, depthMeters: south - north },
  };
}

/**
 * The projection the plan is drawn with. Shared by the drawing and the hit
 * testing, so a click lands where the piece appears rather than near it.
 */
function planProjectionFor(
  floor: Floor,
  underlay: PlanUnderlay | null,
  viewport: PixelSize,
): PlanProjection {
  // The fitted rectangle starts where the apartment starts. Handing the
  // origin over is what makes the result a complete transform, so nothing
  // downstream adds it back.
  const { origin, extent } = fittedRect(floor, underlay);
  return createPlanProjection(extent, viewport, PLAN_PADDING_PIXELS, origin);
}

/** Where the underlay image sits on screen, in CSS pixels. */
export function underlayFrame(
  underlay: PlanUnderlay,
  projection: PlanProjection,
): { left: number; top: number; width: number; height: number } {
  const corner = projectPoint(projection, underlay.origin);
  const extent = underlayExtentMeters(underlay);
  return {
    left: corner.x,
    top: corner.y,
    width: projectLength(projection, extent.widthMeters),
    height: projectLength(projection, extent.depthMeters),
  };
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
  const bounds = roomBounds(room);
  const size =
    room.parts.length === 1
      ? `${formatLength(bounds.widthMeters, unit)} wide by ` +
        `${formatLength(bounds.depthMeters, unit)} deep`
      : `${formatLength(bounds.widthMeters, unit)} across by ` +
        `${formatLength(bounds.depthMeters, unit)} down, built from ${room.parts.length} rectangles`;
  const at =
    `${formatLength(bounds.origin.xMeters, unit)} from the west and ` +
    `${formatLength(bounds.origin.zMeters, unit)} from the north`;

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
  selectedId: string | null;
  selectedRoomId: string | null;
  selectedRoomPartId: string | null;
  selectedOpeningId: string | null;
  troubledIds: ReadonlySet<string>;
  viewport: PixelSize;
  color: string;
  fontFamily: string;
  /** A room being dragged out right now, drawn as an outline over everything. */
  drawnRect?: { readonly from: FloorPoint; readonly to: FloorPoint } | null;
  /** The underlay whose corners can be dragged, or null when none can. */
  underlayHandles?: PlanUnderlay | null;
};

/** Everything the drawing helpers need to place a floor coordinate in pixels. */
type PlanFrame = {
  toPixels: (point: FloorPoint) => PixelPoint;
  /** The thicker wall, in pixels: the clearance handles keep from any band. */
  maxWallPixels: number;
  color: string;
};

function drawPlan(
  context: CanvasRenderingContext2D,
  {
    projection,
    floor,
    furniture,
    selectedId,
    selectedRoomId,
    selectedRoomPartId,
    selectedOpeningId,
    troubledIds,
    viewport,
    color,
    fontFamily,
    drawnRect = null,
    underlayHandles = null,
  }: DrawOptions,
): void {
  context.clearRect(0, 0, viewport.width, viewport.height);

  // The projection arrives already fitted — and possibly panned and zoomed
  // since. Everything below works in whatever transform it is handed.
  if (projection.pixelsPerMeter <= 0) {
    return;
  }

  const frame: PlanFrame = {
    toPixels: (point) => projectPoint(projection, point),
    maxWallPixels: projectLength(projection, maxWallThicknessMeters(floor)),
    color,
  };

  // Every room's walls first, then every floor punched out of them. Doing it
  // room by room would leave one room's wall drawn over the next room's floor
  // wherever two of them share one.
  for (const room of floor.rooms) {
    drawRoomWalls(context, frame, floor, room);
  }
  for (const room of floor.rooms) {
    punchRoomFloor(context, frame, room);
  }
  for (const room of floor.rooms) {
    drawMeterGrid(context, frame, room);
  }
  // Railings after the punches: a line a floor clear would have erased.
  for (const room of floor.rooms) {
    drawRoomRailings(context, frame, floor, room);
  }

  // Openings are cut from the finished wall band, which is the order a plan is
  // read in — and the only order that opens a doorway through a shared wall.
  for (const { room, opening } of drawableOpenings(floor)) {
    cutOpening(context, inRoom(frame, room), floor, room, opening);
  }
  for (const { room, opening } of drawableOpenings(floor)) {
    drawOpeningSymbol(context, inRoom(frame, room), floor, room, opening);
  }
  const selectedOpening = findOpening(floor, selectedOpeningId);
  if (
    selectedOpening !== null &&
    checkOpening(selectedOpening.room, selectedOpening.opening) === null
  ) {
    markSelectedOpening(
      context,
      inRoom(frame, selectedOpening.room),
      selectedOpening.room,
      selectedOpening.opening,
    );
  }

  for (const room of floor.rooms) {
    drawRoomName(context, frame, room, fontFamily);
    if (room.id === selectedRoomId) {
      markSelectedRoom(context, frame, room, selectedRoomPartId);
    }
  }

  for (const placed of furniture) {
    drawFurniture(context, frame, placed, {
      selected: placed.instance.id === selectedId,
      troubled: troubledIds.has(placed.instance.id),
    });
  }

  // Last, over everything: it is the thing being made right now.
  if (drawnRect !== null) {
    drawRoomPreview(context, frame, floor, drawnRect);
  }
  if (underlayHandles !== null) {
    drawUnderlayHandles(context, frame, underlayHandles);
  }
}

/**
 * The tape being laid along a known wall: the line, and a tick across each
 * end the way a dimension line closes, so both ends read as ends.
 */
/**
 * A grab at each corner of the underlay, in the same square the room handles
 * use — it is the same kind of thing, and the image is one more rectangle on
 * the plan that has a size worth getting right.
 */
function drawUnderlayHandles(
  context: CanvasRenderingContext2D,
  frame: PlanFrame,
  underlay: PlanUnderlay,
): void {
  context.save();
  context.fillStyle = frame.color;
  context.globalAlpha = SYMBOL_ALPHA;
  for (const { at } of underlayCorners(underlay)) {
    const point = frame.toPixels(at);
    context.fillRect(
      point.x - HANDLE_PIXELS / 2,
      point.y - HANDLE_PIXELS / 2,
      HANDLE_PIXELS,
      HANDLE_PIXELS,
    );
  }
  context.restore();
}

/**
 * The room being dragged out, as it will be made.
 *
 * Run through `drawnRoom` rather than drawn from the raw corners, so the
 * rectangle on screen is the room you get — snapped to its neighbours and held
 * to the smallest a room may be. A preview that shows one rectangle and
 * produces another is worse than no preview.
 */
function drawRoomPreview(
  context: CanvasRenderingContext2D,
  frame: PlanFrame,
  floor: Floor,
  corners: { readonly from: FloorPoint; readonly to: FloorPoint },
): void {
  const room = drawnRoom(floor, "preview", "", corners.from, corners.to);
  const part = primaryRoomPart(room);
  const inside = frame.toPixels(part.origin);
  const width = spanPixels(frame, part.widthMeters);
  const depth = spanPixels(frame, part.depthMeters);

  context.save();
  context.globalAlpha = FLOOR_ALPHA;
  context.fillStyle = frame.color;
  context.fillRect(inside.x, inside.y, width, depth);

  // Dashed, because it is not a room yet. The wall band arrives with it.
  context.globalAlpha = 1;
  context.strokeStyle = frame.color;
  context.lineWidth = 1.5;
  context.setLineDash([6, 4]);
  context.strokeRect(inside.x, inside.y, width, depth);
  context.restore();
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

/**
 * Runs `draw` with the canvas turned into one part's own frame: the origin at
 * the part's anchor corner, X running down its width, in pixels. Every rect
 * drawn or cleared inside follows the part's turn, because the canvas
 * transforms rectangles — including `clearRect` — through the current matrix.
 */
function inPartFrame(
  context: CanvasRenderingContext2D,
  frame: PlanFrame,
  part: RoomPart,
  draw: (widthPixels: number, depthPixels: number) => void,
): void {
  const anchor = frame.toPixels(part.origin);
  context.save();
  context.translate(anchor.x, anchor.y);
  context.rotate(part.rotationRadians);
  draw(
    spanPixels(frame, part.widthMeters),
    spanPixels(frame, part.depthMeters),
  );
  context.restore();
}

/**
 * One room's walls: each stretch of each part side, at the thickness of the
 * wall that actually stands there — the shell, a partition, or nothing where
 * the side is a seam or was left open.
 *
 * Every band rectangle goes into one path and is filled once, so translucent
 * ink never doubles where bands of different thickness meet at a corner.
 */
function drawRoomWalls(
  context: CanvasRenderingContext2D,
  frame: PlanFrame,
  floor: Floor,
  room: Room,
): void {
  const pixelsPerMeter = spanPixels(frame, 1);
  context.save();
  context.globalAlpha = WALL_ALPHA;
  context.fillStyle = frame.color;
  context.beginPath();
  for (const part of room.parts) {
    const sides = partWallStretches(floor, room, part);
    /** The band thickness standing on `wall` at `along`, in meters. */
    const thicknessAt = (wall: WallSide, alongMeters: number): number => {
      const stretch = sides[wall].find(
        (one) =>
          alongMeters >= one.startMeters - 0.002 &&
          alongMeters <= one.endMeters + 0.002,
      );
      return stretch?.thicknessMeters ?? 0;
    };

    inPartFrame(context, frame, part, () => {
      for (const wall of partWallSides(part)) {
        const line = partWallFrame(part, wall);
        for (const stretch of sides[wall]) {
          const thickness = stretch.thicknessMeters;
          if (thickness <= 0) {
            continue;
          }
          // A stretch reaching a corner has its outer edge carried to where
          // the neighbouring band's outer edge crosses it, so the two close
          // into a mitre instead of each overshooting the other.
          traceWallBand(context, pixelsPerMeter, {
            line,
            fromMeters: stretch.startMeters,
            toMeters: stretch.endMeters,
            thicknessMeters: thickness,
            outerFrom:
              stretch.startMeters <= 0.002
                ? miterCorner(part, wall, "from", thickness, thicknessAt)
                : null,
            outerTo:
              stretch.endMeters >= line.lengthMeters - 0.002
                ? miterCorner(part, wall, "to", thickness, thicknessAt)
                : null,
          });
        }
      }
    });
  }
  context.fill();
  context.restore();
}

/**
 * One band of wall along a stretch, added to the current path.
 *
 * Four points rather than a rectangle, because a chamfer's band lies on no
 * axis even in its own part's frame.
 *
 * **The outer corners are mitred rather than extended.** Growing each band
 * along its own direction by the neighbour's thickness is exact where two
 * walls meet at a right angle and wrong everywhere else — at the 135° corners
 * a clipped corner leaves, it sends the band past the wall it was supposed to
 * meet, which is the spike that showed up on the first drawing of one. Where
 * the two outer edges actually cross is the mitre, at any angle, and it is the
 * same point at 90°.
 *
 * **Wound the same way whichever wall it is**: the square sides are not all
 * measured the way the outline runs, so a quad laid out from the wall's own
 * direction comes out clockwise on four walls and anticlockwise on the other
 * four — and two opposite windings overlapping at a corner would cancel each
 * other into a hole when the whole path is filled at once.
 */
function traceWallBand(
  context: CanvasRenderingContext2D,
  pixelsPerMeter: number,
  band: {
    readonly line: WallFrame;
    readonly fromMeters: number;
    readonly toMeters: number;
    readonly thicknessMeters: number;
    /** The mitre point, or null for a square end. */
    readonly outerFrom: FloorPoint | null;
    readonly outerTo: FloorPoint | null;
  },
): void {
  const { line, thicknessMeters } = band;
  const at = (alongMeters: number, outMeters: number): FloorPoint => ({
    xMeters:
      line.from.xMeters +
      line.direction.dx * alongMeters +
      line.normal.dx * outMeters,
    zMeters:
      line.from.zMeters +
      line.direction.dz * alongMeters +
      line.normal.dz * outMeters,
  });

  const quad = [
    at(band.fromMeters, 0),
    at(band.toMeters, 0),
    band.outerTo ?? at(band.toMeters, thicknessMeters),
    band.outerFrom ?? at(band.fromMeters, thicknessMeters),
  ];
  const turningTheSameWay =
    line.direction.dx * line.normal.dz - line.direction.dz * line.normal.dx < 0;
  const points = turningTheSameWay ? quad : [...quad].reverse();

  points.forEach((point, index) => {
    const x = point.xMeters * pixelsPerMeter;
    const y = point.zMeters * pixelsPerMeter;
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  });
  context.closePath();
}

/**
 * Where this wall's outer face crosses the neighbouring wall's outer face, in
 * the part's own frame — or null where there is no band to meet, which leaves
 * the end square.
 */
function miterCorner(
  part: RoomPart,
  wall: WallSide,
  end: "from" | "to",
  thicknessMeters: number,
  thicknessAt: (wall: WallSide, alongMeters: number) => number,
): FloorPoint | null {
  const [neighbour, alongMeters] = cornerNeighbour(part, wall, end);
  const theirThickness = thicknessAt(neighbour, alongMeters);
  if (neighbour === wall || theirThickness <= 0) {
    return null;
  }

  const mine = partWallFrame(part, wall);
  const theirs = partWallFrame(part, neighbour);
  return crossingOf(
    outerFace(mine, thicknessMeters),
    mine.direction,
    outerFace(theirs, theirThickness),
    theirs.direction,
  );
}

/** A point on the outer face of a wall band. */
function outerFace(line: WallFrame, thicknessMeters: number): FloorPoint {
  return {
    xMeters: line.from.xMeters + line.normal.dx * thicknessMeters,
    zMeters: line.from.zMeters + line.normal.dz * thicknessMeters,
  };
}

/** Where two lines cross, or null when they run parallel. */
function crossingOf(
  a: FloorPoint,
  along: FloorVector,
  b: FloorPoint,
  beside: FloorVector,
): FloorPoint | null {
  const denominator = along.dx * beside.dz - along.dz * beside.dx;
  if (Math.abs(denominator) < 0.000001) {
    return null;
  }
  const steps =
    ((b.xMeters - a.xMeters) * beside.dz -
      (b.zMeters - a.zMeters) * beside.dx) /
    denominator;
  return {
    xMeters: a.xMeters + along.dx * steps,
    zMeters: a.zMeters + along.dz * steps,
  };
}

/** Every side's stretches of one part, computed once. */
function partWallStretches(
  floor: Floor,
  room: Room,
  part: RoomPart,
): Record<WallSide, readonly WallStretch[]> {
  return Object.fromEntries(
    WALL_SIDES.map((wall) => [wall, wallStretches(floor, room, part, wall)]),
  ) as Record<WallSide, readonly WallStretch[]>;
}

/**
 * The wall sharing a corner with one end of this one, and where along it that
 * corner falls.
 *
 * Found by the corner itself rather than from a table of which side follows
 * which, because what follows the north wall is the east wall on a square
 * section and the north-east chamfer on a clipped one. Every vertex of a
 * convex outline has exactly two walls meeting at it, so there is never a
 * choice to make. A wall with nothing adjacent reports a position no stretch
 * covers, which grows the band by nothing.
 */
function cornerNeighbour(
  part: RoomPart,
  wall: WallSide,
  end: "from" | "to",
): [WallSide, number] {
  const line = partWallFrame(part, wall);
  const corner = end === "from" ? line.from : line.to;

  for (const other of partWallSides(part)) {
    if (other === wall) {
      continue;
    }
    const theirs = partWallFrame(part, other);
    if (samePoint(theirs.to, corner)) {
      return [other, theirs.lengthMeters];
    }
    if (samePoint(theirs.from, corner)) {
      return [other, 0];
    }
  }
  return [wall, -1];
}

function samePoint(a: FloorPoint, b: FloorPoint): boolean {
  return (
    Math.abs(a.xMeters - b.xMeters) < 0.000000001 &&
    Math.abs(a.zMeters - b.zMeters) < 0.000000001
  );
}

/** Open edges drawn as the railings they are: a line where a wall is not. */
function drawRoomRailings(
  context: CanvasRenderingContext2D,
  frame: PlanFrame,
  floor: Floor,
  room: Room,
): void {
  const pixelsPerMeter = spanPixels(frame, 1);
  context.save();
  context.strokeStyle = frame.color;
  context.globalAlpha = SYMBOL_ALPHA;
  context.lineWidth = 1.5;
  context.beginPath();
  for (const part of room.parts) {
    inPartFrame(context, frame, part, () => {
      for (const wall of partWallSides(part)) {
        const line = partWallFrame(part, wall);
        for (const stretch of wallStretches(floor, room, part, wall)) {
          if (stretch.kind !== "open") {
            continue;
          }
          const from = alongWallPixel(
            line,
            stretch.startMeters,
            pixelsPerMeter,
          );
          const to = alongWallPixel(line, stretch.endMeters, pixelsPerMeter);
          context.moveTo(from.x, from.y);
          context.lineTo(to.x, to.y);
        }
      }
    });
  }
  context.stroke();
  context.restore();
}

/** A point on a wall's inside face, in its own part's pixel frame. */
function alongWallPixel(
  line: WallFrame,
  alongMeters: number,
  pixelsPerMeter: number,
): PixelPoint {
  return {
    x: (line.from.xMeters + line.direction.dx * alongMeters) * pixelsPerMeter,
    y: (line.from.zMeters + line.direction.dz * alongMeters) * pixelsPerMeter,
  };
}

/** The room's own floor, cleared out of the wall band and tinted. */
function punchRoomFloor(
  context: CanvasRenderingContext2D,
  frame: PlanFrame,
  room: Room,
): void {
  const pixelsPerMeter = spanPixels(frame, 1);
  for (const part of room.parts) {
    inPartFrame(context, frame, part, (width, depth) => {
      context.save();
      // Only a section with a corner clipped off pays for the clip; a whole
      // rectangle clears and tints exactly as it always has.
      if (roomPartIsCut(part)) {
        tracePartOutline(context, part, pixelsPerMeter);
        context.clip();
      }
      context.clearRect(0, 0, width, depth);
      context.globalAlpha = FLOOR_ALPHA;
      context.fillStyle = frame.color;
      context.fillRect(0, 0, width, depth);
      context.restore();
    });
  }
}

/** The part's true outline as a path of its own, in its own pixel frame. */
function tracePartOutline(
  context: CanvasRenderingContext2D,
  part: RoomPart,
  pixelsPerMeter: number,
): void {
  context.beginPath();
  addPartOutline(context, part, pixelsPerMeter);
}

/** The same outline added to a path already being built, for a compound clip. */
function addPartOutline(
  context: CanvasRenderingContext2D,
  part: RoomPart,
  pixelsPerMeter: number,
): void {
  roomPartLocalPolygon(part).forEach((point, index) => {
    const x = point.xMeters * pixelsPerMeter;
    const y = point.zMeters * pixelsPerMeter;
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  });
  context.closePath();
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

  const labelPart = room.parts.reduce((largest, part) =>
    part.widthMeters * part.depthMeters >
    largest.widthMeters * largest.depthMeters
      ? part
      : largest,
  );
  // The part's true center, wherever its turn has carried it. The text itself
  // stays level: a label is furniture of the screen, not of the room.
  const center = frame.toPixels(roomPartPivotRect(labelPart).center);

  context.save();
  context.globalAlpha = ROOM_NAME_ALPHA;
  context.fillStyle = frame.color;
  context.font = `${LABEL_PIXELS}px ${fontFamily}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(room.name, center.x, center.y);
  context.restore();
}

/**
 * The eight places a room can be taken hold of to resize it.
 *
 * Four walls and four corners. A corner is simply two walls moving at once,
 * which is why a handle carries a list of edges rather than a name of its own.
 */
export function roomHandles(
  room: Room,
): readonly { edges: readonly RoomEdge[]; at: FloorPoint }[] {
  // Resizing the union bounds would be ambiguous once a room has several
  // parts. Those parts stay fully numeric in the inspector; one-part rooms
  // retain the direct canvas handles they have always had.
  if (room.parts.length !== 1) {
    return [];
  }
  return roomPartHandles(primaryRoomPart(room));
}

export function roomPartHandles(
  part: RoomPart,
): readonly { edges: readonly RoomEdge[]; at: FloorPoint }[] {
  const width = part.widthMeters;
  const depth = part.depthMeters;
  const middleX = width / 2;
  const middleZ = depth / 2;

  // Placed in the part's own frame and carried onto the floor, so a turned
  // section keeps its handles on its actual corners and walls. Edge names stay
  // local too: "north" is the wall the anchor corner sits on, however turned.
  const local: readonly { edges: readonly RoomEdge[]; at: FloorPoint }[] = [
    { edges: ["north", "west"], at: { xMeters: 0, zMeters: 0 } },
    { edges: ["north"], at: { xMeters: middleX, zMeters: 0 } },
    { edges: ["north", "east"], at: { xMeters: width, zMeters: 0 } },
    { edges: ["east"], at: { xMeters: width, zMeters: middleZ } },
    { edges: ["south", "east"], at: { xMeters: width, zMeters: depth } },
    { edges: ["south"], at: { xMeters: middleX, zMeters: depth } },
    { edges: ["south", "west"], at: { xMeters: 0, zMeters: depth } },
    { edges: ["west"], at: { xMeters: 0, zMeters: middleZ } },
  ];
  return local.map(({ edges, at }) => ({
    edges,
    at: pointOnRoomPart(part, at),
  }));
}

/**
 * Screen pixels kept between the wall band and the rotation handle, so the
 * handle stays clear of the north wall's own resize handle at any zoom.
 */
export const ROTATE_HANDLE_CLEARANCE_PIXELS = 18;

/**
 * Where the rotation handle sits: past the middle of the part's north wall,
 * along the wall's own outward direction. A fixed pixel reach, like every
 * other handle, so it is equally grabbable however far out the plan is.
 */
export function rotateHandlePixel(
  part: RoomPart,
  toPixels: (point: FloorPoint) => PixelPoint,
  wallPixels: number,
): PixelPoint {
  const anchor = toPixels(
    pointOnRoomPart(part, { xMeters: part.widthMeters / 2, zMeters: 0 }),
  );
  const out = wallOutwardNormalOnFloor(part, "north");
  const reach = wallPixels + ROTATE_HANDLE_CLEARANCE_PIXELS;
  return { x: anchor.x + out.dx * reach, y: anchor.y + out.dz * reach };
}

/** How close a dragged angle has to be to land on a 45° step. */
const ROTATE_SNAP_DEGREES = 3;

/**
 * A dragged rotation, landed on a number somebody would type.
 *
 * Whole degrees always — a wall at 44.7183° is a number nobody can check —
 * and within a few degrees of a quarter or eighth turn, that turn exactly,
 * because 45° walls are the reason sections rotate at all. The typed angle
 * field remains the exact path and snaps to nothing.
 */
function draggedRotation(radians: number): number {
  const degrees = degreesFromRadians(normalizeRadians(radians));
  const nearestEighth = Math.round(degrees / 45) * 45;
  const landed =
    Math.abs(degrees - nearestEighth) <= ROTATE_SNAP_DEGREES
      ? nearestEighth
      : Math.round(degrees);
  return radiansFromDegrees(landed % 360);
}

/** The selected room, outlined inside its own walls, with its handles. */
function markSelectedRoom(
  context: CanvasRenderingContext2D,
  frame: PlanFrame,
  room: Room,
  selectedPartId: string | null,
): void {
  const selectedPart = room.parts.find((part) => part.id === selectedPartId);
  const markedParts = selectedPart === undefined ? room.parts : [selectedPart];
  context.save();
  context.globalAlpha = SELECTED_FILL_ALPHA;
  context.fillStyle = frame.color;
  context.globalAlpha = 1;
  context.strokeStyle = frame.color;
  context.lineWidth = 2;
  context.setLineDash([6, 4]);
  const pixelsPerMeter = spanPixels(frame, 1);
  for (const part of markedParts) {
    inPartFrame(context, frame, part, (width, depth) => {
      context.globalAlpha = SELECTED_FILL_ALPHA;
      if (roomPartIsCut(part)) {
        tracePartOutline(context, part, pixelsPerMeter);
        context.fill();
        context.globalAlpha = 1;
        context.stroke();
        return;
      }
      context.fillRect(0, 0, width, depth);
      context.globalAlpha = 1;
      context.strokeRect(0, 0, width, depth);
    });
  }

  context.setLineDash([]);
  context.fillStyle = frame.color;
  const handles =
    selectedPart === undefined
      ? roomHandles(room)
      : roomPartHandles(selectedPart);
  // A clipped corner is taken hold of in the middle of its chamfer, alongside
  // the eight that resize the rectangle. Dragging it moves both of the cut's
  // legs at once, which is the one thing the two fields beside the plan cannot
  // do in a single gesture.
  const cuts =
    selectedPart === undefined
      ? room.parts.length === 1
        ? roomPartCutHandles(primaryRoomPart(room))
        : []
      : roomPartCutHandles(selectedPart);
  for (const { at } of [...handles, ...cuts]) {
    const point = frame.toPixels(at);
    context.fillRect(
      point.x - HANDLE_PIXELS / 2,
      point.y - HANDLE_PIXELS / 2,
      HANDLE_PIXELS,
      HANDLE_PIXELS,
    );
  }

  // The rotation handle, wherever resize handles are shown: a round grab past
  // the north wall, tethered to the wall it turns.
  const rotatable =
    selectedPart ??
    (room.parts.length === 1 ? primaryRoomPart(room) : undefined);
  if (rotatable !== undefined) {
    const anchor = frame.toPixels(
      pointOnRoomPart(rotatable, {
        xMeters: rotatable.widthMeters / 2,
        zMeters: 0,
      }),
    );
    const at = rotateHandlePixel(
      rotatable,
      frame.toPixels,
      frame.maxWallPixels,
    );
    context.globalAlpha = JAMB_ALPHA;
    context.lineWidth = 1;
    strokeSegments(context, [[anchor, at]]);
    context.globalAlpha = 1;
    context.beginPath();
    context.arc(at.x, at.y, HANDLE_PIXELS / 2 + 1, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

/** The selected opening, with a grab point on each jamb. */
function markSelectedOpening(
  context: CanvasRenderingContext2D,
  frame: PlanFrame,
  room: Room,
  opening: Opening,
): void {
  const { start, end } = openingEndpoints(room, opening);
  const a = frame.toPixels(start);
  const b = frame.toPixels(end);

  context.save();
  context.strokeStyle = frame.color;
  context.globalAlpha = FURNITURE_EDGE_ALPHA;
  context.lineWidth = 2;
  // A guide rather than a wall put back across the opening it is marking.
  context.setLineDash([4, 3]);
  strokeSegments(context, [[a, b]]);
  context.setLineDash([]);
  context.globalAlpha = 1;
  context.fillStyle = frame.color;
  for (const point of [a, b]) {
    context.fillRect(
      point.x - HANDLE_PIXELS / 2,
      point.y - HANDLE_PIXELS / 2,
      HANDLE_PIXELS,
      HANDLE_PIXELS,
    );
  }
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

/** A one-meter grid, so the drawing reads as a measurement and not a sketch. */
function drawMeterGrid(
  context: CanvasRenderingContext2D,
  frame: PlanFrame,
  room: Room,
): void {
  context.save();

  // Parts are an authoring detail; the visible grid belongs to the room. A
  // compound clip makes one continuous floor-coordinate grid occupy exactly
  // the union — an L keeps its notch empty, a turned part is clipped to the
  // parallelogram it actually stands on, and a clipped corner keeps its grid
  // off the floor the cut took away, because path points are carried through
  // the part's transform as they are added.
  const pixelsPerMeter = spanPixels(frame, 1);
  context.beginPath();
  for (const part of room.parts) {
    inPartFrame(context, frame, part, () => {
      addPartOutline(context, part, pixelsPerMeter);
    });
  }
  context.clip();

  context.globalAlpha = GRID_ALPHA;
  context.strokeStyle = frame.color;
  context.lineWidth = 1;
  context.beginPath();

  for (const line of roomGridLines(room)) {
    const from = frame.toPixels(line.from);
    const to = frame.toPixels(line.to);
    if (line.from.xMeters === line.to.xMeters) {
      const x = Math.round(from.x) + 0.5;
      context.moveTo(x, from.y);
      context.lineTo(x, to.y);
    } else {
      const y = Math.round(from.y) + 0.5;
      context.moveTo(from.x, y);
      context.lineTo(to.x, y);
    }
  }

  context.stroke();
  context.restore();
}

/** Removes the wall across an opening, leaving a clean hole through it. */
function cutOpening(
  context: CanvasRenderingContext2D,
  frame: PlanFrame,
  floor: Floor,
  room: Room,
  opening: Opening,
): void {
  const part = roomPart(room, opening.partId);
  if (part === undefined) {
    return;
  }
  const { start, end } = openingEndpoints(room, opening);
  const normal = wallOutwardNormalOnFloor(part, opening.wall);
  const a = frame.toPixels(start);
  const b = frame.toPixels(end);
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length <= 0) {
    return;
  }

  // As deep as the wall actually standing here — a doorway through the shell
  // cuts further than one through a partition.
  const wallPixels = spanPixels(
    frame,
    openingWallThicknessMeters(floor, room, opening),
  );

  // Lay the canvas along the wall — X from jamb to jamb, the wall band along
  // ±Y — and clear through it. The cleared rectangle follows the transform,
  // so the hole runs with the wall whichever way its part is turned.
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const outX = normal.dx * wallPixels;
  const outY = normal.dz * wallPixels;
  const throughPixels = -Math.sin(angle) * outX + Math.cos(angle) * outY;

  context.save();
  context.translate(a.x, a.y);
  context.rotate(angle);
  // Bleed half a pixel through the wall only. Widening across the opening
  // instead would make it measure wider than it is.
  context.clearRect(
    0,
    Math.min(0, throughPixels) - 0.5,
    length,
    Math.abs(throughPixels) + 1,
  );
  context.restore();
}

function drawOpeningSymbol(
  context: CanvasRenderingContext2D,
  frame: PlanFrame,
  floor: Floor,
  room: Room,
  opening: Opening,
): void {
  const part = roomPart(room, opening.partId);
  if (part === undefined) {
    return;
  }
  const { start, end } = openingEndpoints(room, opening);
  // On the floor — and so on the screen, whose axes follow it — the normal
  // leans with the part the wall belongs to.
  const normal = wallOutwardNormalOnFloor(part, opening.wall);
  const wallPixels = spanPixels(
    frame,
    openingWallThicknessMeters(floor, room, opening),
  );
  const a = frame.toPixels(start);
  const b = frame.toPixels(end);
  const through = (point: PixelPoint, fraction: number): PixelPoint => ({
    x: point.x + normal.dx * wallPixels * fraction,
    y: point.y + normal.dz * wallPixels * fraction,
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

/** One gesture's zoom, held to a step somebody can follow. See MAX_ZOOM_STEP. */
function clampZoomStep(factor: number): number {
  if (!(factor > 0)) {
    return 1;
  }
  return Math.min(MAX_ZOOM_STEP, Math.max(1 / MAX_ZOOM_STEP, factor));
}
