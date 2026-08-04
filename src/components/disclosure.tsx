"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";

/**
 * A setting folded away behind one line that reads out its current value.
 *
 * For the things that are true almost always and edited almost never — how
 * thick the walls are, whether this room is built differently from the rest.
 * A panel that shows every control it has is a panel somebody has to read all
 * of before touching any of it, and the value is what they came to check
 * anyway. So the summary carries the answer and the controls wait behind it.
 *
 * The button keeps its name in both states and says which it is in with
 * `aria-expanded`, rather than becoming "Hide walls" when pressed — the same
 * rule the icon buttons follow.
 */
export function Disclosure({
  label,
  summary,
  children,
}: {
  label: string;
  /** The current value, read out while it is shut. */
  summary: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-3 border-t border-black/10 pt-4 dark:border-white/15">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        className="flex min-w-0 items-center gap-2 text-left"
      >
        <ChevronRight
          aria-hidden="true"
          className={`size-4 shrink-0 opacity-50 transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span className="text-sm font-medium">{label}</span>
        <span className="min-w-0 flex-1 truncate text-right text-[13px] opacity-55">
          {summary}
        </span>
      </button>
      {open ? <div className="flex flex-col gap-3.5">{children}</div> : null}
    </div>
  );
}
