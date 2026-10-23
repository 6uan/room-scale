/**
 * How far ↑ or ↓ moves a number field: one of its unit, ten with Shift, and
 * nothing for any other key. Shared so every field steps the same way —
 * lengths in inches or centimeters, angles in degrees, prices in dollars.
 */
export function arrowStep(event: {
  readonly key: string;
  readonly shiftKey: boolean;
}): number | null {
  const direction =
    event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : 0;
  return direction === 0 ? null : direction * (event.shiftKey ? 10 : 1);
}
