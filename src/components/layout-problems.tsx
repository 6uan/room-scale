"use client";

import type { LayoutProblem } from "@/domain/validation";
import { formatLength, type DisplayUnit } from "@/domain/units";

export type LayoutProblemsProps = {
  problems: readonly LayoutProblem[];
  /** Room id to the name it goes by, for the walls a piece goes through. */
  roomNames: ReadonlyMap<string, string>;
  /** Instance id to the name that piece is called in the list beside it. */
  names: ReadonlyMap<string, string>;
  unit: DisplayUnit;
};

/**
 * What is wrong with the layout, in words.
 *
 * The plan view marks the pieces involved, but a color on a canvas is not an
 * answer: it cannot say which two pieces, or by how much, and it cannot be read
 * at all by someone who is not looking at the drawing. This list is the answer,
 * and the marking is the illustration.
 *
 * It announces itself as it changes, because problems appear and disappear
 * while a piece is being dragged and nobody is watching this corner of the
 * screen at the time.
 */
export function LayoutProblems({
  problems,
  names,
  roomNames,
  unit,
}: LayoutProblemsProps) {
  return (
    <div aria-live="polite">
      {problems.length === 0 ? (
        <p className="text-sm opacity-60">
          Everything fits. Nothing overlaps, and nothing crosses a wall.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {problems.map((problem) => (
            <li
              key={problemKey(problem)}
              className="text-sm leading-relaxed text-red-600"
            >
              {problemMessage(problem, names, roomNames, unit)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function problemMessage(
  problem: LayoutProblem,
  names: ReadonlyMap<string, string>,
  roomNames: ReadonlyMap<string, string>,
  unit: DisplayUnit,
): string {
  const name = (id: string) => names.get(id) ?? "A piece of furniture";
  const roomName = (id: string) => roomNames.get(id) ?? "a room";

  switch (problem.kind) {
    case "overlap":
      return (
        `${name(problem.instanceIds[0])} overlaps ` +
        `${name(problem.instanceIds[1])} by ` +
        `${formatLength(problem.depthMeters, unit)}.`
      );
    case "crosses-wall":
      return (
        `${name(problem.instanceId)} crosses the ${problem.wall} wall of the ` +
        `${roomName(problem.roomId)} by ` +
        `${formatLength(problem.overhangMeters, unit)}.`
      );
    case "outside-room":
      return `${name(problem.instanceId)} is not in any room.`;
    case "rooms-overlap":
      return (
        `${roomName(problem.roomIds[0])} and ${roomName(problem.roomIds[1])} ` +
        `are in the same place, overlapping by ` +
        `${formatLength(problem.depthMeters, unit)}.`
      );
  }
}

/** Stable across a drag, so React keeps each line rather than rebuilding it. */
function problemKey(problem: LayoutProblem): string {
  switch (problem.kind) {
    case "overlap":
      return `overlap:${problem.instanceIds.join(":")}`;
    case "crosses-wall":
      return `wall:${problem.instanceId}:${problem.wall}`;
    case "outside-room":
      return `outside:${problem.instanceId}`;
    case "rooms-overlap":
      return `rooms:${problem.roomIds.join(":")}`;
  }
}
