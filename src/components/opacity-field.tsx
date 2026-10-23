"use client";

import { useId, useState } from "react";
import { arrowStep } from "@/components/arrow-step";

/** The faintest an image may be drawn and still be seen to be there. */
const MIN_PERCENT = 5;

/**
 * How strongly something is drawn, as a percentage: a slider to judge it by
 * eye, and the number beside it to type, so the value stays a number as every
 * value here does. ↑ and ↓ step it by one, ten with Shift.
 */
export function OpacityField({
  label,
  opacity,
  onOpacityChange,
}: {
  label: string;
  /** From 0 to 1. */
  opacity: number;
  onOpacityChange: (opacity: number) => void;
}) {
  const inputId = useId();
  const percent = Math.round(opacity * 100);
  const [draft, setDraft] = useState(String(percent));
  const [applied, setApplied] = useState(percent);
  if (applied !== percent) {
    setApplied(percent);
    setDraft(String(percent));
  }

  const apply = (next: number) => {
    const clamped = Math.min(100, Math.max(MIN_PERCENT, Math.round(next)));
    setApplied(clamped);
    setDraft(String(clamped));
    onOpacityChange(clamped / 100);
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        aria-label={`${label} slider`}
        min={MIN_PERCENT}
        max={100}
        step={1}
        value={percent}
        onChange={(event) => apply(Number(event.target.value))}
        className="min-w-0 flex-1 accent-current"
      />
      <div className="flex h-8 w-20 shrink-0 items-center rounded-lg border border-black/15 focus-within:border-black/40 dark:border-white/20 dark:focus-within:border-white/45">
        <label htmlFor={inputId} className="sr-only">
          {label}
        </label>
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            const typed = Number(event.target.value);
            if (
              event.target.value.trim() !== "" &&
              Number.isFinite(typed) &&
              typed >= MIN_PERCENT &&
              typed <= 100
            ) {
              setApplied(Math.round(typed));
              onOpacityChange(Math.round(typed) / 100);
            }
          }}
          onKeyDown={(event) => {
            const units = arrowStep(event);
            if (units !== null) {
              event.preventDefault();
              apply(percent + units);
            }
          }}
          className="h-full min-w-0 flex-1 bg-transparent pl-2.5 text-sm tabular-nums outline-none"
        />
        <span className="pr-2 text-xs opacity-50">%</span>
      </div>
    </div>
  );
}
