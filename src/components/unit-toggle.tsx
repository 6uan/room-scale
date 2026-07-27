"use client";

import { useId } from "react";
import type { DisplayUnit } from "@/domain/units";

export type UnitToggleProps = {
  unit: DisplayUnit;
  onUnitChange: (unit: DisplayUnit) => void;
};

/**
 * Which unit lengths are typed and read in. It changes nothing that is stored —
 * every length is meters underneath (ADR 0001).
 */
export function UnitToggle({ unit, onUnitChange }: UnitToggleProps) {
  const name = useId();

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-xs font-medium uppercase tracking-[0.15em] opacity-60">
        Units
      </legend>
      <div className="flex gap-4 text-sm">
        {(["imperial", "metric"] as const).map((option) => (
          <label key={option} className="flex items-center gap-2">
            <input
              type="radio"
              name={name}
              value={option}
              checked={unit === option}
              onChange={() => onUnitChange(option)}
            />
            {option === "imperial" ? "Inches" : "Centimeters"}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
