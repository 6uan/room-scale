"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";

/**
 * The one button shape the workspace uses.
 *
 * An icon carries the action and the label carries its name — to the tooltip,
 * to the screen reader, and to the tests. The label is never dropped, only
 * moved: a glyph nobody can name is a control nobody can find, and every one of
 * these is reachable by the same words that used to be printed on it.
 *
 * `pressed` is a mode that is currently on, drawn as a filled button rather
 * than as changed wording. A button whose name changes when you press it is a
 * button you have to read twice to find again.
 */
export type IconButtonProps = {
  /** The accessible name and the tooltip. Required — there is no visible text. */
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  /** Whether the mode this button turns on is currently on. */
  pressed?: boolean;
  tone?: "normal" | "danger";
  size?: "normal" | "small";
};

export function IconButton({
  label,
  icon: Icon,
  onClick,
  disabled = false,
  pressed,
  tone = "normal",
  size = "normal",
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      {...(pressed === undefined ? {} : { "aria-pressed": pressed })}
      disabled={disabled}
      onClick={onClick}
      className={iconButtonClass({ pressed, tone, size })}
    >
      <Icon aria-hidden="true" className={glyphClass(size)} />
    </button>
  );
}

/**
 * A file picker wearing the same button.
 *
 * `<input type="file">` cannot be triggered from a button without a click
 * relay, so the label is the control here. It still names itself the same way.
 */
export function IconFileButton({
  label,
  icon: Icon,
  accept,
  onFile,
  size = "normal",
}: {
  label: string;
  icon: LucideIcon;
  accept: string;
  onFile: (file: File) => void;
  size?: "normal" | "small";
}) {
  return (
    <label
      title={label}
      className={`${iconButtonClass({ size })} cursor-pointer`}
    >
      <Icon aria-hidden="true" className={glyphClass(size)} />
      <input
        type="file"
        accept={accept}
        aria-label={label}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file !== undefined) {
            onFile(file);
          }
          // Cleared so choosing the same file twice still counts as a change.
          event.target.value = "";
        }}
      />
    </label>
  );
}

/**
 * A button with an icon and its words, for the places where a glyph alone would
 * be a guess — a form's submit, or an action read once and never again.
 */
export function LabelledButton({
  label,
  icon: Icon,
  onClick,
  type = "button",
  disabled = false,
  pressed,
  tone = "normal",
}: {
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  /** Whether the thing this button opens is currently open. */
  pressed?: boolean;
  tone?: "normal" | "danger";
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      {...(pressed === undefined ? {} : { "aria-pressed": pressed })}
      {...(onClick === undefined ? {} : { onClick })}
      className={`${labelledClass(tone)} ${
        pressed === true ? "bg-black/[0.08] dark:bg-white/12" : ""
      }`}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {label}
    </button>
  );
}

/** A file picker with its words, for the same reason `LabelledButton` has them. */
export function LabelledFileButton({
  label,
  icon: Icon,
  accept,
  onFile,
}: {
  label: string;
  icon: LucideIcon;
  accept: string;
  onFile: (file: File) => void;
}) {
  return (
    <label className={`${labelledClass("normal")} cursor-pointer`}>
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {label}
      <input
        type="file"
        accept={accept}
        aria-label={label}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file !== undefined) {
            onFile(file);
          }
          // Cleared so choosing the same file twice still counts as a change.
          event.target.value = "";
        }}
      />
    </label>
  );
}

/**
 * The same shape as `LabelledButton`, for the places where the action is a
 * navigation rather than a change.
 *
 * A link that looks like a button is fine; a button that navigates is not —
 * the middle-click, the copied address, and the printed page all depend on it
 * really being a link.
 */
export function LabelledLink({
  label,
  icon: Icon,
  href,
  target,
}: {
  label: string;
  icon: LucideIcon;
  href: string;
  target?: string;
}) {
  return (
    <Link
      href={href}
      title={label}
      {...(target === undefined ? {} : { target, rel: "noreferrer" })}
      className={labelledClass("normal")}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {label}
    </Link>
  );
}

function labelledClass(tone: "normal" | "danger"): string {
  // h-8 rather than padding alone, so an icon button, a labelled one and the
  // arrangement menu are the same height wherever they sit beside each other.
  // The header had four control heights in one row before this.
  return `inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors disabled:cursor-default disabled:opacity-35 ${
    tone === "danger"
      ? "border-red-600/25 text-red-600 hover:bg-red-600/10"
      : "border-black/12 hover:bg-black/[0.06] dark:border-white/18 dark:hover:bg-white/10"
  }`;
}

/**
 * A row of related buttons, drawn as one control.
 *
 * Undo and redo are one thing with two directions, and the eye should be able
 * to see that without reading either of them.
 */
export function ButtonGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-8 items-center gap-0.5 rounded-lg bg-black/[0.05] px-0.5 dark:bg-white/[0.07]">
      {children}
    </div>
  );
}

function iconButtonClass({
  pressed = false,
  tone = "normal",
  size = "normal",
}: {
  pressed?: boolean | undefined;
  tone?: "normal" | "danger" | undefined;
  size?: "normal" | "small" | undefined;
} = {}): string {
  // 28px and 32px rather than 24 and 28. A control you have to aim at is a
  // control that feels fussy, and none of these are so numerous that a few
  // pixels each costs the panel anything it was using.
  const box = size === "small" ? "size-7 rounded-lg" : "size-8 rounded-lg";
  const colors = pressed
    ? "bg-black/12 text-current dark:bg-white/20"
    : tone === "danger"
      ? "text-red-600/80 hover:bg-red-600/10 hover:text-red-600"
      : "opacity-65 hover:bg-black/[0.07] hover:opacity-100 dark:hover:bg-white/12";

  return `inline-flex shrink-0 items-center justify-center transition-colors disabled:cursor-default disabled:opacity-25 disabled:hover:bg-transparent ${box} ${colors}`;
}

function glyphClass(size: "normal" | "small"): string {
  return size === "small" ? "size-4" : "size-[18px]";
}
