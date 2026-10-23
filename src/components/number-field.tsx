"use client";

import { useId, useRef, useState, type PointerEvent } from "react";
import { arrowStep } from "@/components/arrow-step";
import {
  checkLength,
  displayUnitSuffix,
  displayValueFromMeters,
  formatLength,
  lengthFieldText,
  lengthStepValue,
  metersFromDisplayValue,
  parseLength,
  type DisplayUnit,
  type LengthLimits,
  type LengthProblem,
} from "@/domain/units";

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

  const [draft, setDraft] = useState(() => lengthFieldText(meters, unit));
  const [applied, setApplied] = useState({ meters, unit });
  const [scrubbing, setScrubbing] = useState(false);
  // Pointer positions change too often to belong in render state.
  const scrubRef = useRef<Scrub | null>(null);

  if (applied.unit !== unit || applied.meters !== meters) {
    setApplied({ meters, unit });
    setDraft(lengthFieldText(meters, unit));
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
    setDraft(lengthFieldText(next, unit));
    onScrubbedMetersChange(next, gesture);
  }

  /**
   * ↑ and ↓ in the field: one inch or centimeter, ten with Shift. Exact, the
   * way a typed number is — it goes through `onMetersChange`, not the drag's
   * snapping path — and grouped by the field's gesture, so holding the key
   * down is one step to undo rather than one per repeat.
   */
  function stepBy(units: number): void {
    const next = clamp(
      metersFromDisplayValue(lengthStepValue(meters, unit) + units, unit),
      limits.minMeters,
      limits.maxMeters,
    );
    if (next === meters) {
      return;
    }
    setApplied({ meters: next, unit });
    setDraft(lengthFieldText(next, unit));
    onMetersChange(next, scrubGesture);
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
      startDisplayValue: lengthStepValue(meters, unit),
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

  function handleScrubKey(key: string, shift: boolean): void {
    const direction =
      key === "ArrowRight" || key === "ArrowUp"
        ? 1
        : key === "ArrowLeft" || key === "ArrowDown"
          ? -1
          : 0;
    if (direction === 0) {
      return;
    }
    applyScrubbedDisplayValue(
      lengthStepValue(meters, unit) + direction * (shift ? 10 : 1),
    );
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
          "flex h-8 min-w-0 items-center rounded-lg border border-black/15 bg-transparent focus-within:border-black/40 dark:border-white/20 dark:focus-within:border-white/45"
        }
      >
        {compact ? (
          <span
            role="slider"
            tabIndex={0}
            aria-label={`${compactLabel} drag handle`}
            aria-valuemin={displayValueFromMeters(limits.minMeters, unit)}
            aria-valuemax={displayValueFromMeters(limits.maxMeters, unit)}
            aria-valuenow={lengthStepValue(meters, unit)}
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
                handleScrubKey(event.key, event.shiftKey);
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
          // Text, not number: a number input will not take the foot and
          // inch marks a tape measure reads in, and 11'6 is the kind of thing
          // somebody types here.
          type="text"
          inputMode="decimal"
          value={draft}
          aria-invalid={problem !== null}
          aria-describedby={problem === null ? undefined : messageId}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={(event) => {
            const units = arrowStep(event);
            if (units !== null) {
              event.preventDefault();
              stepBy(units);
            }
          }}
          onKeyUp={(event) => {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              onGestureEnd?.();
            }
          }}
          className={
            compact
              ? "compact-number-input h-full min-w-0 flex-1 bg-transparent pr-1.5 text-sm tabular-nums outline-none"
              : "h-full min-w-0 flex-1 bg-transparent pl-2.5 text-sm tabular-nums outline-none"
          }
        />
        {/* Feet and inches carry their own marks; a bare number does not. */}
        {compact || unit === "imperial" ? null : (
          <span className="pr-2 text-xs opacity-50">
            {displayUnitSuffix(unit)}
          </span>
        )}
      </div>
      {/*
        Only a problem is printed under the field. It used to echo the value
        back in feet and inches too, which was the second format on screen for
        one number; the field reads in the format the labels do now.
      */}
      {problem === null ? null : (
        <p id={messageId} className="text-[13px] text-red-600">
          {problemMessage(problem, limits, unit)}
        </p>
      )}
    </div>
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Parses a field's text into meters, or null when it is not yet a length. */
function metersFromDraft(text: string, unit: DisplayUnit): number | null {
  return parseLength(text, unit);
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
      return unit === "metric"
        ? "Enter a number."
        : `Enter inches, or feet and inches like 11' 6".`;
    case "too-small":
      return `At least ${formatLength(limits.minMeters, unit)}.`;
    case "too-large":
      return `At most ${formatLength(limits.maxMeters, unit)}.`;
  }
}
