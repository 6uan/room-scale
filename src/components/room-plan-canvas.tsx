"use client";

import { useEffect, useRef, useState } from "react";
import {
  createPlanProjection,
  projectLength,
  projectPoint,
  type FloorPoint,
  type PixelPoint,
  type PixelSize,
} from "@/domain/geometry";
import type { PlacedFurniture } from "@/domain/furniture";
import {
  checkOpening,
  openingEndpoints,
  wallOutwardNormal,
  type FloorVector,
  type Opening,
  type Room,
} from "@/domain/room";
import { formatLength, type DisplayUnit } from "@/domain/units";

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

export type RoomPlanCanvasProps = {
  room: Room;
  furniture: readonly PlacedFurniture[];
  unit: DisplayUnit;
};

/**
 * A top-down view of the room, drawn to scale on a 2D canvas.
 *
 * The canvas is a picture of the room, not the way to understand it: the
 * numbers beside it stay authoritative, and this element carries a text
 * description for anyone who cannot see the drawing.
 */
export function RoomPlanCanvas({ room, furniture, unit }: RoomPlanCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { ref: frameRef, size } = useElementSize<HTMLDivElement>();

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
      room,
      furniture,
      unit,
      viewport: size,
      color: style.color,
      fontFamily: style.fontFamily,
    });
  }, [room, furniture, unit, size]);

  return (
    <div
      ref={frameRef}
      className="aspect-[4/3] w-full rounded-lg border border-black/10 dark:border-white/15"
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={describeRoom(room, furniture, unit)}
        className="block h-full w-full"
      />
    </div>
  );
}

/** The same information as the drawing, for assistive technology. */
function describeRoom(
  room: Room,
  furniture: readonly PlacedFurniture[],
  unit: DisplayUnit,
): string {
  const shell =
    `Plan view of a rectangular room, ` +
    `${formatLength(room.widthMeters, unit)} wide by ` +
    `${formatLength(room.depthMeters, unit)} deep, ` +
    `with a ceiling ${formatLength(room.heightMeters, unit)} high.`;

  if (room.openings.length === 0) {
    return `${shell} No openings yet.`;
  }

  const openings = room.openings
    .map(
      (opening) =>
        `${opening.kind === "passage" ? "an open passage" : `a ${opening.kind}`} ` +
        `${formatLength(opening.widthMeters, unit)} wide on the ${opening.wall} wall`,
    )
    .join("; ");

  return `${shell} ${room.openings.length} opening${room.openings.length === 1 ? "" : "s"}: ${openings}. ${describeFurniture(furniture, unit)}`;
}

function describeFurniture(
  furniture: readonly PlacedFurniture[],
  unit: DisplayUnit,
): string {
  if (furniture.length === 0) {
    return "Nothing placed in it yet.";
  }
  const pieces = furniture
    .map(
      ({ product }) =>
        `${product.name}, ${formatLength(product.footprint.widthMeters, unit)} by ` +
        `${formatLength(product.footprint.depthMeters, unit)}`,
    )
    .join("; ");
  return `${furniture.length} ${furniture.length === 1 ? "piece" : "pieces"} placed: ${pieces}.`;
}

type DrawOptions = {
  room: Room;
  furniture: readonly PlacedFurniture[];
  unit: DisplayUnit;
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
  { room, furniture, unit, viewport, color, fontFamily }: DrawOptions,
): void {
  context.clearRect(0, 0, viewport.width, viewport.height);

  const thickness = room.wallThicknessMeters;

  // The walls sit outside the measured room, so the extent being fitted is the
  // floor plus a wall on each side. Floor coordinates are then one wall
  // thickness in from the outside corner.
  const projection = createPlanProjection(
    {
      widthMeters: room.widthMeters + thickness * 2,
      depthMeters: room.depthMeters + thickness * 2,
    },
    viewport,
    DIMENSION_PADDING_PIXELS,
  );
  if (projection.pixelsPerMeter <= 0) {
    return;
  }

  const frame: PlanFrame = {
    toPixels: (point) =>
      projectPoint(projection, {
        xMeters: point.xMeters + thickness,
        zMeters: point.zMeters + thickness,
      }),
    wallPixels: projectLength(projection, thickness),
    color,
  };

  const inside = frame.toPixels({ xMeters: 0, zMeters: 0 });
  const floorWidth = projectLength(projection, room.widthMeters);
  const floorDepth = projectLength(projection, room.depthMeters);

  // Walls first, as one solid ring, then the floor punched out of it. Openings
  // are cut from the ring afterwards, which is the order a plan is read in.
  context.save();
  context.globalAlpha = WALL_ALPHA;
  context.fillStyle = color;
  context.fillRect(
    inside.x - frame.wallPixels,
    inside.y - frame.wallPixels,
    floorWidth + frame.wallPixels * 2,
    floorDepth + frame.wallPixels * 2,
  );
  context.restore();
  context.clearRect(inside.x, inside.y, floorWidth, floorDepth);

  context.save();
  context.globalAlpha = FLOOR_ALPHA;
  context.fillStyle = color;
  context.fillRect(inside.x, inside.y, floorWidth, floorDepth);
  context.restore();

  drawMeterGrid(context, frame, room);

  for (const opening of room.openings) {
    // An opening that has fallen off its wall is reported in the panel rather
    // than drawn somewhere it could not be.
    if (checkOpening(room, opening) !== null) {
      continue;
    }
    cutOpening(context, frame, room, opening);
    drawOpeningSymbol(context, frame, room, opening);
  }

  for (const placed of furniture) {
    drawFurniture(context, frame, placed);
  }

  drawDimensions(context, {
    room,
    unit,
    color,
    fontFamily,
    inside,
    floorWidth,
    floorDepth,
    wallPixels: frame.wallPixels,
  });
}

/**
 * A placed piece, at its true footprint.
 *
 * Drawn as the rectangle the product actually occupies, rotated about its own
 * center — which is where the instance's position is. A prettier shape later
 * still has to sit inside exactly this rectangle, because this is what the
 * validation measures.
 */
function drawFurniture(
  context: CanvasRenderingContext2D,
  frame: PlanFrame,
  { instance, product }: PlacedFurniture,
): void {
  const center = frame.toPixels(instance.position);
  const width = frame.toPixels({
    xMeters: product.footprint.widthMeters,
    zMeters: 0,
  }).x;
  const origin = frame.toPixels({ xMeters: 0, zMeters: 0 }).x;
  const widthPixels = width - origin;
  const depthPixels =
    frame.toPixels({ xMeters: 0, zMeters: product.footprint.depthMeters }).y -
    frame.toPixels({ xMeters: 0, zMeters: 0 }).y;

  context.save();
  context.translate(center.x, center.y);
  context.rotate(instance.rotationRadians);

  context.globalAlpha = FURNITURE_FILL_ALPHA;
  context.fillStyle = frame.color;
  context.fillRect(
    -widthPixels / 2,
    -depthPixels / 2,
    widthPixels,
    depthPixels,
  );

  context.globalAlpha = FURNITURE_EDGE_ALPHA;
  context.strokeStyle = frame.color;
  context.lineWidth = 1.5;
  context.strokeRect(
    -widthPixels / 2,
    -depthPixels / 2,
    widthPixels,
    depthPixels,
  );

  context.restore();
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
  room: Room;
  unit: DisplayUnit;
  color: string;
  fontFamily: string;
  inside: PixelPoint;
  floorWidth: number;
  floorDepth: number;
  wallPixels: number;
};

/**
 * Dimension lines outside the walls, measuring the inside faces — the same
 * numbers the fields hold.
 */
function drawDimensions(
  context: CanvasRenderingContext2D,
  {
    room,
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
  const widthLabel = formatLength(room.widthMeters, unit);
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
  const depthLabel = formatLength(room.depthMeters, unit);
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
