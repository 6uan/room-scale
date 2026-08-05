"use client";

import { useId, useRef, useState, type PointerEvent } from "react";
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
const SCRUB_UNITS_PER_PIXEL = 1;

type Scrub = {
  readonly pointerId: number;
  readonly startClientX: number;
  readonly startDisplayValue: number;
  lastMeters: number;
};

export type NumberFieldProps = {
  label: string;
  /** A short prefix inside the field, for compact inspector rows such as X/Y. */
  compactLabel?: string;
  /** Groups the continuous scrub into one undo step. */
  scrubGesture?: string;
  unit: DisplayUnit;
  meters: number;
  limits: LengthLimits;
  onMetersChange: (meters: number, gesture?: string) => void;
  /** Optional pointer/slider path when scrubbing has spatial behavior. */
  onScrubbedMetersChange?: (meters: number, gesture?: string) => void;
  onGestureEnd?: () => void;
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
  compactLabel,
  scrubGesture,
  unit,
  meters,
  limits,
  onMetersChange,
  onScrubbedMetersChange = onMetersChange,
  onGestureEnd,
}: NumberFieldProps) {
  const inputId = useId();
  const messageId = `${inputId}-message`;

  const [draft, setDraft] = useState(() => textFromMeters(meters, unit));
  const [applied, setApplied] = useState({ meters, unit });
  const [scrubbing, setScrubbing] = useState(false);
  // Pointer positions change too often to belong in render state.
  const scrubRef = useRef<Scrub | null>(null);

  if (applied.unit !== unit || applied.meters !== meters) {
    setApplied({ meters, unit });
    setDraft(textFromMeters(meters, unit));
  }

  const problem = draftProblem(draft, unit, limits);
  const compact = compactLabel !== undefined;

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

  function applyScrubbedDisplayValue(
    displayValue: number,
    gesture?: string,
  ): void {
    const next = clamp(
      metersFromDisplayValue(displayValue, unit),
      limits.minMeters,
      limits.maxMeters,
    );
    const scrub = scrubRef.current;
    if (scrub?.lastMeters === next || meters === next) {
      return;
    }
    if (scrub !== null) {
      scrub.lastMeters = next;
    }
    setApplied({ meters: next, unit });
    setDraft(textFromMeters(next, unit));
    onScrubbedMetersChange(next, gesture);
  }

  function beginScrub(event: PointerEvent<HTMLSpanElement>): void {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    scrubRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startDisplayValue: displayedNumber(meters, unit),
      lastMeters: meters,
    };
    setScrubbing(true);
  }

  function continueScrub(event: PointerEvent<HTMLSpanElement>): void {
    const scrub = scrubRef.current;
    if (scrub === null || scrub.pointerId !== event.pointerId) {
      return;
    }
    // Rounded as a whole value rather than as a whole step from where it
    // started. Rounding the step preserved whatever fraction the field already
    // had — a width of 286.93 inches scrubbed to 287.93 and 288.93 and could
    // never reach a round number at all, however long you dragged. A dragged
    // dimension should land on the kind of number a tape reads.
    const displayValue = Math.round(
      scrub.startDisplayValue +
        (event.clientX - scrub.startClientX) * SCRUB_UNITS_PER_PIXEL,
    );
    applyScrubbedDisplayValue(displayValue, scrubGesture);
  }

  function finishScrub(event: PointerEvent<HTMLSpanElement>): void {
    const scrub = scrubRef.current;
    if (scrub === null || scrub.pointerId !== event.pointerId) {
      return;
    }
    scrubRef.current = null;
    setScrubbing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onGestureEnd?.();
  }

  function handleScrubKey(key: string): void {
    const direction =
      key === "ArrowRight" || key === "ArrowUp"
        ? 1
        : key === "ArrowLeft" || key === "ArrowDown"
          ? -1
          : 0;
    if (direction === 0) {
      return;
    }
    applyScrubbedDisplayValue(displayedNumber(meters, unit) + direction);
  }

  return (
    <div className={`flex min-w-0 flex-col ${compact ? "gap-1" : "gap-1.5"}`}>
      <label
        htmlFor={inputId}
        className={compact ? "sr-only" : "text-sm font-medium"}
      >
        {label}
      </label>
      <div
        className={
          compact
            ? "flex h-8 min-w-0 items-center rounded-lg border border-black/15 bg-transparent focus-within:border-black/40 dark:border-white/20 dark:focus-within:border-white/45"
            : "flex items-center gap-2"
        }
      >
        {compact ? (
          <span
            role="slider"
            tabIndex={0}
            aria-label={`${compactLabel} drag handle`}
            aria-valuemin={displayValueFromMeters(limits.minMeters, unit)}
            aria-valuemax={displayValueFromMeters(limits.maxMeters, unit)}
            aria-valuenow={displayedNumber(meters, unit)}
            aria-valuetext={formatLength(meters, unit)}
            title={`Drag left or right to change ${label}`}
            onPointerDown={beginScrub}
            onPointerMove={continueScrub}
            onPointerUp={finishScrub}
            onPointerCancel={finishScrub}
            onLostPointerCapture={finishScrub}
            onKeyDown={(event) => {
              if (event.key.startsWith("Arrow")) {
                event.preventDefault();
                handleScrubKey(event.key);
              }
            }}
            /*
              The letter is the handle. It used to be the letter *and* a
              double arrow, which cost eighteen pixels in every field of every
              row — enough that a width of 118.28 inches was drawn as 118.2,
              and a measurement you cannot read is the one thing this panel
              cannot afford. The cursor, the tooltip and the arrow keys say it
              can be dragged.
            */
            className={`flex shrink-0 cursor-ew-resize touch-none select-none items-center pl-2.5 pr-1 text-xs font-medium outline-none hover:opacity-100 focus-visible:opacity-100 ${
              scrubbing ? "opacity-100" : "opacity-50"
            }`}
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
          aria-invalid={problem !== null}
          aria-describedby={compact && problem === null ? undefined : messageId}
          onChange={(event) => handleChange(event.target.value)}
          className={
            compact
              ? "compact-number-input h-full min-w-0 flex-1 bg-transparent pr-1.5 text-sm tabular-nums outline-none"
              : "h-8 w-28 rounded-lg border border-black/15 bg-transparent px-3 text-sm tabular-nums dark:border-white/20"
          }
        />
        {compact ? null : (
          <span className="text-sm opacity-60">{displayUnitSuffix(unit)}</span>
        )}
      </div>
      {compact && problem === null ? null : (
        <p
          id={messageId}
          className={
            problem === null
              ? "text-[13px] opacity-60"
              : "text-[13px] text-red-600"
          }
        >
          {problem === null
            ? formatLength(meters, unit)
            : problemMessage(problem, limits, unit)}
        </p>
      )}
    </div>
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** The exact number the field shows, so scrubbing starts where the reader sees. */
function displayedNumber(meters: number, unit: DisplayUnit): number {
  return Number(textFromMeters(meters, unit));
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
