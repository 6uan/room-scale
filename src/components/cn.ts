import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * One class string from conditions, with later Tailwind classes winning.
 *
 * The panels build their classes by branching — a wall that is selected, a
 * field that is compact, a button that is armed — and a template literal does
 * that with nested ternaries that have to spell out both sides of every
 * branch. `clsx` drops the falsy ones; `tailwind-merge` resolves the pairs
 * that collide, so a variant can add `opacity-100` over a base `opacity-50`
 * and win rather than depending on the order the two land in the stylesheet.
 *
 * Every class still appears as a whole literal somewhere in the source, which
 * is what Tailwind scans for. A class assembled from pieces would not be
 * generated at all.
 */
export function cn(...classes: ClassValue[]): string {
  return twMerge(clsx(classes));
}
