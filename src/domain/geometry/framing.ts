/**
 * What a view is looking at, in a form both views can read.
 *
 * The plan and the perspective view are two cameras on one floor, and moving
 * between them should not lose your place: zoomed in on the bedroom, the
 * perspective view should open on the bedroom, from the plan's side, at the
 * plan's scale — and the plan should come back where the perspective view
 * was moved to. A framing is the shared part: the floor point in the middle
 * of the view, and how much floor fits across it.
 *
 * The perspective camera always looks north, tilted down by a fixed angle,
 * so north stays at the top of the screen as it is on the plan; a turn made
 * while orbiting is the perspective view's own and does not come back.
 *
 * Pure: meters, pixels and angles, no React and no Three.js.
 */

import type { FloorPoint, PixelSize, PlanProjection } from "./plan-projection";

export type Framing = {
  /** The floor point in the middle of the view. */
  readonly center: FloorPoint;
  /** How much floor fits across the view, side to side. */
  readonly metersAcross: number;
  /** And top to bottom. */
  readonly metersDown: number;
};

/** The part of a canvas actually seen: its left edge, and its size. */
export type VisibleArea = PixelSize & { readonly left: number };

/** How far the perspective camera looks down: 55° below the horizon. */
export const PERSPECTIVE_TILT_RADIANS = (55 * Math.PI) / 180;

/** What a plan projection shows in the visible part of its canvas. */
export function framingOfProjection(
  projection: PlanProjection,
  visible: VisibleArea,
): Framing | null {
  if (
    !(projection.pixelsPerMeter > 0) ||
    !(visible.width > 0) ||
    !(visible.height > 0)
  ) {
    return null;
  }
  const middleX = visible.left + visible.width / 2;
  const middleY = visible.height / 2;
  return {
    center: {
      xMeters: (middleX - projection.originX) / projection.pixelsPerMeter,
      zMeters: (middleY - projection.originY) / projection.pixelsPerMeter,
    },
    metersAcross: visible.width / projection.pixelsPerMeter,
    metersDown: visible.height / projection.pixelsPerMeter,
  };
}

/**
 * The plan projection that shows a framing in the visible part of a canvas:
 * centred on it, at the scale that fits all of it.
 */
export function projectionOfFraming(
  framing: Framing,
  visible: VisibleArea,
): PlanProjection | null {
  if (
    !(framing.metersAcross > 0) ||
    !(framing.metersDown > 0) ||
    !(visible.width > 0) ||
    !(visible.height > 0)
  ) {
    return null;
  }
  const pixelsPerMeter = Math.min(
    visible.width / framing.metersAcross,
    visible.height / framing.metersDown,
  );
  return {
    pixelsPerMeter,
    originX:
      visible.left +
      visible.width / 2 -
      framing.center.xMeters * pixelsPerMeter,
    originY: visible.height / 2 - framing.center.zMeters * pixelsPerMeter,
  };
}

/** A point in the perspective view's space: X east, Y up, Z south. */
export type ScenePoint = readonly [number, number, number];

/**
 * Where the perspective camera stands to show a framing: due south of the
 * framed point and above it, looking down at the tilt, as close as it can be
 * while everything the plan showed — its floor, and walls up to
 * `heightMeters` on it — is in view.
 *
 * Fitting is exact rather than searched. The camera only ever slides along
 * its own line of sight, so in the camera's frame every point keeps its
 * sideways offset x and its upward offset y, and only its depth grows, by
 * the distance d. A point is in view when |x| ≤ (depth)·tan(hfov/2) and
 * |y| ≤ (depth)·tan(vfov/2), with depth = d + (the point's depth relative to
 * the framed point). So each corner asks for at least one d, and the camera
 * stands at the largest.
 */
export function cameraOfFraming(
  framing: Framing,
  verticalFovRadians: number,
  aspect: number,
  heightMeters: number,
  tiltRadians = PERSPECTIVE_TILT_RADIANS,
): { position: ScenePoint; target: ScenePoint; distanceMeters: number } {
  const tanVertical = Math.tan(verticalFovRadians / 2);
  const tanAcross = tanVertical * aspect;
  const sin = Math.sin(tiltRadians);
  const cos = Math.cos(tiltRadians);
  const { xMeters, zMeters } = framing.center;

  let distance = 0;
  for (const dx of [-1, 1]) {
    for (const dz of [-1, 1]) {
      for (const y of [0, heightMeters]) {
        // Offsets from the framed point, east and south and up.
        const east = (dx * framing.metersAcross) / 2;
        const south = (dz * framing.metersDown) / 2;
        // In the camera's frame: right is east; up is (0, cos, -sin); the
        // line of sight runs north and down, (0, -sin, -cos).
        const up = y * cos - south * sin;
        const depthBeyond = -y * sin - south * cos;
        distance = Math.max(
          distance,
          Math.abs(east) / tanAcross - depthBeyond,
          Math.abs(up) / tanVertical - depthBeyond,
        );
      }
    }
  }

  return {
    target: [xMeters, 0, zMeters],
    position: [xMeters, distance * sin, zMeters + distance * cos],
    distanceMeters: distance,
  };
}

/**
 * What the plan should show after an orbit: the point the camera is now
 * aimed at, with the framing it opened on scaled by how much nearer or
 * farther it has come. A turn is the perspective view's own and does not
 * come back; the plan is always north-up.
 */
export function framingAfterOrbit(
  opened: Framing,
  openedDistanceMeters: number,
  position: ScenePoint,
  target: ScenePoint,
): Framing {
  const distance = Math.hypot(
    position[0] - target[0],
    position[1] - target[1],
    position[2] - target[2],
  );
  const scale = openedDistanceMeters > 0 ? distance / openedDistanceMeters : 1;
  return {
    center: { xMeters: target[0], zMeters: target[2] },
    metersAcross: opened.metersAcross * scale,
    metersDown: opened.metersDown * scale,
  };
}

/**
 * Whether something on the floor stands between the camera and the point it
 * is looking at — on the camera's side of that point, seen from above.
 *
 * The perspective view draws such a wall see-through rather than shorter:
 * every wall keeps its true height, and the ones in the way of what you are
 * looking at stop hiding it. Decided by position alone, so the two rooms on
 * either side of a shared wall always agree about it, and walls beyond the
 * point stay solid as the backdrop they are.
 */
export function standsBeforeTarget(
  point: FloorPoint,
  camera: ScenePoint,
  target: ScenePoint,
): boolean {
  const towardCameraX = camera[0] - target[0];
  const towardCameraZ = camera[2] - target[2];
  return (
    (point.xMeters - target[0]) * towardCameraX +
      (point.zMeters - target[2]) * towardCameraZ >
    1e-9
  );
}
