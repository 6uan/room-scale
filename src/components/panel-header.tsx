"use client";

import { Plus } from "lucide-react";
import { IconButton } from "@/components/icon-button";

/**
 * A side panel's name and the one thing it adds.
 *
 * The button keeps its name whether the mode is on or off, and says which it is
 * by being lit rather than by being reworded. A control that renames itself when
 * pressed is one you have to read again to find — and the two panels add the
 * only two things there are to add, so they add them the same way.
 */
export function PanelHeader({
  title,
  action,
  active = false,
  onAction,
}: {
  title: string;
  /** The accessible name of the add button, unchanged by the mode it turns on. */
  action: string;
  active?: boolean;
  onAction: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      {/*
        Named the way it would be said aloud, at a size it can be read at.
        This was eleven-pixel letter-spaced capitals at half opacity, which is
        a label style that signals "technical" by being hard to read — the
        wrong first impression for a tool somebody opens once, to work out
        whether a sofa fits.
      */}
      <h2 className="min-w-0 truncate text-[15px] font-semibold tracking-tight">
        {title}
      </h2>
      <IconButton
        label={action}
        icon={Plus}
        pressed={active}
        size="small"
        onClick={onAction}
      />
    </div>
  );
}
