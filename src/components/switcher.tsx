"use client";

import { Check, ChevronDown, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { IconButton } from "@/components/icon-button";

/** One thing that can be switched to: a name, and what to print beside it. */
export type SwitcherItem = {
  readonly id: string;
  readonly name: string;
  readonly detail?: string | undefined;
};

export type SwitcherProps = {
  /** What the list is a list of: "Layouts", "Projects". */
  label: string;
  /** What the rename field is called, so it can be found by it. */
  nameLabel: string;
  items: readonly SwitcherItem[];
  activeId: string;
  onSwitch: (id: string) => void;
  onRename: (item: SwitcherItem, name: string) => void;
  onDuplicate?: (item: SwitcherItem) => void;
  onRemove: (item: SwitcherItem) => void;
  /** Offered as the last row, when starting from nothing is a thing to do. */
  onCreate?: () => void;
  createLabel?: string;
  /** Called when the list opens, for a list that has to be fetched. */
  onOpen?: () => void;
};

/**
 * Which one of several is being worked on, and what can be done to each.
 *
 * Written for arrangements and reused for projects, because the two lists ask
 * the same thing of the person — pick one, name one, drop one — and should
 * look like the same control. What differs is passed in: a detail beside the
 * name (the price, for arrangements), whether a row can be copied, and whether
 * one can be started from nothing.
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
 * Duplicating is the verb that matters for an arrangement — a variation starts
 * from what you have and changes one thing, and starting from an empty floor
 * is not a comparison. It sits on each row rather than under the table, so it
 * copies the arrangement you pointed at rather than whichever one happens to
 * be open. A project is the other way round: a second apartment is not a copy
 * of the first, so it starts from nothing, from a row at the bottom.
 */
export function Switcher({
  label,
  nameLabel,
  items,
  activeId,
  onSwitch,
  onRename,
  onDuplicate,
  onRemove,
  onCreate,
  createLabel,
  onOpen,
}: SwitcherProps) {
  const active = items.find((item) => item.id === activeId) ?? items[0];
  const [open, setOpen] = useState(false);
  /** The item whose name is being typed, if any. */
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
        aria-label={label}
        onClick={() => {
          setRenaming(null);
          if (!open) {
            onOpen?.();
          }
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
          aria-label={label}
          className="absolute top-full left-0 z-40 mt-1.5 w-80 rounded-xl border border-black/10 bg-white p-1.5 shadow-xl dark:border-white/15 dark:bg-neutral-900"
        >
          <ul className="flex flex-col">
            {items.map((item) => (
              <li key={item.id}>
                <Row
                  item={item}
                  nameLabel={nameLabel}
                  current={item.id === active.id}
                  renaming={renaming === item.id}
                  removable={items.length > 1}
                  onSwitch={() => {
                    onSwitch(item.id);
                    setOpen(false);
                  }}
                  onRenameStart={() => setRenaming(item.id)}
                  onRenameEnd={() => setRenaming(null)}
                  onRename={(name) => onRename(item, name)}
                  onDuplicate={
                    onDuplicate === undefined
                      ? undefined
                      : () => {
                          onDuplicate(item);
                          setOpen(false);
                        }
                  }
                  onRemove={() => {
                    onRemove(item);
                    setOpen(false);
                  }}
                />
              </li>
            ))}
            {onCreate === undefined ? null : (
              <li className="mt-1 border-t border-black/10 pt-1 dark:border-white/15">
                <button
                  type="button"
                  onClick={() => {
                    onCreate();
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                >
                  <Plus
                    aria-hidden="true"
                    className="size-4 shrink-0 opacity-70"
                  />
                  <span>{createLabel}</span>
                </button>
              </li>
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** One item: its name, its detail, and what can be done to it. */
function Row({
  item,
  nameLabel,
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
  item: SwitcherItem;
  nameLabel: string;
  current: boolean;
  renaming: boolean;
  removable: boolean;
  onSwitch: () => void;
  onRenameStart: () => void;
  onRenameEnd: () => void;
  onRename: (name: string) => void;
  onDuplicate: (() => void) | undefined;
  onRemove: () => void;
}) {
  if (renaming) {
    return (
      <div className="flex items-center gap-1 px-1 py-1">
        <input
          type="text"
          autoFocus
          aria-label={nameLabel}
          value={item.name}
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
        <span className="min-w-0 flex-1 truncate">{item.name}</span>
        {/* The comparison itself, on every line rather than only the open one. */}
        <span className="shrink-0 text-[13px] tabular-nums opacity-55">
          {item.detail ?? ""}
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
            label={`Rename ${item.name}`}
            icon={Pencil}
            size="small"
            onClick={onRenameStart}
          />
          {onDuplicate === undefined ? null : (
            <IconButton
              label={`Duplicate ${item.name}`}
              icon={Copy}
              size="small"
              onClick={onDuplicate}
            />
          )}
          {/* The last one cannot go: there is always one to be in. */}
          {removable ? (
            <IconButton
              label={`Delete ${item.name}`}
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
