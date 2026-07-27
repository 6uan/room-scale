/**
 * Editing a placed piece from the keyboard.
 *
 * The canvas is never the only way in, so everything a drag does has a key
 * that does it too. A nudge is 5 cm — about two inches, enough to see the piece
 * move and small enough to close a gap with — and Shift makes it 1 cm for the
 * last bit. A turn is 15°, so four presses square a piece up against a wall,
 * and Shift makes it 1°.
 *
 * This maps a key to the instance it produces and nothing else: no event, no
 * element, no store. That keeps the same mapping usable from the canvas and
 * from the list beside it, and testable without either.
 */

import {
  clampToFloor,
  moveInstance,
  turnInstance,
  type FurnitureInstance,
} from "@/domain/furniture";
import type { Floor } from "@/domain/room";
import { radiansFromDegrees } from "@/domain/units";

const NUDGE_METERS = 0.05;
const FINE_NUDGE_METERS = 0.01;
const TURN_DEGREES = 15;
const FINE_TURN_DEGREES = 1;

/** What a handler needs off a keyboard event, and no more. */
export type PlacementKeyPress = {
  readonly key: string;
  readonly shiftKey: boolean;
};

/** How the keys read, for the hint beside the fields. */
export const PLACEMENT_KEY_HINT =
  "Arrow keys nudge it 5 cm, or 1 cm with Shift. [ and ] turn it 15°, or 1° with Shift.";

/**
 * The instance a key press produces, or null when the key is not one this
 * handles — in which case the event belongs to the browser and must be left
 * alone rather than swallowed.
 */
export function instanceFromKeyPress(
  floor: Floor,
  instance: FurnitureInstance,
  { key, shiftKey }: PlacementKeyPress,
): FurnitureInstance | null {
  const step = shiftKey ? FINE_NUDGE_METERS : NUDGE_METERS;
  const turn = radiansFromDegrees(shiftKey ? FINE_TURN_DEGREES : TURN_DEGREES);

  // Up is north, which is where depth is measured from, so it is z decreasing.
  switch (key) {
    case "ArrowLeft":
      return nudge(floor, instance, -step, 0);
    case "ArrowRight":
      return nudge(floor, instance, step, 0);
    case "ArrowUp":
      return nudge(floor, instance, 0, -step);
    case "ArrowDown":
      return nudge(floor, instance, 0, step);
    case "[":
      return turnInstance(instance, instance.rotationRadians - turn);
    case "]":
      return turnInstance(instance, instance.rotationRadians + turn);
    default:
      return null;
  }
}

function nudge(
  floor: Floor,
  instance: FurnitureInstance,
  dxMeters: number,
  dzMeters: number,
): FurnitureInstance {
  return moveInstance(
    instance,
    clampToFloor(floor, {
      xMeters: instance.position.xMeters + dxMeters,
      zMeters: instance.position.zMeters + dzMeters,
    }),
  );
}
