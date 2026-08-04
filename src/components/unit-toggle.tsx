"use client";

import { useId } from "react";
import type { DisplayUnit } from "@/domain/units";

export type UnitToggleProps = {
  unit: DisplayUnit;
  onUnitChange: (unit: DisplayUnit) => void;
};

const OPTIONS: readonly { unit: DisplayUnit; label: string; hint: string }[] = [
  { unit: "imperial", label: "Inches", hint: "Feet and inches" },
  { unit: "metric", label: "Centimeters", hint: "Meters and centimeters" },
];

/**
 * Which unit lengths are typed and read in. It changes nothing that is stored —
 * every length is meters underneath (ADR 0001).
 *
 * Drawn as a segmented control but built from radios, because that is what it
 * is: one choice out of two, arrow-keys and all.
 */
export function UnitToggle({ unit, onUnitChange }: UnitToggleProps) {
  const name = useId();

  return (
    <fieldset>
      <legend className="sr-only">Units</legend>
      <div className="flex w-full gap-1 rounded-lg bg-black/[0.05] p-1 dark:bg-white/[0.07]">
        {OPTIONS.map((option) => {
          const selected = unit === option.unit;
          return (
            <label
              key={option.unit}
              className={`flex flex-1 cursor-pointer flex-col items-center gap-0.5 rounded-md px-3 py-1.5 text-center text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 ${
                selected
                  ? "bg-white font-medium shadow-sm dark:bg-neutral-700"
                  : "opacity-60 hover:opacity-100"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.unit}
                checked={selected}
                onChange={() => onUnitChange(option.unit)}
                className="sr-only"
              />
              {option.label}
              <span className="text-[11px] font-normal opacity-60">
                {option.hint}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
