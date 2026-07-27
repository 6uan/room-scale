"use client";

import { useId, useState } from "react";
import {
  checkLength,
  displayUnitSuffix,
  displayValueFromMeters,
  formatLength,
  metersFromDisplayValue,
  type DisplayUnit,
  type LengthLimits,
  type LengthProblem,
} from "@/domain/units";

/**
 * Digits kept in an input. A tenth of a centimeter is a millimeter, and a
 * hundredth of an inch is finer than anyone measures a wall — enough either way
 * that the stored meters are not degraded by editing them.
 */
const INPUT_DECIMALS: Record<DisplayUnit, number> = { metric: 1, imperial: 2 };

export type NumberFieldProps = {
  label: string;
  unit: DisplayUnit;
  meters: number;
  limits: LengthLimits;
  onMetersChange: (meters: number) => void;
};

/**
 * One length, edited as a number in the reader's unit.
 *
 * The field keeps the text as typed and only converts and reports a value that
 * parses and falls inside `limits` — so a half-typed or out-of-range number
 * leaves the stored meters alone, and says why. The text is rewritten only when
 * the unit changes or when the value changes from somewhere other than here.
 */
export function NumberField({
  label,
  unit,
  meters,
  limits,
  onMetersChange,
}: NumberFieldProps) {
  const inputId = useId();
  const messageId = `${inputId}-message`;

  const [draft, setDraft] = useState(() => textFromMeters(meters, unit));
  const [applied, setApplied] = useState({ meters, unit });

  if (applied.unit !== unit || applied.meters !== meters) {
    setApplied({ meters, unit });
    setDraft(textFromMeters(meters, unit));
  }

  const problem = draftProblem(draft, unit, limits);

  function handleChange(text: string): void {
    setDraft(text);

    const parsed = metersFromDraft(text, unit);
    if (parsed === null || checkLength(parsed, limits) !== null) {
      return;
    }
    // Remembered so the value coming back down does not rewrite the text.
    setApplied({ meters: parsed, unit });
    onMetersChange(parsed);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={inputId}
          type="number"
          inputMode="decimal"
          step="any"
          value={draft}
          aria-invalid={problem !== null}
          aria-describedby={messageId}
          onChange={(event) => handleChange(event.target.value)}
          className="w-28 rounded-md border border-black/15 bg-transparent px-2.5 py-1.5 text-sm tabular-nums dark:border-white/20"
        />
        <span className="text-sm opacity-60">{displayUnitSuffix(unit)}</span>
      </div>
      <p
        id={messageId}
        className={
          problem === null ? "text-xs opacity-60" : "text-xs text-red-600"
        }
      >
        {problem === null
          ? formatLength(meters, unit)
          : problemMessage(problem, limits, unit)}
      </p>
    </div>
  );
}

function textFromMeters(meters: number, unit: DisplayUnit): string {
  const text = displayValueFromMeters(meters, unit).toFixed(
    INPUT_DECIMALS[unit],
  );
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}

/** Parses a field's text into meters, or null when it is not yet a number. */
function metersFromDraft(text: string, unit: DisplayUnit): number | null {
  const trimmed = text.trim();
  if (trimmed === "") {
    return null;
  }
  const value = Number(trimmed);
  return Number.isNaN(value) ? null : metersFromDisplayValue(value, unit);
}

function draftProblem(
  text: string,
  unit: DisplayUnit,
  limits: LengthLimits,
): LengthProblem | null {
  const meters = metersFromDraft(text, unit);
  return meters === null ? "not-a-number" : checkLength(meters, limits);
}

function problemMessage(
  problem: LengthProblem,
  limits: LengthLimits,
  unit: DisplayUnit,
): string {
  switch (problem) {
    case "not-a-number":
      return "Enter a number.";
    case "too-small":
      return `At least ${formatLength(limits.minMeters, unit)}.`;
    case "too-large":
      return `At most ${formatLength(limits.maxMeters, unit)}.`;
  }
}
