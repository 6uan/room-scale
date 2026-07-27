"use client";

import { useId, useState } from "react";
import {
  degreesFromRadians,
  formatAngle,
  normalizeRadians,
  radiansFromDegrees,
} from "@/domain/units";

export type AngleFieldProps = {
  label: string;
  radians: number;
  onRadiansChange: (radians: number) => void;
};

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
          aria-describedby={messageId}
          onChange={(event) => handleChange(event.target.value)}
          className="w-28 rounded-md border border-black/15 bg-transparent px-2.5 py-1.5 text-sm tabular-nums dark:border-white/20"
        />
        <span className="text-sm opacity-60">°</span>
      </div>
      <p
        id={messageId}
        className={
          parsed === null ? "text-xs text-red-600" : "text-xs opacity-60"
        }
      >
        {parsed === null ? "Enter a number." : formatAngle(radians)}
      </p>
    </div>
  );
}

function textFromRadians(radians: number): string {
  const degrees = degreesFromRadians(normalizeRadians(radians));
  return String(Math.round(degrees * 10) / 10);
}

function degreesFromDraft(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") {
    return null;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}
