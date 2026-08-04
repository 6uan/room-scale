"use client";

import { useId, useState } from "react";
import {
  degreesFromRadians,
  normalizeRadians,
  radiansFromDegrees,
} from "@/domain/units";

export type AngleFieldProps = {
  label: string;
  radians: number;
  onRadiansChange: (radians: number) => void;
  /** Offer the handful of angles walls are actually built at. */
  presets?: boolean;
};

/**
 * The angles worth a button.
 *
 * Square, the two diagonals a plan actually contains, and the quarter turn.
 * A wall at 37° exists somewhere and can still be typed; these are the ones
 * that come up often enough that typing them is a chore, and having them
 * named means a 45° corner is one press rather than a number nobody should
 * have to remember is the right one.
 */
const PRESET_DEGREES = [0, 30, 45, 60, 90] as const;

/**
 * One rotation, edited in degrees.
 *
 * Like `NumberField`, the text is kept as typed and only a value that parses is
 * reported, so a half-typed number leaves the stored angle alone. Unlike a
 * length there is no range to be outside of: 400° is a legitimate way to type
 * 40°, and the value comes back wrapped.
 */
export function AngleField({
  label,
  radians,
  onRadiansChange,
  presets = false,
}: AngleFieldProps) {
  const inputId = useId();
  const messageId = `${inputId}-message`;

  const [draft, setDraft] = useState(() => textFromRadians(radians));
  const [applied, setApplied] = useState(radians);

  if (applied !== radians) {
    setApplied(radians);
    setDraft(textFromRadians(radians));
  }

  const parsed = degreesFromDraft(draft);

  function handleChange(text: string): void {
    setDraft(text);

    const degrees = degreesFromDraft(text);
    if (degrees === null) {
      return;
    }
    const next = radiansFromDegrees(degrees);
    // Remembered so the value coming back down does not rewrite the text —
    // except when it wraps, which is a correction worth showing.
    setApplied(next);
    onRadiansChange(next);
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
          aria-invalid={parsed === null}
          {...(parsed === null ? { "aria-describedby": messageId } : {})}
          onChange={(event) => handleChange(event.target.value)}
          className="w-28 rounded-md border border-black/15 bg-transparent px-2.5 py-1.5 text-sm tabular-nums dark:border-white/20"
        />
        <span className="text-sm opacity-60">°</span>
      </div>
      {presets ? (
        <div className="flex flex-wrap gap-1">
          {PRESET_DEGREES.map((degrees) => {
            const current = Math.abs(currentDegrees(radians) - degrees) < 0.05;
            return (
              <button
                key={degrees}
                type="button"
                aria-pressed={current}
                aria-label={`${label} ${degrees} degrees`}
                onClick={() => {
                  const next = radiansFromDegrees(degrees);
                  setApplied(next);
                  setDraft(String(degrees));
                  onRadiansChange(next);
                }}
                className={`h-7 rounded-md px-2 text-xs font-medium tabular-nums transition-colors ${
                  current
                    ? "bg-black/12 dark:bg-white/20"
                    : "bg-black/[0.05] opacity-70 hover:opacity-100 dark:bg-white/[0.08]"
                }`}
              >
                {degrees}°
              </button>
            );
          })}
        </div>
      ) : null}
      {/*
        Only when something is wrong. This used to read the applied angle back
        under the field — which was the number already in the field, printed
        twice. Even the wrapping case it was there for shows up in the input
        itself: type 400 and the text is rewritten to 40.
      */}
      {parsed === null ? (
        <p id={messageId} className="text-xs text-red-600">
          Enter a number.
        </p>
      ) : null}
    </div>
  );
}

function currentDegrees(radians: number): number {
  return degreesFromRadians(normalizeRadians(radians));
}

function textFromRadians(radians: number): string {
  return String(Math.round(currentDegrees(radians) * 10) / 10);
}

function degreesFromDraft(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") {
    return null;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}
