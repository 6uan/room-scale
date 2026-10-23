"use client";

import { Edges, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentRef,
} from "react";
import {
  ExtrudeGeometry,
  MathUtils,
  Path,
  MeshStandardMaterial,
  PerspectiveCamera,
  Shape,
  ShapeGeometry,
  Vector3,
} from "three";
import {
  cameraOfFraming,
  framingAfterOrbit,
  orbitDistanceLimits,
  orbitTargetOnFloor,
  standsBeforeTarget,
  type FloorPoint,
  type Framing,
} from "@/domain/geometry";
import {
  apartmentShell,
  doorways,
  EYE_HEIGHT_METERS,
  floorBounds,
  walkStart,
  walkStep,
  type Floor,
  type FloorSlab,
  type WallPoint,
  type WallSlab,
} from "@/domain/room";
import {
  furnitureBoxes,
  placedNames,
  type FurnitureBox,
  type PlacedFurniture,
} from "@/domain/furniture";
import { formatLength, type DisplayUnit } from "@/domain/units";

/**
 * The apartment seen from inside, as the plan's rooms stood up.
 *
 * Everything drawn here was computed by `apartmentShell` in the domain: a
 * floor slab per section and a wall box per stretch of wall, in meters, in
 * the same floor coordinates the plan uses. This component places meshes
 * where it is told and never works out where a wall is. One Three.js unit is
 * one meter, Y is up, and a wall's rotation is its floor angle negated,
 * because Three turns +X toward -Z about Y while the floor's angle turns
 * east toward south.
 *
 * It is a view, not a workspace: nothing here is edited, and nothing can be
 * known only by looking at it — the numbers stay in the panels beside it.
 * The camera opens on what the plan was showing — the same floor point in
 * the middle, the same width of floor across, north at the top — tilted down
 * to look into the rooms, and orbits from there. Walking through it is the
 * last step of the perspective view.
 */
export function ApartmentScene({
  floor,
  furniture = NO_FURNITURE,
  unit,
  productUnit = unit,
  framing,
  onFramingChange,
  walls = "see-through",
  walking = false,
  onWalkEnd,
}: {
  floor: Floor;
  /** What is placed in this layout; a piece set aside is left out. */
  furniture?: readonly PlacedFurniture[];
  unit: DisplayUnit;
  /** The unit a product's own size reads in, which can differ from the rooms'. */
  productUnit?: DisplayUnit;
  /** What the plan was showing when the view was switched; null frames the whole floor. */
  framing?: Framing | null;
  /** Said when an orbit ends, so the plan can come back to it. */
  onFramingChange?: (framing: Framing) => void;
  /**
   * How the walls are drawn. See-through is the default: nothing in any room
   * is hidden by a wall, from any angle.
   */
  walls?: WallsMode;
  /**
   * Walking through at eye height rather than orbiting: drag to look, the
   * arrow keys or WASD to move, through doorways and not through walls.
   */
  walking?: boolean;
  /** Said when the walker presses Escape to stop. */
  onWalkEnd?: () => void;
}) {
  const shell = useMemo(() => apartmentShell(floor), [floor]);
  const boxes = useMemo(() => furnitureBoxes(furniture), [furniture]);
  /** The floor point the orbit is aimed at, where a walk begins. */
  const aimedAt = useRef<FloorPoint>((framing ?? wholeFloor(floor)).center);
  const dark = usePrefersDark();

  return (
    <div
      role="img"
      aria-label={describe(floor, furniture, unit, productUnit)}
      className="absolute inset-0"
    >
      {floor.rooms.length === 0 ? (
        <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm opacity-60">
          Nothing to see yet. Draw the rooms on the plan first.
        </p>
      ) : null}
      <Canvas camera={{ fov: 55, near: 0.05, far: 500 }} dpr={[1, 2]}>
        <ambientLight intensity={dark ? 0.9 : 1.4} />
        <directionalLight position={[6, 12, 4]} intensity={dark ? 1.2 : 1.6} />
        {shell.floors.map((slab) => (
          <FloorMesh
            key={`${slab.roomId}/${slab.partId}`}
            slab={slab}
            color={dark ? FLOOR_DARK : FLOOR_LIGHT}
          />
        ))}
        {shell.walls.map((wall, index) => (
          <WallMesh
            key={`${wall.roomId}/${wall.partId}/${index}`}
            wall={wall}
            color={dark ? WALL_DARK : WALL_LIGHT}
            edge={dark ? WALL_EDGE_DARK : WALL_EDGE_LIGHT}
            mode={walls}
          />
        ))}
        {boxes.map((box) => (
          <FurnitureMesh
            key={box.instanceId}
            box={box}
            color={dark ? FURNITURE_DARK : FURNITURE_LIGHT}
            edge={dark ? FURNITURE_EDGE_DARK : FURNITURE_EDGE_LIGHT}
          />
        ))}
        {walking ? (
          <WalkControls
            floor={floor}
            startFrom={() => aimedAt.current}
            {...(onWalkEnd === undefined ? {} : { onWalkEnd })}
          />
        ) : (
          <FramedControls
            framing={framing ?? wholeFloor(floor)}
            whole={wholeFloor(floor)}
            heightMeters={Math.max(
              0,
              ...floor.rooms.map((room) => room.heightMeters),
            )}
            onAim={(point) => {
              aimedAt.current = point;
            }}
            {...(onFramingChange === undefined ? {} : { onFramingChange })}
          />
        )}
      </Canvas>
    </div>
  );
}

/** The whole apartment, with a margin, for when there is no plan view to follow. */
function wholeFloor(floor: Floor): Framing {
  const { origin, extent } = floorBounds(floor);
  return {
    center: {
      xMeters: origin.xMeters + extent.widthMeters / 2,
      zMeters: origin.zMeters + extent.depthMeters / 2,
    },
    metersAcross: Math.max(extent.widthMeters, 1),
    metersDown: Math.max(extent.depthMeters, 1),
  };
}

/**
 * The orbiting camera, placed once from the framing it opened on, and
 * reporting where it was left each time a drag ends.
 *
 * Placed once rather than on every change: the framing is where the view
 * starts, and a camera that jumped back to it would undo the orbit being made.
 */
function FramedControls({
  framing,
  whole,
  heightMeters,
  onAim,
  onFramingChange,
}: {
  framing: Framing;
  /** The whole apartment: what the orbit stays over, and how far it may pull back. */
  whole: Framing;
  /** The tallest wall, so the walls of what was framed are not cut off. */
  heightMeters: number;
  /** Said as the orbit point moves, with where it is on the floor. */
  onAim?: (point: FloorPoint) => void;
  onFramingChange?: (framing: Framing) => void;
}) {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const fov = MathUtils.degToRad(
    camera instanceof PerspectiveCamera ? camera.fov : 55,
  );
  const aspect = size.height > 0 ? size.width / size.height : 1;
  const [start] = useState(() =>
    cameraOfFraming(framing, fov, aspect, heightMeters),
  );
  const limits = orbitDistanceLimits(whole, fov, aspect, heightMeters);

  useLayoutEffect(() => {
    camera.position.set(...start.position);
    camera.lookAt(...start.target);
    controls.current?.target.set(...start.target);
    controls.current?.update();
  }, [camera, start]);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={start.target}
      maxPolarAngle={Math.PI / 2 - 0.02}
      minDistance={limits.minMeters}
      maxDistance={limits.maxMeters}
      // Panning slides along the floor rather than up and down the screen,
      // which is what carried the orbit point — and the camera with it —
      // below the floor.
      screenSpacePanning={false}
      onChange={() => {
        const orbit = controls.current;
        if (orbit === null) {
          return;
        }
        const { target, object: eye } = orbit;
        const kept = orbitTargetOnFloor([target.x, target.y, target.z], whole);
        if (
          kept[0] !== target.x ||
          kept[1] !== target.y ||
          kept[2] !== target.z
        ) {
          // Moved by the same amount, so a pan stops at the edge rather than
          // swinging the view round the clamped point.
          eye.position.add(
            new Vector3(
              kept[0] - target.x,
              kept[1] - target.y,
              kept[2] - target.z,
            ),
          );
          target.set(...kept);
        }
        onAim?.({ xMeters: kept[0], zMeters: kept[2] });
      }}
      onEnd={() => {
        const target = controls.current?.target;
        if (target === undefined || onFramingChange === undefined) {
          return;
        }
        onFramingChange(
          framingAfterOrbit(
            framing,
            start.distanceMeters,
            [camera.position.x, camera.position.y, camera.position.z],
            [target.x, target.y, target.z],
          ),
        );
      }}
    />
  );
}

/** How fast the walker goes: an easy walking pace, and twice it with Shift. */
const WALK_METERS_PER_SECOND = 1.4;

/** How far the view turns per pixel dragged, and how far up or down it may look. */
const LOOK_RADIANS_PER_PIXEL = 0.005;
const LOOK_LIMIT_RADIANS = (80 * Math.PI) / 180;

/**
 * Walking through the apartment at eye height. Dragging turns the head; the
 * arrow keys or WASD walk, Shift faster. Every step is `walkStep`'s, so the
 * walls stop the walker and the doorways let them through. Escape stops.
 *
 * The walk starts where the orbit was aimed, looking north as the orbit did,
 * or in the middle of a room when that point is not somewhere to stand.
 */
function WalkControls({
  floor,
  startFrom,
  onWalkEnd,
}: {
  floor: Floor;
  startFrom: () => FloorPoint;
  onWalkEnd?: () => void;
}) {
  const element = useThree((state) => state.gl.domElement);
  const openings = useMemo(() => doorways(floor), [floor]);
  const [start] = useState(() => walkStart(floor, startFrom()));
  const at = useRef<FloorPoint | null>(start);
  const look = useRef({ yaw: 0, pitch: -0.15 });
  const held = useRef(new Set<string>());

  useEffect(() => {
    let dragging: { x: number; y: number } | null = null;
    const typing = (target: EventTarget | null) =>
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement;
    const onKeyDown = (event: KeyboardEvent) => {
      if (typing(event.target)) {
        return;
      }
      if (event.key === "Escape") {
        onWalkEnd?.();
        return;
      }
      if (WALK_KEYS.has(event.key.toLowerCase())) {
        event.preventDefault();
        held.current.add(event.key.toLowerCase());
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      held.current.delete(event.key.toLowerCase());
    };
    const onBlur = () => held.current.clear();
    const onDown = (event: PointerEvent) => {
      dragging = { x: event.clientX, y: event.clientY };
      element.setPointerCapture(event.pointerId);
    };
    const onMove = (event: PointerEvent) => {
      if (dragging === null) {
        return;
      }
      look.current.yaw += (event.clientX - dragging.x) * LOOK_RADIANS_PER_PIXEL;
      look.current.pitch = Math.max(
        -LOOK_LIMIT_RADIANS,
        Math.min(
          LOOK_LIMIT_RADIANS,
          look.current.pitch -
            (event.clientY - dragging.y) * LOOK_RADIANS_PER_PIXEL,
        ),
      );
      dragging = { x: event.clientX, y: event.clientY };
    };
    const onUp = () => {
      dragging = null;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    element.addEventListener("pointerdown", onDown);
    element.addEventListener("pointermove", onMove);
    element.addEventListener("pointerup", onUp);
    element.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      element.removeEventListener("pointerdown", onDown);
      element.removeEventListener("pointermove", onMove);
      element.removeEventListener("pointerup", onUp);
      element.removeEventListener("pointercancel", onUp);
    };
  }, [element, onWalkEnd]);

  useFrame((state, delta) => {
    const here = at.current;
    if (here === null) {
      return;
    }
    const { yaw, pitch } = look.current;
    // Yaw from north toward east: forward is north at zero, and Z runs south.
    const forward = { dx: Math.sin(yaw), dz: -Math.cos(yaw) };
    const right = { dx: Math.cos(yaw), dz: Math.sin(yaw) };
    const keys = held.current;
    const ahead =
      (keys.has("w") || keys.has("arrowup") ? 1 : 0) -
      (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
    const aside =
      (keys.has("d") || keys.has("arrowright") ? 1 : 0) -
      (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
    if (ahead !== 0 || aside !== 0) {
      const length = Math.hypot(ahead, aside);
      const speed =
        WALK_METERS_PER_SECOND *
        (keys.has("shift") ? 2 : 1) *
        Math.min(delta, 0.1);
      at.current = walkStep(
        floor,
        here,
        {
          dx: ((forward.dx * ahead + right.dx * aside) / length) * speed,
          dz: ((forward.dz * ahead + right.dz * aside) / length) * speed,
        },
        openings,
      );
    }
    const eye = at.current ?? here;
    state.camera.position.set(eye.xMeters, EYE_HEIGHT_METERS, eye.zMeters);
    state.camera.lookAt(
      eye.xMeters + forward.dx * Math.cos(pitch),
      EYE_HEIGHT_METERS + Math.sin(pitch),
      eye.zMeters + forward.dz * Math.cos(pitch),
    );
  });

  return null;
}

/** The keys that walk: WASD, the arrows, and Shift to go faster. */
const WALK_KEYS = new Set([
  "w",
  "a",
  "s",
  "d",
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "shift",
]);

/**
 * One piece, as the box its product measures: the same footprint the plan
 * draws and validation checks, stood up to the product's height. Turned the
 * way a wall is, by its floor angle negated, because Three turns +X toward
 * -Z about Y while the floor's angle turns it toward +Z.
 */
function FurnitureMesh({
  box,
  color,
  edge,
}: {
  box: FurnitureBox;
  color: string;
  edge: string;
}) {
  return (
    <mesh
      position={[box.center.xMeters, box.heightMeters / 2, box.center.zMeters]}
      rotation={[0, -box.angleRadians, 0]}
    >
      <boxGeometry
        args={[box.widthMeters, box.heightMeters, box.depthMeters]}
      />
      <meshStandardMaterial color={color} />
      {/* The box's own edges, so two pieces that touch read as two. */}
      <Edges color={edge} />
    </mesh>
  );
}

const NO_FURNITURE: readonly PlacedFurniture[] = [];

/** Warmer than the walls and darker than the floor, so a piece reads as a thing in the room. */
const FURNITURE_LIGHT = "#b39b7d";
const FURNITURE_DARK = "#7a6a58";
const FURNITURE_EDGE_LIGHT = "#5c4e3e";
const FURNITURE_EDGE_DARK = "#c9b59c";
const WALL_EDGE_LIGHT = "#8f877c";
const WALL_EDGE_DARK = "#6f6a64";
const FLOOR_LIGHT = "#d9d2c7";
const FLOOR_DARK = "#3b3835";
const WALL_LIGHT = "#efece7";
const WALL_DARK = "#625e59";

function FloorMesh({ slab, color }: { slab: FloorSlab; color: string }) {
  const geometry = useMemo(() => {
    // A Shape lies in XY. Built with Y as negative Z and turned down onto
    // the floor, each point lands at the floor coordinate it came from.
    const shape = new Shape();
    slab.polygon.forEach((point, index) => {
      if (index === 0) {
        shape.moveTo(point.xMeters, -point.zMeters);
      } else {
        shape.lineTo(point.xMeters, -point.zMeters);
      }
    });
    shape.closePath();
    return new ShapeGeometry(shape).rotateX(-Math.PI / 2);
  }, [slab.polygon]);

  return (
    <mesh geometry={geometry} receiveShadow>
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

/**
 * How much of a see-through wall shows: enough to see where it is and how
 * high it goes, not enough to hide the room or the furniture behind it.
 */
const SEE_THROUGH_OPACITY = 0.18;

/**
 * How the walls are drawn: all see-through, all solid, or decided for you —
 * walls between rooms see-through always, and an outside wall see-through
 * only while it stands between the camera and what it is looking at.
 */
export type WallsMode = "see-through" | "auto" | "solid";

/** Draws a wall's surface see-through or solid. */
function setSeeThrough(surface: MeshStandardMaterial, seeThrough: boolean) {
  const opacity = seeThrough ? SEE_THROUGH_OPACITY : 1;
  if (surface.opacity !== opacity) {
    surface.opacity = opacity;
    surface.transparent = seeThrough;
    surface.depthWrite = !seeThrough;
    surface.needsUpdate = true;
  }
}

/**
 * One stretch of wall, at its full height always. A see-through wall writes
 * no depth, so what is behind it is drawn rather than hidden by an invisible
 * surface, and keeps its outline so it still reads as a wall of a measured
 * height. Under "auto" it decides each frame; otherwise it is what it was
 * told, and its material is made afresh when the mode changes, so nothing an
 * automatic frame set is left behind.
 */
function WallMesh({
  wall,
  color,
  edge,
  mode,
}: {
  wall: WallSlab;
  color: string;
  edge: string;
  mode: WallsMode;
}) {
  const material = useRef<MeshStandardMaterial>(null);
  useFrame(({ camera, controls }) => {
    const surface = material.current;
    if (mode !== "auto" || surface === null) {
      return;
    }
    const target =
      controls !== null && "target" in controls
        ? (controls.target as Vector3)
        : null;
    setSeeThrough(
      surface,
      wall.interior ||
        (target !== null &&
          standsBeforeTarget(
            wall.center,
            [camera.position.x, camera.position.y, camera.position.z],
            [target.x, target.y, target.z],
          )),
    );
  });
  const seeThrough = mode !== "solid";
  const geometry = useMemo(() => wallGeometry(wall), [wall]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      position={[wall.center.xMeters, 0, wall.center.zMeters]}
      rotation={[0, -wall.angleRadians, 0]}
      geometry={geometry}
    >
      <meshStandardMaterial
        key={mode}
        ref={material}
        color={color}
        transparent={seeThrough}
        opacity={seeThrough ? SEE_THROUGH_OPACITY : 1}
        depthWrite={!seeThrough}
      />
      <Edges color={edge} />
    </mesh>
  );
}

/**
 * A wall's face, as the shell gives it, pushed out to the wall's thickness:
 * one solid with its openings cut out, so its outline is the wall's edge and
 * the openings' and nothing else. In the wall's own frame — X along it, Y up,
 * Z through it — and centred on its thickness, as the box it replaces was.
 */
function wallGeometry(wall: WallSlab): ExtrudeGeometry {
  const path = <T extends Shape | Path>(
    into: T,
    points: readonly WallPoint[],
  ) => {
    points.forEach((point, index) => {
      if (index === 0) {
        into.moveTo(point.alongMeters, point.upMeters);
      } else {
        into.lineTo(point.alongMeters, point.upMeters);
      }
    });
    into.closePath();
    return into;
  };
  const face = path(new Shape(), wall.outline);
  face.holes = wall.holes.map((hole) => path(new Path(), hole));
  const geometry = new ExtrudeGeometry(face, {
    depth: wall.thicknessMeters,
    bevelEnabled: false,
  });
  geometry.translate(0, 0, -wall.thicknessMeters / 2);
  return geometry;
}

/** The same information as the picture, for assistive technology and tests. */
function describe(
  floor: Floor,
  furniture: readonly PlacedFurniture[],
  unit: DisplayUnit,
  productUnit: DisplayUnit,
): string {
  if (floor.rooms.length === 0) {
    return "Perspective view of an apartment with no rooms in it yet.";
  }
  const { extent } = floorBounds(floor);
  const rooms = floor.rooms
    .map(
      (room) =>
        `${room.name === "" ? "an unnamed room" : room.name} ${formatLength(room.heightMeters, unit)} high`,
    )
    .join("; ");
  const names = placedNames(furniture);
  const pieces = furniture.flatMap((placed, index) =>
    placed.instance.hidden === true
      ? []
      : [
          `${names[index] ?? placed.product.name}, ` +
            `${formatLength(placed.product.footprint.widthMeters, productUnit)} by ` +
            `${formatLength(placed.product.footprint.depthMeters, productUnit)}, ` +
            `${formatLength(placed.product.heightMeters, productUnit)} high`,
        ],
  );
  return (
    `Perspective view of an apartment ${formatLength(extent.widthMeters, unit)} across ` +
    `and ${formatLength(extent.depthMeters, unit)} down, ` +
    `holding ${floor.rooms.length} ${floor.rooms.length === 1 ? "room" : "rooms"}: ${rooms}.` +
    (pieces.length === 0
      ? ""
      : ` ${pieces.length} ${pieces.length === 1 ? "piece" : "pieces"} standing: ${pieces.join("; ")}.`)
  );
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

function usePrefersDark(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(DARK_QUERY);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(DARK_QUERY).matches,
    () => false,
  );
}
