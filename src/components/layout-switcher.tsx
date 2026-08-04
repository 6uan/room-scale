"use client";

import { Check, ChevronDown, Copy, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { IconButton } from "@/components/icon-button";
import { formatCents, type Cents } from "@/domain/units";
import type { Layout } from "@/domain/project";

export type LayoutSwitcherProps = {
  layouts: readonly Layout[];
  activeId: string;
  /** What each arrangement costs, so switching is a comparison. */
  totalsById: ReadonlyMap<string, Cents>;
  onSwitch: (id: string) => void;
  onRename: (layout: Layout, name: string) => void;
  onDuplicate: (layout: Layout) => void;
  onRemove: (layout: Layout) => void;
};

/**
 * Which arrangement is being worked on, and what each one costs.
 *
 * The price sits here rather than only on the overview, because the question a
 * second arrangement exists to answer is "which of these should I buy", and an
 * answer you have to navigate to is one you will not check.
 *
 * **One name, in one place.** This was a text field holding "Demo" beside a
 * menu whose first line also read "Demo — $0.00", plus a Duplicate button — the
 * same word printed twice and three controls of three different heights for
 * what is one idea. It is now a single button carrying the name you are working
 * under, and everything you can do to an arrangement lives in the table it
 * opens.
 *
 * A table rather than a select, because a select can only offer one line of
 * text per option. What makes this a comparison is the price beside each name
 * and the ability to rename, copy, or drop one without leaving the list.
 *
 * Duplicating is still the verb that matters — a variation starts from what you
 * have and changes one thing, and starting from an empty floor is not a
 * comparison. It sits on each row rather than under the table, so it copies the
 * arrangement you pointed at rather than whichever one happens to be open. A
 * lone copy glyph would say "copy" and say nothing about what; here the row is
 * the what, and the button is named after it.
 */
export function LayoutSwitcher({
  layouts,
  activeId,
  totalsById,
  onSwitch,
  onRename,
  onDuplicate,
  onRemove,
}: LayoutSwitcherProps) {
  const active = layouts.find((layout) => layout.id === activeId) ?? layouts[0];
  const [open, setOpen] = useState(false);
  /** The arrangement whose name is being typed, if any. */
  const [renaming, setRenaming] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Closing on a press elsewhere and on Escape, because a panel that only
  // closes by pressing the thing that opened it is a panel people leave open.
  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: PointerEvent): void {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (active === undefined) {
    return null;
  }

  return (
    <div ref={rootRef} className="relative flex min-w-0 items-center">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Arrangements"
        onClick={() => {
          setRenaming(null);
          setOpen((was) => !was);
        }}
        className={`flex h-8 min-w-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors hover:bg-black/[0.06] dark:hover:bg-white/10 ${
          open ? "bg-black/[0.06] dark:bg-white/10" : ""
        }`}
      >
        <span className="max-w-44 truncate">{active.name}</span>
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 opacity-50"
        />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Arrangements"
          className="absolute top-full left-0 z-40 mt-1.5 w-80 rounded-xl border border-black/10 bg-white p-1.5 shadow-xl dark:border-white/15 dark:bg-neutral-900"
        >
          <ul className="flex flex-col">
            {layouts.map((layout) => (
              <li key={layout.id}>
                <ArrangementRow
                  layout={layout}
                  total={totalsById.get(layout.id)}
                  current={layout.id === active.id}
                  renaming={renaming === layout.id}
                  removable={layouts.length > 1}
                  onSwitch={() => {
                    onSwitch(layout.id);
                    setOpen(false);
                  }}
                  onRenameStart={() => setRenaming(layout.id)}
                  onRenameEnd={() => setRenaming(null)}
                  onRename={(name) => onRename(layout, name)}
                  onDuplicate={() => {
                    onDuplicate(layout);
                    setOpen(false);
                  }}
                  onRemove={() => onRemove(layout)}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** One arrangement: its name, what it costs, and what can be done to it. */
function ArrangementRow({
  layout,
  total,
  current,
  renaming,
  removable,
  onSwitch,
  onRenameStart,
  onRenameEnd,
  onRename,
  onDuplicate,
  onRemove,
}: {
  layout: Layout;
  total: Cents | undefined;
  current: boolean;
  renaming: boolean;
  removable: boolean;
  onSwitch: () => void;
  onRenameStart: () => void;
  onRenameEnd: () => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  if (renaming) {
    return (
      <div className="flex items-center gap-1 px-1 py-1">
        <input
          type="text"
          autoFocus
          aria-label="Layout name"
          value={layout.name}
          onChange={(event) => onRename(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "Escape") {
              event.stopPropagation();
              onRenameEnd();
            }
          }}
          onBlur={onRenameEnd}
          className="h-8 min-w-0 flex-1 rounded-lg border border-black/15 bg-transparent px-2.5 text-sm outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/45"
        />
      </div>
    );
  }

  return (
    <div
      className={`group flex items-center gap-1 rounded-lg pr-1 transition-colors ${
        current
          ? "bg-black/[0.06] dark:bg-white/10"
          : "hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
      }`}
    >
      <button
        type="button"
        onClick={onSwitch}
        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm"
      >
        <Check
          aria-hidden="true"
          className={`size-4 shrink-0 ${current ? "opacity-70" : "opacity-0"}`}
        />
        <span className="min-w-0 flex-1 truncate">{layout.name}</span>
        {/* The comparison itself, on every line rather than only the open one. */}
        <span className="shrink-0 text-[13px] tabular-nums opacity-55">
          {total === undefined ? "" : formatCents(total)}
        </span>
      </button>
      {/*
        Only the arrangement being worked on carries these.

        Every row having three of them made a table of two arrangements a
        table of eight controls, and left it ambiguous whether pressing a row
        switched to it or did something to it. A row you are not in is one
        thing — the way across to it — and the rest wait until you are there.

        It costs a press to rename or drop one you are not looking at, and
        that is the right price: it is also a press you cannot make by
        accident on the wrong arrangement.
      */}
      {current ? (
        <>
          <IconButton
            label={`Rename ${layout.name}`}
            icon={Pencil}
            size="small"
            onClick={onRenameStart}
          />
          <IconButton
            label={`Duplicate ${layout.name}`}
            icon={Copy}
            size="small"
            onClick={onDuplicate}
          />
          {/* The last arrangement cannot go: a project always has one. */}
          {removable ? (
            <IconButton
              label={`Delete ${layout.name}`}
              icon={Trash2}
              size="small"
              tone="danger"
              onClick={onRemove}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
