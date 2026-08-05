"use client";

import { cn } from "@/components/cn";
import type { PartCorner, WallState } from "@/domain/room";

/**
 * How each wall kind is drawn, following the plan rather than inventing a code.
 *
 * Solid is a wall, a hairline is the railing the plan draws an open side with,
 * and a double line is the partition a printed floor plan uses between two
 * spaces. Nothing here has to be learned by anybody who has seen a floor plan.
 */
const LINES: Record<WallState, { count: number; thick: boolean }> = {
  auto: { count: 1, thick: true },
  open: { count: 1, thick: false },
  dividing: { count: 2, thick: false },
};

export function WallLine({ state }: { state: WallState }) {
  const { count, thick } = LINES[state];

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex w-6 flex-col items-center gap-[3px]",
        state === "open" ? "opacity-40" : "opacity-65",
      )}
    >
      {Array.from({ length: count }, (_, line) => (
        <span
          key={line}
          className={cn(
            "w-full rounded-full bg-current",
            thick ? "h-[3px]" : "h-px",
          )}
        />
      ))}
    </span>
  );
}

/** Which way each corner faces: one drawing, turned. */
const TURNS: Record<PartCorner, string> = {
  "north-west": "",
  "north-east": "rotate-90",
  "south-east": "rotate-180",
  "south-west": "-rotate-90",
};

/**
 * One corner of a rectangle, square or clipped.
 *
 * Drawn once for the north-west and turned for the other three, which is what
 * keeps the four identical: a corner is a corner, and only the way it faces
 * differs. The two legs are not decoration — a bare diagonal would draw a
 * north-west chamfer and a south-east one as the same line.
 */
export function CornerGlyph({
  corner,
  cut,
}: {
  corner: PartCorner;
  cut: boolean;
}) {
  return (
    <svg
      viewBox="0 0 18 18"
      aria-hidden="true"
      className={cn("size-[18px]", TURNS[corner], cut ? "" : "opacity-60")}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={cut ? "M3 15 V8 L8 3 H15" : "M3 15 V3 H15"} />
    </svg>
  );
}
