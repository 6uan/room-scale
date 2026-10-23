"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/components/cn";

export type ContextMenuItem = {
  readonly label: string;
  readonly onSelect: () => void;
  /** Drawn in red: a thing that takes something away. */
  readonly danger?: boolean;
};

export type ContextMenuProps = {
  /**
   * Where the pointer was, in viewport pixels — or, with `alignRight`, the
   * right edge of the button it hangs from.
   */
  readonly at: { readonly x: number; readonly y: number };
  /**
   * Hung from a button's right edge and grown leftwards to fit the longest
   * item, rather than cut at a fixed width: an item naming what it deletes is
   * as long as the name, and "Take Harmony sectional out of the r…" no longer
   * says what it does.
   */
  readonly alignRight?: boolean;
  readonly label: string;
  readonly items: readonly ContextMenuItem[];
  readonly onClose: () => void;
  /**
   * The button that opened it, when a button did. A press on it is left to
   * the button, which closes the menu itself; closing here as well would
   * close it and open it again in the same press.
   */
  readonly trigger?: HTMLElement | null;
};

/**
 * The menu a right-click opens on a row: what can be done to that one thing.
 *
 * It replaces controls that would otherwise sit on every row all the time.
 * Escape, a press anywhere else, or a scroll closes it; the arrow keys move
 * through it and Enter picks. It is pinned to the pointer and nudged back on
 * screen if the pointer was near an edge.
 */
export function ContextMenu({
  at,
  label,
  items,
  onClose,
  trigger,
  alignRight = false,
}: ContextMenuProps) {
  const menu = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const first = menu.current?.querySelector<HTMLElement>("[role=menuitem]");
    first?.focus();

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !trigger?.contains(target)) {
        onClose();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
        return;
      }
      event.preventDefault();
      const buttons = [
        ...(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ??
          []),
      ];
      const index = buttons.indexOf(document.activeElement as HTMLElement);
      const step = event.key === "ArrowDown" ? 1 : -1;
      const next = buttons[(index + step + buttons.length) % buttons.length];
      next?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose, trigger]);

  // Kept on screen: a menu opened near the right or bottom edge sits to the
  // left of, or above, the pointer instead of running off it.
  const width = 288;
  const height = items.length * 36 + 12;
  const left = Math.min(at.x, window.innerWidth - width - 8);
  const top = Math.min(at.y, window.innerHeight - height - 8);
  const placed = alignRight
    ? {
        right: window.innerWidth - at.x,
        top,
        minWidth: width,
        maxWidth: at.x - 8,
      }
    : { left, top, width };

  return (
    <div
      ref={menu}
      role="menu"
      aria-label={label}
      style={placed}
      className="fixed z-50 flex flex-col rounded-xl border border-black/10 bg-white p-1.5 shadow-xl dark:border-white/15 dark:bg-neutral-900"
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          onClick={() => {
            onClose();
            item.onSelect();
          }}
          className={cn(
            "flex h-8 w-full items-center rounded-lg px-2.5 text-left text-sm whitespace-nowrap outline-none transition-colors hover:bg-black/[0.06] focus-visible:bg-black/[0.06] dark:hover:bg-white/10 dark:focus-visible:bg-white/10",
            item.danger && "text-red-600",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
