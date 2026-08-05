"use client";

import { useId, useState } from "react";
import {
  degreesFromRadians,
  normalizeRadians,
  radiansFromDegrees,
} from "@/domain/units";

export type AngleFieldProps = {
  label: string;
  /**
   * A badge worn inside the field, the way `NumberField`'s X and W are.
   *
   * "Room 4 section 1 angle" printed above a box two inches wide left the rest
   * of the row empty and said, at length, what the panel around it had just
   * said. The long name stays on the control, where a screen reader still
   * reads it and the tests still find it.
   */
  compactLabel?: string;
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
  compactLabel,
  radians,
  onRadiansChange,
  presets = false,
}: AngleFieldProps) {
  const inputId = useId();
  const messageId = `${inputId}-message`;
  const compact = compactLabel !== undefined;

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
    <div className="flex min-w-0 flex-col gap-2">
      {compact ? null : (
        <label htmlFor={inputId} className="text-sm font-medium">
          {label}
        </label>
      )}
      {/*
        The field and the angles it is usually set to, on one line, headed by
        nothing. A row reading "Angle" above a box reading "0" above five
        buttons reading "0° 30° 45° 60° 90°" is one number told three times.
        The ∠ is the same badge Position and Size wear inside their fields, and
        the presets say what the unit is by carrying it.
      */}
      <div className="flex min-w-0 items-center gap-2">
        <div
          className={
            compact
              ? "flex h-8 w-[58px] shrink-0 items-center rounded-lg border border-black/15 focus-within:border-black/40 dark:border-white/20 dark:focus-within:border-white/45"
              : "flex items-center gap-2"
          }
        >
          {compact ? (
            <span
              aria-hidden="true"
              className="shrink-0 pl-2.5 text-xs font-medium opacity-50"
            >
              {compactLabel}
            </span>
          ) : null}
          <input
            id={inputId}
            type="number"
            inputMode="decimal"
            step="any"
            value={draft}
            {...(compact ? { "aria-label": label } : {})}
            aria-invalid={parsed === null}
            {...(parsed === null ? { "aria-describedby": messageId } : {})}
            onChange={(event) => handleChange(event.target.value)}
            className={
              compact
                ? "compact-number-input h-full min-w-0 flex-1 bg-transparent px-1 text-sm tabular-nums outline-none"
                : "h-8 w-28 rounded-lg border border-black/15 bg-transparent px-3 text-sm tabular-nums dark:border-white/20"
            }
          />
          <span
            aria-hidden="true"
            className={compact ? "hidden" : "text-sm opacity-60"}
          >
            °
          </span>
        </div>
        {presets ? (
          <div className="flex min-w-0 flex-1 gap-1">
            {PRESET_DEGREES.map((degrees) => {
              const current =
                Math.abs(currentDegrees(radians) - degrees) < 0.05;
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
                  className={`h-8 min-w-0 flex-1 rounded-md text-[11px] font-medium tabular-nums transition-colors ${
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
      </div>
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
