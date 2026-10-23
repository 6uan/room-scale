"use client";

import {
  useEffect,
  useRef,
  useMemo,
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
  framingOfProjection,
  orientedRectCorners,
  panBy,
  projectLength,
  projectPoint,
  projectionOfFraming,
  unprojectPoint,
  zoomAt,
  type FloorExtent,
  type Framing,
  type FloorPoint,
  type PixelPoint,
  type PixelSize,
  type PlanProjection,
} from "@/domain/geometry";
import {
  clampToFloor,
  furnitureAt,
  footprintRect,
  moveInstance,
  NO_HOLD,
  groupGaps,
  heldSnap,
  nearestGaps,
  snapGroupDelta,
  type SnapHold,
  snapInstancePosition,
  type WallGap,
  placedNames,
  type FurnitureInstance,
  type FurnitureProduct,
  type PlacedFurniture,
} from "@/domain/furniture";
import { instanceFromKeyPress } from "@/components/placement-keys";
import { roomGridLines } from "@/components/room-grid";
import { pressIs } from "@/components/shortcuts";
import type { Gesture } from "@/state/project-store";
import { PRODUCT_DRAG_TYPE } from "@/components/catalogue-panel";
import {
  WALL_SIDES,
  BIFOLD_REACH,
  groupMates,
  checkOpening,
  drawnRoom,
  isWallDividing,
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
  openingRangeMeters,
  wallLengthMeters,
  pointAlongWall,
  pointInRoom,
  pointOnFloor,
  pointOnRoomPart,
  primaryRoomPart,
  resizeOpeningJamb,
  resizeRoomPartEdgeToPoint,
  partsOnRoomEdge,
  roomEdgePosition,
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
  roundedResizeTarget,
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
  groupOf,
  type PieceGroup,
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
/**
 * The width kept clear on the right when the plan is fitted: where the
 * details panel floats while something is selected. Fitting into the rest
 * means the panel never lands on the apartment, and the plan never has to
 * move when the panel comes and goes — the strip is simply spare canvas
 * until it is wanted. Matches the panel's `w-80`.
 */
export const PANEL_RESERVE_PIXELS = 320;
const LABEL_PIXELS = 12;

/**
 * Opacities, so a single foreground color carries the whole drawing and follows
 * the light and dark themes without a second palette. Walls are nearly solid,
 * which is how a plan marks cut material.
 */
const FLOOR_ALPHA = 0.05;
/** The dashes a wall's faces are carried across an opening with, in pixels. */
const OPENING_DASH = [3, 3];
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
  /** Whether the details panel is floating over the plan's right edge. */
  panelOpen?: boolean;
  /** The unit a product's own size reads in, which can differ from the plan's. */
  productUnit?: DisplayUnit;
  /** How strongly the plan image is drawn, 0 to 1. */
  underlayOpacity?: number;
  /** Said whenever what the plan shows changes, so another view can follow it. */
  onFramingChange?: (framing: Framing) => void;
  /**
   * A framing to show, from the perspective view. Taken once per `id`, then
   * the plan pans and zooms from there as usual.
   */
  showFraming?: { readonly framing: Framing; readonly id: number } | null;
  /** Which piece is being worked on, or null. Never persisted: this is UI state. */
  /** The selected pieces: none, one, or a group dragged as one. */
  selectedIds: readonly string[];
  /** Pieces the validation has something to say about, marked as they are drawn. */
  troubledIds: ReadonlySet<string>;
  /** The rooms in a group, drawn as selected and dragged with it. */
  groupRoomIds?: readonly string[];
  /** Pieces kept together: grabbing one picks up all of them. */
  groups?: readonly PieceGroup[];
  onSelect: (
    instanceIds: readonly string[],
    roomIds: readonly string[],
  ) => void;
  /** Several rooms moved as one, by a group drag. */
  onRoomsChange?: (rooms: readonly Room[], gesture?: Gesture) => void;
  /** Several pieces moved as one, by a group drag or a nudge. */
  onInstancesChange?: (
    instances: readonly FurnitureInstance[],
    gesture?: string,
  ) => void;
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
  /** The sections of a selected group: marked together, moved together. */
  selectedGroupPartIds?: readonly string[];
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
   * A product armed from the list, waiting for a click to say where it goes.
   * Its footprint follows the pointer until then, so what is about to be put
   * down is seen at true size before it is.
   */
  placingProduct?: FurnitureProduct | null;
  onPlaceProduct?: (product: FurnitureProduct, at: FloorPoint) => void;
  onPlaceProductEnd?: () => void;
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
      /** Where the snap is holding the piece, per axis. */
      readonly hold: SnapHold;
    }
  | {
      /** Everything selected, moved together by whichever one was grabbed. */
      readonly kind: "group";
      readonly pointerId: number;
      readonly fromPixel: PixelPoint;
      readonly from: FloorPoint;
      /** The grabbed thing, which is what snaps; the rest follow it. */
      readonly leader:
        | { readonly kind: "instance"; readonly id: string }
        | { readonly kind: "room"; readonly id: string };
      readonly instanceOrigins: ReadonlyMap<string, FloorPoint>;
      readonly roomOrigins: ReadonlyMap<string, FloorPoint>;
      /** Where the snap is holding the group's offset, per axis. */
      readonly hold: SnapHold;
    }
  | {
      /** A rectangle dragged over the floor, selecting what it touches. */
      readonly kind: "marquee";
      readonly pointerId: number;
      readonly fromPixel: PixelPoint;
      readonly from: FloorPoint;
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
      /** Whether the group this section is in was what got picked up. */
      readonly withGroup: boolean;
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
      /**
       * What was under a Shift press, to put in or out of the group if the
       * press turns out to be a click rather than a drag of the view.
       */
      readonly toggle?:
        | { readonly kind: "instance"; readonly id: string }
        | { readonly kind: "room"; readonly id: string }
        | undefined;
      readonly fromPixel?: PixelPoint | undefined;
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
const NO_GROUPS: readonly PieceGroup[] = [];
const NO_IDS: readonly string[] = [];

/** The reach of a snap on the screen. */
const SNAP_PIXELS = 8;
/** How far the pointer has to pull before a snap that has landed lets go. */
const HOLD_PIXELS = 24;

export function RoomPlanCanvas({
  floor,
  furniture,
  unit,
  panelOpen = false,
  productUnit = unit,
  underlayOpacity = 0.4,
  onFramingChange,
  showFraming = null,
  selectedIds,
  troubledIds,
  onSelect,
  onInstanceChange,
  onInstancesChange,
  groupRoomIds = [],
  groups = NO_GROUPS,
  onRoomsChange,
  onDropProduct,
  selectedRoomId = null,
  selectedRoomPartId = null,
  selectedGroupPartIds = NO_IDS,
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
  placingProduct = null,
  onPlaceProduct,
  onPlaceProductEnd,
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

  // What is actually seen: the canvas, short of the details panel while it
  // floats over the right edge.
  const visibleWidth =
    panelOpen && size.width > PANEL_RESERVE_PIXELS * 2
      ? size.width - PANEL_RESERVE_PIXELS
      : size.width;

  // Coming back from the perspective view: show what it was showing, once,
  // as soon as the plan has a size to show it in. Adjusted during render, the
  // way a field takes a new value, rather than in an effect a frame late.
  const [shownFramingId, setShownFramingId] = useState<number | null>(null);
  if (
    showFraming !== null &&
    showFraming.id !== shownFramingId &&
    visibleWidth > 0
  ) {
    const next = projectionOfFraming(showFraming.framing, {
      left: 0,
      width: visibleWidth,
      height: size.height,
    });
    setShownFramingId(showFraming.id);
    if (next !== null) {
      setView(next);
    }
  }
  const projection = view ?? fitted;

  // And the other way: what the plan shows, for the perspective view to open
  // on. Nothing while the plan is hidden and has no size.
  useEffect(() => {
    const framing = framingOfProjection(projection, {
      left: 0,
      width: visibleWidth,
      height: size.height,
    });
    if (framing !== null) {
      onFramingChange?.(framing);
    }
  }, [projection, visibleWidth, size.height, onFramingChange]);
  /**
   * How close a piece must come to a face to be caught by it: a few pixels
   * on the screen, in meters at the zoom of the moment. In meters alone it
   * was four inches whatever the zoom, which zoomed in is most of the
   * screen and made a piece impossible to put down near anything.
   */
  const snapReach = () => SNAP_PIXELS / projectionRef.current.pixelsPerMeter;
  const holdReach = () => HOLD_PIXELS / projectionRef.current.pixelsPerMeter;

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
  const selectedId = selectedIds.length === 1 ? (selectedIds[0] ?? null) : null;
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
   * The piece being dragged, for the gaps drawn from it to the walls while it
   * moves. State rather than read from the drag ref, because the lines have
   * to repaint with every move and go the moment the piece is let go.
   */
  const [movingId, setMovingId] = useState<string | null>(null);
  /** Every piece moving with it, when what moves is a group: measured as one. */
  const [movingGroupIds, setMovingGroupIds] = useState<readonly string[]>([]);
  /** The selection rectangle being dragged, in pixels, or null. */
  const [marquee, setMarquee] = useState<{
    readonly from: PixelPoint;
    readonly to: PixelPoint;
  } | null>(null);

  /** Where the armed product would land, under the pointer, snapped. */
  const [ghostAt, setGhostAt] = useState<FloorPoint | null>(null);
  const ghost = useMemo(
    (): PlacedFurniture | null =>
      placingProduct === null || ghostAt === null
        ? null
        : {
            instance: {
              id: "ghost",
              productId: placingProduct.id,
              position: ghostAt,
              rotationRadians: 0,
            },
            product: placingProduct,
          },
    [placingProduct, ghostAt],
  );

  /** Where an armed product lands if put down here: on the floor, snapped. */
  function landingPoint(product: FurnitureProduct, point: FloorPoint) {
    const placed: PlacedFurniture = {
      instance: {
        id: "ghost",
        productId: product.id,
        position: point,
        rotationRadians: 0,
      },
      product,
    };
    return snapInstancePosition(
      floor,
      furniture,
      placed,
      clampToFloor(floor, point),
      snapReach(),
    );
  }
  /**
   * The room, or the section of one, being resized by a wall or corner, for
   * the size printed beside it while it changes — the same readout a room
   * gets while it is first dragged out.
   */
  const [resizing, setResizing] = useState<{
    readonly roomId: string;
    readonly partId: string | null;
  } | null>(null);

  /**
   * The two corners of a room being drawn, or null when none is.
   *
   * State rather than a ref, unlike the drag itself: this one has to repaint
   * on every move, because the rectangle following the pointer *is* the
   * feedback. There is nothing else on screen saying how big the room will be.
   */
  const [drawn, setDrawn] = useState<{
    readonly from: FloorPoint;
    readonly to: FloorPoint;
  } | null>(null);

  /**
   * The rectangle the drag would leave behind, worked out the way the
   * workspace will work it out: landed on whole inches or centimeters and
   * snapped to its neighbours. The outline and the size printed beside it
   * both come from this, so the number you watch is the number you get.
   */
  /** The rectangle being resized, as the readout wants it. */
  const resizedPart = useMemo((): DrawnPart | null => {
    if (resizing === null) {
      return null;
    }
    const room = floor.rooms.find((one) => one.id === resizing.roomId);
    if (room === undefined) {
      return null;
    }
    const part =
      resizing.partId === null ? undefined : roomPart(room, resizing.partId);
    if (part !== undefined) {
      return {
        origin: part.origin,
        widthMeters: part.widthMeters,
        depthMeters: part.depthMeters,
      };
    }
    const bounds = roomBounds(room);
    return {
      origin: bounds.origin,
      widthMeters: bounds.widthMeters,
      depthMeters: bounds.depthMeters,
    };
  }, [floor, resizing]);

  const drawnPart = useMemo(() => {
    if (drawn === null) {
      return null;
    }
    const room = drawnRoom(
      floor,
      "preview",
      "",
      drawn.from,
      drawn.to,
      (meters) => roundToDisplayUnit(meters, unit),
    );
    const part = primaryRoomPart(room);
    return {
      origin: part.origin,
      widthMeters: part.widthMeters,
      depthMeters: part.depthMeters,
    };
  }, [floor, drawn, unit]);

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
    selectedIds.length === 0 &&
    selectedRoomId === null &&
    selectedOpeningId === null
      ? underlay
      : null;

  const [active, setActive] = useState(false);

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
      selectedIds,
      selectedRoomId,
      groupRoomIds,
      selectedRoomPartId,
      selectedGroupPartIds,
      selectedOpeningId,
      troubledIds,
      viewport: size,
      color: style.color,
      fontFamily: style.fontFamily,
      drawnPart,
      underlayHandles: resizableUnderlay,
      measuredId: movingId,
      measuredGroupIds: movingGroupIds,
      ghost,
      unit,
    });
  }, [
    floor,
    furniture,
    unit,
    movingId,
    movingGroupIds,
    ghost,
    selectedIds,
    selectedRoomId,
    groupRoomIds,
    selectedRoomPartId,
    selectedGroupPartIds,
    selectedOpeningId,
    troubledIds,
    size,
    projection,
    drawnPart,
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
    if (!canvas) {
      return;
    }
    // Over the plan is enough: two fingers on a trackpad move the drawing
    // the way they would move a map, without clicking into it first, and a
    // pinch zooms it. Left to the browser, the one would scroll and the
    // other would zoom the page instead — hence a listener React cannot
    // give us, since its own wheel handlers are passive.
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

    // A scroll pans down the plan; with Shift it pans across it. Most
    // browsers already hand a Shift notch over as sideways, and the ones
    // that do not get it turned here, so the two agree.
    const dx = event.deltaX ?? 0;
    const dy = event.deltaY ?? 0;
    const [acrossBy, downBy] = event.shiftKey && dx === 0 ? [dy, 0] : [dx, dy];
    setView(held(panBy(current, -acrossBy, -downBy)));
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
    // A zoom asked for anywhere on the page is a zoom of the plan: the
    // browser would otherwise zoom the whole page, which nobody wants in a
    // drawing tool, and a hand that has drifted to the panel is still
    // looking at the plan. It zooms about the plan's middle, since the
    // pointer is not on it.
    const anywhere = (event: globalThis.WheelEvent) => {
      if (
        !(event.ctrlKey || event.metaKey) ||
        canvas.contains(event.target as Node)
      ) {
        return;
      }
      const box = canvas.getBoundingClientRect();
      wheelRef.current({
        ctrlKey: true,
        deltaY: event.deltaY,
        deltaX: 0,
        clientX: box.left + box.width / 2,
        clientY: box.top + box.height / 2,
        preventDefault: () => event.preventDefault(),
      });
    };
    window.addEventListener("wheel", anywhere, { passive: false });
    // Safari reports a trackpad pinch as its own gesture events as well, and
    // zooms the page on them unless they are cancelled. The wheel event it
    // also sends, with Ctrl held, is the one that zooms the plan.
    const swallow = (event: Event) => event.preventDefault();
    for (const name of ["gesturestart", "gesturechange", "gestureend"]) {
      window.addEventListener(name, swallow, { passive: false });
    }
    return () => {
      canvas.removeEventListener("wheel", listener);
      window.removeEventListener("wheel", anywhere);
      for (const name of ["gesturestart", "gesturechange", "gestureend"]) {
        window.removeEventListener(name, swallow);
      }
    };
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

    // Product placement is one click: the ghost has been showing where it
    // would land, and this is the yes. One piece per press, then out of the
    // mode, for the reason drawing a room is.
    if (placingProduct !== null) {
      onPlaceProduct?.(placingProduct, landingPoint(placingProduct, point));
      onPlaceProductEnd?.();
      setGhostAt(null);
      canvas.focus();
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
        setResizing({ roomId: grabbed.roomId, partId: grabbed.partId });
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

    // Space held, Shift held, or the middle button: the view moves instead
    // of anything in it. A plain drag on open floor used to pan too; it
    // draws a selection rectangle now, and scrolling pans. A Shift press that
    // never becomes a drag is a click, which puts what it hit in or out of
    // the group — decided on release, once it is known which it was.
    if (panningRef.current || event.shiftKey || event.button === 1) {
      const pixel = { x: event.clientX - box.left, y: event.clientY - box.top };
      dragRef.current = {
        kind: "pan",
        pointerId: event.pointerId,
        from: pixel,
        fromPixel: pixel,
        toggle: !event.shiftKey
          ? undefined
          : hit !== null
            ? { kind: "instance", id: hit.instance.id }
            : room !== null
              ? { kind: "room", id: room.id }
              : undefined,
      };
      setCursor("panning");
      canvas.setPointerCapture?.(event.pointerId);
      return;
    }

    /** Begins moving everything selected, led by what was grabbed. */
    const startGroupDrag = (
      leader: Extract<Drag, { kind: "group" }>["leader"],
      instanceIds: readonly string[] = selectedIds,
    ) => {
      dragRef.current = {
        kind: "group",
        pointerId: event.pointerId,
        fromPixel: { x: event.clientX - box.left, y: event.clientY - box.top },
        from: point,
        leader,
        hold: NO_HOLD,
        instanceOrigins: new Map(
          furniture
            .filter(({ instance }) => instanceIds.includes(instance.id))
            .map(({ instance }) => [instance.id, instance.position]),
        ),
        roomOrigins: new Map(
          floor.rooms
            .filter((one) => groupRoomIds.includes(one.id))
            .map((one) => [one.id, roomBounds(one).origin]),
        ),
      };
      if (leader.kind === "instance") {
        setMovingId(leader.id);
        setMovingGroupIds(instanceIds);
      }
      setCursor("move");
      canvas.focus();
      canvas.setPointerCapture?.(event.pointerId);
    };
    const groupSize = selectedIds.length + groupRoomIds.length;
    if (
      hit !== null &&
      groupSize > 1 &&
      selectedIds.includes(hit.instance.id)
    ) {
      startGroupDrag({ kind: "instance", id: hit.instance.id });
      return;
    }
    // A piece kept in a group is grabbed as the group, the first time and
    // every time: the whole point of the group is that the rug comes with
    // the sofa. The list is where one of them is picked out on its own.
    const kept = hit === null ? undefined : groupOf(groups, hit.instance.id);
    if (hit !== null && kept !== undefined && kept.instanceIds.length > 1) {
      onSelect(kept.instanceIds, []);
      startGroupDrag(
        { kind: "instance", id: hit.instance.id },
        kept.instanceIds,
      );
      return;
    }
    if (
      hit === null &&
      room !== null &&
      groupSize > 1 &&
      groupRoomIds.includes(room.id)
    ) {
      startGroupDrag({ kind: "room", id: room.id });
      return;
    }

    // Open floor: a rectangle, selecting what it touches. A click that never
    // becomes a rectangle selects nothing, which is what a click on open
    // floor always did.
    if (hit === null && room === null) {
      dragRef.current = {
        kind: "marquee",
        pointerId: event.pointerId,
        fromPixel: { x: event.clientX - box.left, y: event.clientY - box.top },
        from: point,
      };
      setCursor("none");
      canvas.focus();
      canvas.setPointerCapture?.(event.pointerId);
      return;
    }

    if (hit === null && room !== null) {
      // A selected group is picked up by any of its sections, and stays
      // selected as a group while it moves; a selected section is picked up
      // by whichever section was pressed.
      const grouped =
        room.id === selectedRoomId && selectedGroupPartIds.length > 0;
      const under =
        room.id === selectedRoomId && (selectedRoomPartId !== null || grouped)
          ? roomPartAt(room, point)
          : null;
      const part =
        under !== null && (!grouped || selectedGroupPartIds.includes(under.id))
          ? under
          : null;
      if (part !== null) {
        if (!grouped) {
          onSelectRoomPart?.(room.id, part.id);
        }
        dragRef.current = {
          kind: "part",
          pointerId: event.pointerId,
          roomId: room.id,
          partId: part.id,
          grabOffset: {
            xMeters: point.xMeters - part.origin.xMeters,
            zMeters: point.zMeters - part.origin.zMeters,
          },
          withGroup: grouped,
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

    onSelect([hit.instance.id], []);
    dragRef.current = {
      kind: "move",
      pointerId: event.pointerId,
      instanceId: hit.instance.id,
      grabOffset: {
        xMeters: point.xMeters - hit.instance.position.xMeters,
        zMeters: point.zMeters - hit.instance.position.zMeters,
      },
      hold: NO_HOLD,
    };
    setCursor("move");
    setMovingId(hit.instance.id);
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
    // Space or Shift held: the hand, wherever the pointer is. Without them
    // open floor draws a rectangle, which no hand should promise.
    if (panningRef.current || event.shiftKey) {
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
    // Floor with nothing on it is where a drag draws the selection
    // rectangle: the plain arrow, as any tool that selects by rectangle.
    return roomsAt(floor, point).length > 0 ? "move" : "none";
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>): void {
    const drag = dragRef.current;
    const canvas = canvasRef.current;

    if (canvas && placingProduct !== null) {
      const point = floorPointAt(canvas, event, projectionRef.current);
      setGhostAt(point === null ? null : landingPoint(placingProduct, point));
      return;
    }

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
      // rounded to the unit on screen, with nothing to axis-snap to. Only the
      // section itself can be dragged that way: a room outline handle belongs
      // to whichever sections stand on that edge, which a turned one never
      // does.
      const turnedPart =
        drag.partId === null
          ? sizing.parts.length === 1
            ? primaryRoomPart(sizing)
            : undefined
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
      // The length between the walls lands on the unit on screen, so a
      // dragged wall leaves the same kind of number a typed one does — and
      // the opposite wall, wherever it stands, is what it is measured from.
      const next = drag.edges.reduce((room, edge) => {
        const horizontal = edge === "west" || edge === "east";
        const pointer = horizontal ? point.xMeters : point.zMeters;
        const sized =
          drag.partId === null
            ? undefined
            : sizing.parts.find((one) => one.id === drag.partId);
        const fixed =
          sized === undefined
            ? roomEdgePosition(room, OPPOSITE_EDGE[edge])
            : partEdgePosition(sized, OPPOSITE_EDGE[edge]);
        const target = roundedResizeTarget(fixed, pointer, (m) =>
          roundToDisplayUnit(m, unit),
        );
        return drag.partId === null
          ? snapRoomResize(floor, room, edge, target)
          : snapRoomPartResize(floor, room, drag.partId, edge, target);
      }, sizing);
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
      // When the group was what got picked up, its other sections go by
      // the same amount: a closet is moved as a closet. A section selected
      // on its own moves on its own.
      const delta = {
        xMeters: origin.xMeters - part.origin.xMeters,
        zMeters: origin.zMeters - part.origin.zMeters,
      };
      const moved = (drag.withGroup ? groupMates(room, part) : []).reduce(
        (next, mate) =>
          withRoomPartOrigin(next, mate.id, {
            xMeters: mate.origin.xMeters + delta.xMeters,
            zMeters: mate.origin.zMeters + delta.zMeters,
          }),
        withRoomPartOrigin(room, part.id, origin),
      );
      onRoomChange?.(moved, `room-part-move:${part.id}`);
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
          // Whole inches, as a dragged section lands; a snap to a
          // neighbour's wall still wins, being exact contact.
          snapRoomOrigin(floor, moving, {
            xMeters: roundToDisplayUnit(
              point.xMeters - drag.grabOffset.xMeters,
              unit,
            ),
            zMeters: roundToDisplayUnit(
              point.zMeters - drag.grabOffset.zMeters,
              unit,
            ),
          }),
        ),
        `room-move:${drag.roomId}`,
      );
      return;
    }

    if (drag.kind === "draw") {
      const to = floorPointAt(canvas, event, projectionRef.current);
      setDrawn(to === null ? null : { from: drag.from, to });
      return;
    }

    if (drag.kind === "group") {
      const point = floorPointAt(canvas, event, projectionRef.current);
      if (point !== null) {
        moveGroup(drag, point, event.altKey);
      }
      return;
    }

    if (drag.kind === "marquee") {
      const box = canvas.getBoundingClientRect();
      setMarquee({
        from: drag.fromPixel,
        to: { x: event.clientX - box.left, y: event.clientY - box.top },
      });
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

    const dropped = {
      xMeters: point.xMeters - drag.grabOffset.xMeters,
      zMeters: point.zMeters - drag.grabOffset.zMeters,
    };
    // Against the nearest wall or piece if one is close, and held there
    // until pulled clearly away — unless Alt is held, which is the way to
    // put a piece exactly where the pointer says.
    let landed = dropped;
    if (!event.altKey) {
      const snapped = heldSnap(
        dropped,
        snapInstancePosition(floor, furniture, placed, dropped, snapReach()),
        drag.hold,
        holdReach(),
      );
      landed = snapped.value;
      dragRef.current = { ...drag, hold: snapped.hold };
    }
    onInstanceChange(
      moveInstance(placed.instance, clampToFloor(floor, landed)),
      `piece-move:${drag.instanceId}`,
    );
  }

  /**
   * Moves everything in the group by the leader's move.
   *
   * The leader lands the way it would on its own — a piece against the
   * nearest wall or piece, a room against a neighbour's wall — and the rest
   * follow by exactly that much, so what was flush stays flush and what was
   * a foot apart stays a foot apart.
   */
  function moveGroup(
    drag: Extract<Drag, { kind: "group" }>,
    point: FloorPoint,
    altKey: boolean,
  ): void {
    const raw = {
      xMeters: point.xMeters - drag.from.xMeters,
      zMeters: point.zMeters - drag.from.zMeters,
    };
    let delta = raw;
    if (drag.leader.kind === "instance") {
      // The group's outline is what lands, so a sectional goes against the
      // wall as a sectional and its seats never catch on one another.
      // The offset is from where the drag began, so the members are offered
      // where they began too — not where the last move left them.
      const atStart = furniture.map((placed) => {
        const origin = drag.instanceOrigins.get(placed.instance.id);
        return origin === undefined
          ? placed
          : { ...placed, instance: moveInstance(placed.instance, origin) };
      });
      if (!altKey) {
        const snapped = heldSnap(
          raw,
          snapGroupDelta(
            floor,
            atStart,
            [...drag.instanceOrigins.keys()],
            raw,
            snapReach(),
          ),
          drag.hold,
          holdReach(),
        );
        delta = snapped.value;
        dragRef.current = { ...drag, hold: snapped.hold };
      }
      // On an axis nothing snapped to, the piece picked up lands on a whole
      // inch and the rest keep their places around it. A snap is left alone:
      // flush against a wall is exact, whatever the inch says.
      const leaderAt = drag.instanceOrigins.get(drag.leader.id);
      if (leaderAt !== undefined) {
        const whole = (at: number, moved: number) =>
          roundToDisplayUnit(at + moved, unit) - at;
        delta = {
          xMeters:
            delta.xMeters === raw.xMeters
              ? whole(leaderAt.xMeters, raw.xMeters)
              : delta.xMeters,
          zMeters:
            delta.zMeters === raw.zMeters
              ? whole(leaderAt.zMeters, raw.zMeters)
              : delta.zMeters,
        };
      }
    } else {
      const leader = floor.rooms.find((one) => one.id === drag.leader.id);
      const origin = drag.roomOrigins.get(drag.leader.id);
      if (leader !== undefined && origin !== undefined) {
        const landed = snapRoomOrigin(floor, leader, {
          xMeters: roundToDisplayUnit(origin.xMeters + raw.xMeters, unit),
          zMeters: roundToDisplayUnit(origin.zMeters + raw.zMeters, unit),
        });
        delta = {
          xMeters: landed.xMeters - origin.xMeters,
          zMeters: landed.zMeters - origin.zMeters,
        };
      }
    }

    const gesture = `group-move:${drag.leader.id}`;
    const rooms = floor.rooms.flatMap((one) => {
      const origin = drag.roomOrigins.get(one.id);
      return origin === undefined
        ? []
        : [
            withOrigin(one, {
              xMeters: origin.xMeters + delta.xMeters,
              zMeters: origin.zMeters + delta.zMeters,
            }),
          ];
    });
    if (rooms.length > 0) {
      onRoomsChange?.(rooms, gesture);
    }
    const instances = furniture.flatMap(({ instance }) => {
      const origin = drag.instanceOrigins.get(instance.id);
      return origin === undefined
        ? []
        : [
            moveInstance(instance, {
              xMeters: origin.xMeters + delta.xMeters,
              zMeters: origin.zMeters + delta.zMeters,
            }),
          ];
    });
    if (instances.length > 0) {
      onInstancesChange?.(instances, gesture);
    }
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
      placingProduct !== null ||
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
    if (event.key === "Shift" && dragRef.current === null) {
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
      setDrawn(null);
      setCursor("none");
      canvas?.releasePointerCapture?.(event.pointerId);
      // One room, then out of the mode. Staying armed reads like a saving —
      // an apartment is fifteen rooms — but the thing anybody does straight
      // after drawing a room is adjust it, and a plan that answers that by
      // drawing another room on top fights every attempt.
      onDrawEnd?.();
      return;
    }

    if (drag.kind === "marquee") {
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
      if (
        to === null ||
        to === undefined ||
        travelled < DRAW_THRESHOLD_PIXELS
      ) {
        onSelect([], []);
      } else {
        onSelect(
          furniture
            .filter((placed) => rectTouches(placed, drag.from, to))
            .map(({ instance }) => instance.id),
          floor.rooms
            .filter((one) => boundsTouch(roomBounds(one), drag.from, to))
            .map((one) => one.id),
        );
      }
      dragRef.current = null;
      setMarquee(null);
      canvas?.releasePointerCapture?.(event.pointerId);
      return;
    }

    if (drag.kind === "pan" && drag.toggle !== undefined) {
      const box = canvasRef.current?.getBoundingClientRect();
      const from = drag.fromPixel ?? drag.from;
      const travelled =
        box === undefined
          ? 0
          : Math.hypot(
              event.clientX - box.left - from.x,
              event.clientY - box.top - from.y,
            );
      if (travelled < DRAW_THRESHOLD_PIXELS) {
        const { kind, id } = drag.toggle;
        const has = (ids: readonly string[]) => ids.includes(id);
        const flip = (ids: readonly string[]) =>
          has(ids) ? ids.filter((one) => one !== id) : [...ids, id];
        // A room on its own joins the group too, so Shift-clicking a room
        // and then a piece makes a group of both.
        const rooms =
          groupRoomIds.length === 0 && selectedRoomId !== null
            ? [selectedRoomId]
            : groupRoomIds;
        onSelect(
          kind === "instance" ? flip(selectedIds) : selectedIds,
          kind === "room" ? flip(rooms) : rooms,
        );
      }
    }

    // A press on one thing in a group that never became a drag picks that
    // thing out of the group, the way a click always selected what was hit.
    if (drag.kind === "group") {
      const box = canvasRef.current?.getBoundingClientRect();
      const travelled =
        box === undefined
          ? 0
          : Math.hypot(
              event.clientX - box.left - drag.fromPixel.x,
              event.clientY - box.top - drag.fromPixel.y,
            );
      if (travelled < DRAW_THRESHOLD_PIXELS) {
        if (drag.leader.kind === "instance") {
          onSelect([drag.leader.id], []);
        } else {
          onSelect([], [drag.leader.id]);
        }
      }
    }

    dragRef.current = null;
    setCursor("none");
    setMovingId(null);
    setMovingGroupIds([]);
    setResizing(null);
    canvasRef.current?.releasePointerCapture?.(event.pointerId);
    onGestureEnd?.();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLCanvasElement>): void {
    if (pressIs("deselect", event)) {
      if (drawing || placingOpening !== null || placingProduct !== null) {
        // Called off rather than deselecting: in this mode Escape is the way
        // out of the mode, which is the nearer of the two things it could mean.
        dragRef.current = null;
        setDrawn(null);
        setGhostAt(null);
        if (drawing) {
          onDrawEnd?.();
        } else if (placingOpening !== null) {
          onPlaceOpeningEnd?.();
        } else {
          onPlaceProductEnd?.();
        }
        return;
      }
      if (dragRef.current?.kind === "marquee") {
        dragRef.current = null;
        setMarquee(null);
      }
      onSelect([], []);
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
    if (event.key === "Shift" && dragRef.current === null) {
      setCursor("pan");
      return;
    }

    const chosen = furniture.filter(({ instance }) =>
      selectedIds.includes(instance.id),
    );
    const moved = chosen.map(({ instance }) =>
      instanceFromKeyPress(floor, instance, event),
    );
    const first = moved[0];
    if (first === undefined || first === null) {
      return;
    }
    // Only once a key has been acted on: an arrow with nothing selected still
    // scrolls the page, which is what an arrow normally does.
    event.preventDefault();
    const gesture = `piece-key:${selectedIds.join(",")}`;
    if (moved.length === 1 && groupRoomIds.length === 0) {
      onInstanceChange(first, gesture);
      return;
    }
    onInstancesChange?.(
      moved.filter((one): one is FurnitureInstance => one !== null),
      gesture,
    );
    // The rooms go by the same step the pieces did.
    const leader = chosen[0]?.instance;
    if (leader !== undefined && groupRoomIds.length > 0) {
      const delta = {
        xMeters: first.position.xMeters - leader.position.xMeters,
        zMeters: first.position.zMeters - leader.position.zMeters,
      };
      onRoomsChange?.(
        floor.rooms
          .filter((one) => groupRoomIds.includes(one.id))
          .map((one) => {
            const origin = roomBounds(one).origin;
            return withOrigin(one, {
              xMeters: origin.xMeters + delta.xMeters,
              zMeters: origin.zMeters + delta.zMeters,
            });
          }),
        gesture,
      );
    }
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
                className="pointer-events-none absolute max-w-none"
                style={{
                  opacity: underlayOpacity,
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
        aria-label={describeFloor(floor, furniture, unit, productUnit)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={handleDoubleClick}
        onPointerLeave={() => setGhostAt(null)}
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
          drawing || placingOpening !== null || placingProduct !== null
            ? "cursor-crosshair"
            : CURSORS[cursor]
        }`}
      />

      {/*
        Everything said over the plan, in a layer that stops where the details
        panel starts while it is open. Anchored to the canvas instead, the
        corner readout and the centred hints sat under the panel. The layer
        starts at the canvas's own top-left, so what is placed by pixel — the
        size beside a dragged corner, the selection rectangle — stays put.
      */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0"
        style={{ right: panelOpen ? PANEL_RESERVE_PIXELS : 0 }}
      >
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

        {/* How big the room will be, beside the corner being dragged. Said as
            the drag goes rather than after it lands, because the tape says
            11' by 14' and the hand has nothing else to go by. */}
        {drawnPart === null ? null : (
          <DrawnSize part={drawnPart} projection={projection} unit={unit} />
        )}
        {resizedPart === null ? null : (
          <DrawnSize part={resizedPart} projection={projection} unit={unit} />
        )}

        {placingOpening === null ? null : (
          <p className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/70 px-4 py-1.5 text-[13px] text-white dark:bg-white/15">
            Click the wall for the {placingOpening.kind}. Esc to stop.
          </p>
        )}

        {placingProduct === null ? null : (
          <p className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/70 px-4 py-1.5 text-[13px] text-white dark:bg-white/15">
            Click where {placingProduct.name} goes. Esc to stop.
          </p>
        )}

        {marquee === null ? null : (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute border border-dashed border-current bg-current/10 opacity-70"
            style={{
              left: Math.min(marquee.from.x, marquee.to.x),
              top: Math.min(marquee.from.y, marquee.to.y),
              width: Math.abs(marquee.to.x - marquee.from.x),
              height: Math.abs(marquee.to.y - marquee.from.y),
            }}
          />
        )}

        {/* Said once, where it is needed, and gone as soon as it is not — and
            never on an empty floor, where the invitation in the middle of the
            canvas is already saying something more useful. */}
        {active ||
        drawing ||
        placingOpening !== null ||
        placingProduct !== null ||
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

  // A room of several sections with none of them selected: the handles are the
  // room's own outline walls, and they move whichever sections stand on them.
  if (part === undefined) {
    for (const handle of roomHandles(room)) {
      const point = projectPoint(projection, handle.at);
      if (
        Math.abs(point.x - at.x) <= HANDLE_GRAB_PIXELS &&
        Math.abs(point.y - at.y) <= HANDLE_GRAB_PIXELS
      ) {
        return {
          kind: "resize",
          roomId: room.id,
          partId: null,
          edges: handle.edges,
        };
      }
    }
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
  const spare = viewport.width - PANEL_RESERVE_PIXELS;
  const fitInto =
    spare > PLAN_PADDING_PIXELS * 2 ? { ...viewport, width: spare } : viewport;
  return createPlanProjection(extent, fitInto, PLAN_PADDING_PIXELS, origin);
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
  productUnit: DisplayUnit,
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

  return `${shell} ${describeFurniture(furniture, unit, productUnit)}`;
}

/** One room: how big it is, where it stands, and what is cut into its walls. */
function describeRoom(room: Room, unit: DisplayUnit): string {
  const name = room.name === "" ? "an unnamed room" : room.name;
  const bounds = roomBounds(room);
  const size =
    room.parts.length === 1
      ? `${formatLength(bounds.widthMeters, unit)} wide by ` +
        `${formatLength(bounds.depthMeters, unit)} long`
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
  productUnit: DisplayUnit,
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
        `${names[index]}, ${formatLength(product.footprint.widthMeters, productUnit)} by ` +
        `${formatLength(product.footprint.depthMeters, productUnit)}, ` +
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
  selectedIds: readonly string[];
  selectedRoomId: string | null;
  groupRoomIds?: readonly string[];
  selectedRoomPartId: string | null;
  selectedGroupPartIds?: readonly string[];
  selectedOpeningId: string | null;
  troubledIds: ReadonlySet<string>;
  viewport: PixelSize;
  color: string;
  fontFamily: string;
  /** A room being dragged out right now, drawn as an outline over everything. */
  drawnPart?: DrawnPart | null;
  /** The underlay whose corners can be dragged, or null when none can. */
  underlayHandles?: PlanUnderlay | null;
  /** The piece whose gaps to the walls are drawn and printed, if any. */
  measuredId?: string | null;
  /** When more than one piece moves together, the gaps are the group's. */
  measuredGroupIds?: readonly string[];
  /** A product about to be placed, drawn where it would land. */
  ghost?: PlacedFurniture | null;
  unit: DisplayUnit;
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
    selectedIds,
    selectedRoomId,
    groupRoomIds = [],
    selectedRoomPartId,
    selectedGroupPartIds = NO_IDS,
    selectedOpeningId,
    troubledIds,
    viewport,
    color,
    fontFamily,
    drawnPart = null,
    underlayHandles = null,
    measuredId = null,
    measuredGroupIds = [],
    ghost = null,
    unit,
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
    drawRoomWalls(context, frame, floor, room, { dividing: false });
  }
  for (const room of floor.rooms) {
    punchRoomFloor(context, frame, room);
  }
  for (const room of floor.rooms) {
    drawMeterGrid(context, frame, room);
  }
  // Walls standing inside a room's own floor come after the punch, for the
  // reason the railings do: the clear that opens the floor up would take them
  // straight back out again.
  for (const room of floor.rooms) {
    drawRoomWalls(context, frame, floor, room, { dividing: true });
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
    drawOpeningRuns(
      context,
      inRoom(frame, selectedOpening.room),
      selectedOpening.room,
      selectedOpening.opening,
      unit,
      fontFamily,
    );
  }

  for (const room of floor.rooms) {
    drawRoomName(context, frame, room, fontFamily);
    if (selectedGroupPartIds.length > 0 && room.id === selectedRoomId) {
      markSelectedGroup(context, frame, room, selectedGroupPartIds);
    } else if (room.id === selectedRoomId || groupRoomIds.includes(room.id)) {
      markSelectedRoom(context, frame, room, selectedRoomPartId);
    }
  }

  for (const placed of furniture) {
    drawFurniture(context, frame, placed, {
      selected: selectedIds.includes(placed.instance.id),
      troubled: troubledIds.has(placed.instance.id),
    });
  }
  if (ghost !== null) {
    drawFurniture(context, frame, ghost, {
      selected: false,
      troubled: false,
      ghost: true,
    });
    drawWallGaps(
      context,
      frame,
      nearestGaps(floor, furniture, ghost),
      unit,
      fontFamily,
    );
  }

  // The gaps from the piece being dragged to the walls around it, over the
  // furniture so the numbers are never under a neighbour.
  const measured = furniture.find(({ instance }) => instance.id === measuredId);
  if (measuredGroupIds.length > 1) {
    drawWallGaps(
      context,
      frame,
      groupGaps(floor, furniture, measuredGroupIds),
      unit,
      fontFamily,
    );
  } else if (measured !== undefined) {
    drawWallGaps(
      context,
      frame,
      nearestGaps(floor, furniture, measured),
      unit,
      fontFamily,
    );
  }

  // Last, over everything: it is the thing being made right now.
  if (drawnPart !== null) {
    drawRoomPreview(context, frame, drawnPart);
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
/** The rectangle a drag would leave: where it starts and how far it runs. */
type DrawnPart = {
  readonly origin: FloorPoint;
  readonly widthMeters: number;
  readonly depthMeters: number;
};

function drawRoomPreview(
  context: CanvasRenderingContext2D,
  frame: PlanFrame,
  part: DrawnPart,
): void {
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

/** The width and length of the room being drawn, pinned to its far corner. */
function DrawnSize({
  part,
  projection,
  unit,
}: {
  part: DrawnPart;
  projection: PlanProjection;
  unit: DisplayUnit;
}) {
  const corner = projectPoint(projection, {
    xMeters: part.origin.xMeters + part.widthMeters,
    zMeters: part.origin.zMeters + part.depthMeters,
  });
  return (
    <p
      aria-label="Room being drawn"
      // Inside the far corner rather than beyond it, so it stays on screen
      // when the drag reaches the edge of the plan — which a big room does.
      className="pointer-events-none absolute flex -translate-x-full -translate-y-full flex-col rounded-lg bg-black/70 px-2.5 py-1 font-mono text-[13px] tabular-nums whitespace-nowrap text-white/90 dark:bg-white/10"
      style={{ left: corner.x - 8, top: corner.y - 8 }}
    >
      <span className="flex justify-between gap-3">
        <span className="opacity-60">Width</span>
        <span>{formatLength(part.widthMeters, unit)}</span>
      </span>
      <span className="flex justify-between gap-3">
        <span className="opacity-60">Length</span>
        <span>{formatLength(part.depthMeters, unit)}</span>
      </span>
    </p>
  );
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
  { dividing }: { dividing: boolean },
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
      // One pass for the walls round the outside of the room and one for the
      // walls across the middle of it, because the floor is cleared between
      // them. Corners still mitre across the two: every side's stretches are
      // worked out here whichever pass draws them.
      for (const wall of partWallSides(part).filter(
        (one) => isWallDividing(part, one) === dividing,
      )) {
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
  // One rectangle is on all four of its own edges, so it keeps the eight
  // handles it has always had, corners included.
  if (room.parts.length === 1) {
    return roomPartHandles(primaryRoomPart(room));
  }

  // A room built from several rectangles gets its four outline walls and no
  // corners. A corner of the outline can hang in mid-air — the inside corner
  // of an L is nobody's corner — and a handle floating off the drawing is a
  // worse answer than not offering one. The sections keep their own eight.
  return (["north", "east", "south", "west"] as const).flatMap((edge) => {
    const alongWidth = edge === "north" || edge === "south";
    const on = partsOnRoomEdge(room, edge);
    // The widest section on the edge, so the grab is always on a real wall
    // rather than in a gap between two sections that share the edge.
    const widest = on.reduce<RoomPart | null>(
      (best, part) =>
        best === null ||
        spanAlong(part, alongWidth) > spanAlong(best, alongWidth)
          ? part
          : best,
      null,
    );
    if (widest === null) {
      return [];
    }
    const middle =
      startAlong(widest, alongWidth) + spanAlong(widest, alongWidth) / 2;
    const at = roomEdgePosition(room, edge);
    return [
      {
        edges: [edge],
        at: alongWidth
          ? { xMeters: middle, zMeters: at }
          : { xMeters: at, zMeters: middle },
      },
    ];
  });
}

function spanAlong(part: RoomPart, alongWidth: boolean): number {
  return alongWidth ? part.widthMeters : part.depthMeters;
}

function startAlong(part: RoomPart, alongWidth: boolean): number {
  return alongWidth ? part.origin.xMeters : part.origin.zMeters;
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
/**
 * A selected group of sections: each member outlined, as the room's own
 * sections are, and no resize handles — the group is picked up and moved
 * as one; a member is resized by selecting it on its own.
 */
function markSelectedGroup(
  context: CanvasRenderingContext2D,
  frame: PlanFrame,
  room: Room,
  partIds: readonly string[],
): void {
  const pixelsPerMeter = spanPixels(frame, 1);
  context.save();
  context.fillStyle = frame.color;
  context.strokeStyle = frame.color;
  context.lineWidth = 2;
  context.setLineDash([6, 4]);
  for (const part of room.parts.filter((one) => partIds.includes(one.id))) {
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
  context.restore();
}

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

/** How far the run dimension sits in from its wall, in pixels. */
const RUN_INSET_PIXELS = 14;

/**
 * How much wall is left either side of the selected opening.
 *
 * An opening is placed by its center, but the numbers a person checks are
 * the two runs it leaves: whether a dresser still fits beside the door.
 * Each run is drawn just inside its wall, from the corner to the jamb, with
 * its length printed on it. A run of nothing — an opening flush with a
 * corner — is left out.
 */
function drawOpeningRuns(
  context: CanvasRenderingContext2D,
  frame: PlanFrame,
  room: Room,
  opening: Opening,
  unit: DisplayUnit,
  fontFamily: string,
): void {
  const length = wallLengthMeters(room, opening.wall, opening.partId);
  const { startMeters, endMeters } = openingRangeMeters(opening);
  const along = (meters: number) =>
    frame.toPixels(pointAlongWall(room, opening.wall, meters, opening.partId));
  // Inward is toward the part's own middle, which is where the floor is —
  // found through the same walk along the walls the runs use, so the two
  // agree on where things are.
  const sides = ["north", "east", "south", "west"] as const;
  const midpoints = sides.map((side) =>
    frame.toPixels(
      pointAlongWall(
        room,
        side,
        wallLengthMeters(room, side, opening.partId) / 2,
        opening.partId,
      ),
    ),
  );
  const middle = {
    x: midpoints.reduce((sum, point) => sum + point.x, 0) / midpoints.length,
    y: midpoints.reduce((sum, point) => sum + point.y, 0) / midpoints.length,
  };

  context.save();
  context.strokeStyle = frame.color;
  context.fillStyle = frame.color;
  context.lineWidth = 1;
  context.font = `${LABEL_PIXELS}px ${fontFamily}`;
  context.textAlign = "center";
  context.textBaseline = "middle";

  for (const [fromMeters, toMeters] of [
    [0, startMeters],
    [endMeters, length],
  ] as const) {
    if (toMeters - fromMeters < FLUSH_METERS) {
      continue;
    }
    const a = along(fromMeters);
    const b = along(toMeters);
    const run = Math.hypot(b.x - a.x, b.y - a.y);
    if (run === 0) {
      continue;
    }
    // Unit normal to the wall, turned to point at the floor.
    let nx = -(b.y - a.y) / run;
    let ny = (b.x - a.x) / run;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if ((middle.x - mid.x) * nx + (middle.y - mid.y) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    const inset = (point: PixelPoint) => ({
      x: point.x + nx * RUN_INSET_PIXELS,
      y: point.y + ny * RUN_INSET_PIXELS,
    });
    const from = inset(a);
    const to = inset(b);

    context.globalAlpha = 0.8;
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    for (const end of [from, to]) {
      context.moveTo(
        end.x - nx * GAP_TICK_PIXELS,
        end.y - ny * GAP_TICK_PIXELS,
      );
      context.lineTo(
        end.x + nx * GAP_TICK_PIXELS,
        end.y + ny * GAP_TICK_PIXELS,
      );
    }
    context.stroke();

    context.globalAlpha = 1;
    context.fillText(
      formatLength(toMeters - fromMeters, unit),
      (from.x + to.x) / 2 + nx * 10,
      (from.y + to.y) / 2 + ny * 10,
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
  {
    selected,
    troubled,
    ghost = false,
  }: { selected: boolean; troubled: boolean; ghost?: boolean },
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
  // Dashed, because it is not placed yet — the same mark a room gets while
  // it is being drawn.
  if (ghost) {
    context.setLineDash([6, 4]);
  }
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

/** Whether an axis-aligned box reaches into the rectangle between two points. */
function boundsTouch(
  bounds: { origin: FloorPoint; widthMeters: number; depthMeters: number },
  from: FloorPoint,
  to: FloorPoint,
): boolean {
  return (
    bounds.origin.xMeters <= Math.max(from.xMeters, to.xMeters) &&
    bounds.origin.xMeters + bounds.widthMeters >=
      Math.min(from.xMeters, to.xMeters) &&
    bounds.origin.zMeters <= Math.max(from.zMeters, to.zMeters) &&
    bounds.origin.zMeters + bounds.depthMeters >=
      Math.min(from.zMeters, to.zMeters)
  );
}

/** Whether a piece's footprint reaches into the rectangle between two points. */
function rectTouches(
  placed: PlacedFurniture,
  from: FloorPoint,
  to: FloorPoint,
): boolean {
  const corners = orientedRectCorners(footprintRect(placed));
  const xs = corners.map((corner) => corner.xMeters);
  const zs = corners.map((corner) => corner.zMeters);
  return (
    Math.min(...xs) <= Math.max(from.xMeters, to.xMeters) &&
    Math.max(...xs) >= Math.min(from.xMeters, to.xMeters) &&
    Math.min(...zs) <= Math.max(from.zMeters, to.zMeters) &&
    Math.max(...zs) >= Math.min(from.zMeters, to.zMeters)
  );
}

const OPPOSITE_EDGE: Record<RoomEdge, RoomEdge> = {
  west: "east",
  east: "west",
  north: "south",
  south: "north",
};

/** Where one edge of a square part stands on its axis. */
function partEdgePosition(part: RoomPart, edge: RoomEdge): number {
  switch (edge) {
    case "west":
      return part.origin.xMeters;
    case "east":
      return part.origin.xMeters + part.widthMeters;
    case "north":
      return part.origin.zMeters;
    case "south":
      return part.origin.zMeters + part.depthMeters;
  }
}

/** How far a gap's end ticks reach either side of the line, in pixels. */
const GAP_TICK_PIXELS = 4;

/** A gap this small is flush, and flush needs no line. */
const FLUSH_METERS = 0.0005;

/**
 * The gaps from a piece to whatever is nearest on each side — the wall, or a
 * piece in the way — drawn as a line with a tick at either end and the
 * length printed beside it, the way a plan is dimensioned. A gap of nothing
 * is left out: a zero on the plan is noise, and the piece touching the wall
 * already shows it. A negative gap is a piece through the wall, which the
 * problem list already shouts about, so that line is left out too.
 */
function drawWallGaps(
  context: CanvasRenderingContext2D,
  frame: PlanFrame,
  gaps: readonly WallGap[],
  unit: DisplayUnit,
  fontFamily: string,
): void {
  context.save();
  context.strokeStyle = frame.color;
  context.fillStyle = frame.color;
  context.lineWidth = 1;
  context.font = `${LABEL_PIXELS}px ${fontFamily}`;
  context.textBaseline = "middle";

  for (const gap of gaps) {
    if (gap.gapMeters < FLUSH_METERS) {
      continue;
    }
    const horizontal = gap.side === "west" || gap.side === "east";
    const from = frame.toPixels(
      horizontal
        ? { xMeters: gap.edgeMeters, zMeters: gap.alongMeters }
        : { xMeters: gap.alongMeters, zMeters: gap.edgeMeters },
    );
    const to = frame.toPixels(
      horizontal
        ? { xMeters: gap.faceMeters, zMeters: gap.alongMeters }
        : { xMeters: gap.alongMeters, zMeters: gap.faceMeters },
    );

    context.globalAlpha = 0.8;
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    for (const end of [from, to]) {
      if (horizontal) {
        context.moveTo(end.x, end.y - GAP_TICK_PIXELS);
        context.lineTo(end.x, end.y + GAP_TICK_PIXELS);
      } else {
        context.moveTo(end.x - GAP_TICK_PIXELS, end.y);
        context.lineTo(end.x + GAP_TICK_PIXELS, end.y);
      }
    }
    context.stroke();

    // Beside the line rather than on it, so a short gap stays legible: above
    // a horizontal one, to the right of a vertical one.
    const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    context.globalAlpha = 1;
    context.textAlign = horizontal ? "center" : "left";
    context.fillText(
      formatLength(gap.gapMeters, unit),
      horizontal ? middle.x : middle.x + 6,
      horizontal ? middle.y - 9 : middle.y,
    );
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
  const hole = {
    y: Math.min(0, throughPixels) - 0.5,
    height: Math.abs(throughPixels) + 1,
  };
  context.clearRect(0, hole.y, length, hole.height);
  // A doorway is floor running through the wall, not a hole to the page:
  // tinted as the floor is, with the room's grid carried through it.
  context.globalAlpha = FLOOR_ALPHA;
  context.fillStyle = frame.color;
  context.fillRect(0, hole.y, length, hole.height);
  context.beginPath();
  context.rect(0, hole.y, length, hole.height);
  context.clip();
  context.rotate(-angle);
  context.translate(-a.x, -a.y);
  drawGridThrough(context, frame, room, wallPixels);
  context.restore();
}

/**
 * The room's grid lines, each run on past the floor's edge by a wall's
 * depth, so a doorway cut in that wall shows the grid passing through it.
 * Meant to be drawn under a clip to the doorway; unclipped it would mark
 * the walls.
 */
function drawGridThrough(
  context: CanvasRenderingContext2D,
  frame: PlanFrame,
  room: Room,
  wallPixels: number,
): void {
  context.globalAlpha = GRID_ALPHA;
  context.strokeStyle = frame.color;
  context.lineWidth = 1;
  context.beginPath();
  for (const line of roomGridLines(room)) {
    const from = frame.toPixels(line.from);
    const to = frame.toPixels(line.to);
    const run = Math.hypot(to.x - from.x, to.y - from.y);
    if (run <= 0) {
      continue;
    }
    const dx = ((to.x - from.x) / run) * wallPixels;
    const dy = ((to.y - from.y) / run) * wallPixels;
    if (line.from.xMeters === line.to.xMeters) {
      const x = Math.round(from.x) + 0.5;
      context.moveTo(x, from.y - dy);
      context.lineTo(x, to.y + dy);
    } else {
      const y = Math.round(from.y) + 0.5;
      context.moveTo(from.x - dx, y);
      context.lineTo(to.x + dx, y);
    }
  }
  context.stroke();
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

  // The wall's two faces carried across the opening as dashes, the way a
  // plan shows a wall interrupted rather than missing. At the wall's own
  // thickness, so the dashes say how deep the opening is.
  context.save();
  context.setLineDash(OPENING_DASH);
  strokeSegments(context, [
    [a, b],
    [through(a, 1), through(b, 1)],
  ]);
  context.restore();

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

  if (opening.style === "sliding") {
    // Two panels, one past the other along the wall: a slider reaches
    // nothing into the room, so there is nothing to sweep.
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const shift = (point: PixelPoint, by: number) => ({
      x: point.x + normal.dx * by,
      y: point.y + normal.dz * by,
    });
    context.globalAlpha = SYMBOL_ALPHA;
    context.lineWidth = 2;
    strokeSegments(context, [
      [shift(a, 2), shift(mid, 2)],
      [shift(mid, -2), shift(b, -2)],
    ]);
    return;
  }

  if (opening.style === "bifold") {
    // Each half folds back toward its jamb: two panels of a quarter width,
    // standing off the wall in a V. The pair meets in the middle, open.
    const along = {
      x: (farJamb.x - hinge.x) / widthPixels,
      y: (farJamb.y - hinge.y) / widthPixels,
    };
    const depth = widthPixels * BIFOLD_REACH * (reach < 0 ? -1 : 1);
    const at = (fraction: number, out: number) => ({
      x: hinge.x + along.x * widthPixels * fraction + normal.dx * depth * out,
      y: hinge.y + along.y * widthPixels * fraction + normal.dz * depth * out,
    });
    context.globalAlpha = SYMBOL_ALPHA;
    context.lineWidth = 2;
    strokeSegments(context, [
      [at(0, 0), at(0.125, 1)],
      [at(0.125, 1), at(0.25, 0)],
      [at(1, 0), at(0.875, 1)],
      [at(0.875, 1), at(0.75, 0)],
    ]);
    return;
  }

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
