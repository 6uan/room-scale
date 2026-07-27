"use client";

import type { LayoutProblem } from "@/domain/validation";
import { formatLength, type DisplayUnit } from "@/domain/units";

export type LayoutProblemsProps = {
  problems: readonly LayoutProblem[];
  /** Instance id to the name that piece is called in the list beside it. */
  names: ReadonlyMap<string, string>;
  /** Walkway id to the name its owner gave the route. */
  walkwayNames: ReadonlyMap<string, string>;
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
  walkwayNames,
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
              className={`text-sm leading-relaxed ${
                // Amber for a route that works and is tighter than you wanted:
                // it is worth knowing and it is not a thing you cannot do.
                problem.kind === "walkway-tight"
                  ? "text-amber-600"
                  : "text-red-600"
              }`}
            >
              {problemMessage(problem, names, walkwayNames, unit)}
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
  walkwayNames: ReadonlyMap<string, string>,
  unit: DisplayUnit,
): string {
  const name = (id: string) => names.get(id) ?? "A piece of furniture";
  const inTheWay = (ids: readonly string[]) =>
    ids.length === 0 ? "" : ` In the way: ${ids.map(name).join(", ")}.`;

  switch (problem.kind) {
    case "overlap":
      return (
        `${name(problem.instanceIds[0])} overlaps ` +
        `${name(problem.instanceIds[1])} by ` +
        `${formatLength(problem.depthMeters, unit)}.`
      );
    case "crosses-wall":
      return (
        `${name(problem.instanceId)} crosses the ${problem.wall} wall by ` +
        `${formatLength(problem.overhangMeters, unit)}.`
      );
    case "outside-room":
      return `${name(problem.instanceId)} is outside the room.`;
    case "walkway-blocked":
      // The width it needs is what it has plus what it is missing, so the
      // problem does not have to carry a number the route already knows.
      return (
        `${walkwayNames.get(problem.walkwayId) ?? "A route"} is down to ` +
        `${formatLength(problem.clearMeters, unit)}, ` +
        `${formatLength(problem.shortfallMeters, unit)} short of the ` +
        `${formatLength(problem.clearMeters + problem.shortfallMeters, unit)} ` +
        `it needs.${inTheWay(problem.instanceIds)}`
      );
    case "walkway-tight":
      return (
        `${walkwayNames.get(problem.walkwayId) ?? "A route"} is down to ` +
        `${formatLength(problem.clearMeters, unit)}, ` +
        `${formatLength(problem.shortfallMeters, unit)} under the ` +
        `${formatLength(problem.clearMeters + problem.shortfallMeters, unit)} ` +
        `you asked for.${inTheWay(problem.instanceIds)}`
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
    case "walkway-blocked":
    case "walkway-tight":
      return `walkway:${problem.walkwayId}`;
  }
}
