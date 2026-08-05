"use client";

import { cn } from "@/components/cn";

/**
 * The one small control the panels are built from.
 *
 * An angle preset, a section number, a wall side, a wall kind and a clipped
 * corner were five hand-rolled buttons at four heights with three different
 * on-states. They are one thing: a small choice, pressed, drawn as filled when
 * it is on. 32px like every other control, and equal width so a row of them
 * divides its space evenly however many there are.
 */
export function Chip({
  label,
  title,
  pressed,
  disabled = false,
  stacked = false,
  onClick,
  children,
}: {
  /** The accessible name, which the glyph-only chips depend on. */
  label: string;
  title?: string;
  pressed?: boolean;
  disabled?: boolean;
  /** A glyph above its word, for the chips that draw and name both. */
  stacked?: boolean;
  onClick: () => void;
  /** A glyph, where the chip draws rather than writes. */
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      {...(title === undefined ? {} : { title })}
      {...(pressed === undefined ? {} : { "aria-pressed": pressed })}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-w-0 flex-1 items-center justify-center rounded-md px-1 text-[11px] font-medium tabular-nums transition-colors",
        stacked ? "h-11 flex-col gap-1" : "h-8 gap-1",
        "disabled:cursor-default disabled:opacity-30",
        pressed === true
          ? "bg-black/12 dark:bg-white/20"
          : "bg-black/[0.05] opacity-70 hover:opacity-100 dark:bg-white/[0.08]",
      )}
    >
      {children ?? label}
    </button>
  );
}

/** A row of chips, evenly divided. */
export function ChipRow({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) {
  return (
    <div role="group" aria-label={name} className="flex min-w-0 flex-1 gap-1">
      {children}
    </div>
  );
}
