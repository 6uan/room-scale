"use client";

import { Ellipsis } from "lucide-react";
import { useCallback, useState } from "react";
import { ContextMenu, type ContextMenuItem } from "@/components/context-menu";
import { iconButtonClass } from "@/components/icon-button";

/**
 * "⋯" in a panel's header: what can be done to the thing the panel is about.
 *
 * It replaces red trash cans that sat beside the name. Two of them in the
 * room panel looked identical and deleted different things — the room, and
 * the one section on screen — and nothing said which was which until it was
 * gone. Here every item names what it takes away ("Delete Closet B"), and
 * taking it away costs a second, deliberate press. That press is the whole of
 * the friction: there is no "are you sure", because Undo already answers it.
 *
 * The menu opens under the button, right edges aligned, so it hangs into the
 * panel rather than off the side of the window.
 */
export function ActionMenu({
  label,
  items,
}: {
  /** The button's name, for the tooltip and screen readers: "Living room actions". */
  label: string;
  items: readonly ContextMenuItem[];
}) {
  const [button, setButton] = useState<HTMLButtonElement | null>(null);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  // Stable, because `ContextMenu` re-binds its listeners when it changes.
  // Focus goes back to the button, so Escape leaves you where you were.
  const close = useCallback(() => {
    setAt(null);
    button?.focus();
  }, [button]);

  return (
    <>
      <button
        ref={setButton}
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={at !== null}
        onClick={() => {
          if (at !== null) {
            setAt(null);
            return;
          }
          const box = button?.getBoundingClientRect();
          if (box !== undefined) {
            setAt({ x: box.right, y: box.bottom + 4 });
          }
        }}
        className={iconButtonClass({ pressed: at !== null })}
      >
        <Ellipsis aria-hidden="true" className="size-[18px]" />
      </button>
      {at === null ? null : (
        <ContextMenu
          at={at}
          label={label}
          items={items}
          onClose={close}
          trigger={button}
          alignRight
        />
      )}
    </>
  );
}
