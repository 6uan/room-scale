"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentRef,
} from "react";
import { MathUtils, PerspectiveCamera, Shape, ShapeGeometry } from "three";
import {
  cameraOfFraming,
  framingAfterOrbit,
  type Framing,
} from "@/domain/geometry";
import {
  apartmentShell,
  floorBounds,
  type Floor,
  type FloorSlab,
  type WallSlab,
} from "@/domain/room";
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
  unit,
  framing,
  onFramingChange,
}: {
  floor: Floor;
  unit: DisplayUnit;
  /** What the plan was showing when the view was switched; null frames the whole floor. */
  framing?: Framing | null;
  /** Said when an orbit ends, so the plan can come back to it. */
  onFramingChange?: (framing: Framing) => void;
}) {
  const shell = useMemo(() => apartmentShell(floor), [floor]);
  const dark = usePrefersDark();

  return (
    <div
      role="img"
      aria-label={describe(floor, unit)}
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
          />
        ))}
        <FramedControls
          framing={framing ?? wholeFloor(floor)}
          heightMeters={Math.max(
            0,
            ...floor.rooms.map((room) => room.heightMeters),
          )}
          {...(onFramingChange === undefined ? {} : { onFramingChange })}
        />
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
  heightMeters,
  onFramingChange,
}: {
  framing: Framing;
  /** The tallest wall, so the walls of what was framed are not cut off. */
  heightMeters: number;
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

function WallMesh({ wall, color }: { wall: WallSlab; color: string }) {
  return (
    <mesh
      position={[
        wall.center.xMeters,
        wall.heightMeters / 2,
        wall.center.zMeters,
      ]}
      rotation={[0, -wall.angleRadians, 0]}
    >
      <boxGeometry
        args={[wall.lengthMeters, wall.heightMeters, wall.thicknessMeters]}
      />
      <meshStandardMaterial color={color} />
    </mesh>
  );
}

/** The same information as the picture, for assistive technology and tests. */
function describe(floor: Floor, unit: DisplayUnit): string {
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
  return (
    `Perspective view of an apartment ${formatLength(extent.widthMeters, unit)} across ` +
    `and ${formatLength(extent.depthMeters, unit)} down, ` +
    `holding ${floor.rooms.length} ${floor.rooms.length === 1 ? "room" : "rooms"}: ${rooms}.`
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
