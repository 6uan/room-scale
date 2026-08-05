"use client";

import { cn } from "@/components/cn";

/**
 * One setting, with a label only where the controls cannot name themselves.
 *
 * A field carrying an X or a W badge has already said what it is, so printing
 * "Position" beside it says it twice and costs a fifth of a 320px panel. A row
 * of chips has not said anything, so it gets the label column.
 *
 * The rule is mechanical rather than a matter of taste, which is the point:
 * pass `label` when a reader could not name the control from looking at it.
 * Either way the row is a group with `name` on it, so the setting is announced
 * once and the fields inside it are read as belonging together.
 */
export function PanelRow({
  name,
  label,
  align = "center",
  children,
}: {
  /** The accessible name of the group. Always present, visible or not. */
  name: string;
  /** Drawn in the 56px column when the controls cannot speak for themselves. */
  label?: string;
  /** Where the label sits against a control taller than one line. */
  align?: "center" | "top";
  children: React.ReactNode;
}) {
  return (
    <fieldset
      className={cn(
        "flex min-w-0 gap-2",
        align === "top" ? "items-start" : "items-center",
      )}
    >
      <legend className="sr-only">{name}</legend>
      {label === undefined ? null : (
        <span
          aria-hidden="true"
          className={cn(
            "w-14 shrink-0 text-[11px] font-medium opacity-55",
            align === "top" && "pt-2",
          )}
        >
          {label}
        </span>
      )}
      <div className="flex min-w-0 flex-1 gap-2">{children}</div>
    </fieldset>
  );
}
