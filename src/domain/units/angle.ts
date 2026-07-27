/**
 * Angles.
 *
 * Rotation is stored in radians about the vertical axis, because that is what
 * the trigonometry and the 3D view both want. It is read and typed in degrees,
 * because nobody turns a sofa by 0.26 radians.
 */

const DEGREES_PER_TURN = 360;

/** A whole turn. Rotations are kept inside one of these. */
export const FULL_TURN_RADIANS = Math.PI * 2;

export function radiansFromDegrees(degrees: number): number {
  return (degrees / DEGREES_PER_TURN) * FULL_TURN_RADIANS;
}

export function degreesFromRadians(radians: number): number {
  return (radians / FULL_TURN_RADIANS) * DEGREES_PER_TURN;
}

/**
 * Brings an angle into `[0, 2π)`, so 370° and 10° are the one turn they
 * physically are, and a piece nudged anticlockwise past zero reads as 350°
 * rather than as a growing negative number.
 */
export function normalizeRadians(radians: number): number {
  const wrapped = radians % FULL_TURN_RADIANS;
  return wrapped < 0 ? wrapped + FULL_TURN_RADIANS : wrapped;
}

/** Formats a stored rotation for display. Rounding happens here only. */
export function formatAngle(radians: number): string {
  const degrees =
    Math.round(degreesFromRadians(normalizeRadians(radians)) * 10) / 10;
  // A hair under a whole turn rounds up to 360°, which is no turn at all.
  return `${degrees >= DEGREES_PER_TURN ? 0 : degrees}°`;
}
