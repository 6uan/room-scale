/**
 * Every key and pointer gesture the workspace answers to, in one table.
 *
 * The table is what the guide is printed from **and** what the handlers match
 * against, so the two cannot disagree. A hand-written list of shortcuts is
 * wrong within two changes — this file replaced one that already was, a
 * sentence reading "nudges it 5 cm" sitting above the constant that decided it.
 *
 * Distances are written in the reader's own unit for the same reason every
 * other measurement is: somebody working in inches was being told about
 * centimeters.
 *
 * Pointer gestures are in here without a matcher. They are not keys and nothing
 * dispatches on them, but they are the things people most need telling about —
 * that a plain scroll pans and only ⌘ makes it zoom is the whole reason the
 * canvas does not feel hostile.
 */

import {
  FINE_NUDGE_METERS,
  FINE_TURN_DEGREES,
  NUDGE_KEYS,
  NUDGE_METERS,
  TURN_DEGREES,
  TURN_KEYS,
} from "@/components/placement-keys";
import { formatLength, type DisplayUnit } from "@/domain/units";

/** What a shortcut needs off a keyboard event, and no more. */
export type KeyPress = {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
};

export type Shortcut = {
  readonly id: string;
  /** The heading it sits under in the guide. */
  readonly group: string;
  /** Drawn as separate caps: `["⌘", "Z"]` is two keys, `["⌘ Z"]` is one. */
  readonly keys: readonly string[];
  readonly describe: (unit: DisplayUnit) => string;
  /** How the application recognizes it. Absent for pointer gestures. */
  readonly matches?: (press: KeyPress) => boolean;
};

/**
 * The headings, named rather than written twice. The hint beside the numeric
 * fields prints one of these groups, and a typo in a repeated string would
 * silently print nothing at all.
 */
export const PLAN_GROUP = "Moving around the plan";
export const SELECTION_GROUP = "What is selected";
export const PROJECT_GROUP = "The project";

/** ⌘ on a Mac, Ctrl everywhere else. Neither is worth insisting on. */
function held(press: KeyPress): boolean {
  return press.metaKey || press.ctrlKey;
}

function isNudge(press: KeyPress): boolean {
  return (NUDGE_KEYS as readonly string[]).includes(press.key);
}

function isTurn(press: KeyPress): boolean {
  return (TURN_KEYS as readonly string[]).includes(press.key);
}

export const SHORTCUTS: readonly Shortcut[] = [
  {
    id: "pan-scroll",
    group: PLAN_GROUP,
    keys: ["Scroll"],
    describe: () => "Pans the plan.",
  },
  {
    id: "zoom-scroll",
    group: PLAN_GROUP,
    keys: ["⌘", "Scroll"],
    describe: () => "Zooms toward the pointer. A plain scroll never zooms.",
  },
  {
    id: "pan-space",
    group: PLAN_GROUP,
    keys: ["Space", "Drag"],
    describe: () => "Pans the plan without selecting anything.",
    matches: (press) => press.key === " ",
  },
  {
    id: "zoom-fit",
    group: PLAN_GROUP,
    keys: ["0"],
    describe: () => "Fits the whole apartment on screen.",
    matches: (press) => press.key === "0" || press.key === "1",
  },
  {
    id: "deselect",
    group: PLAN_GROUP,
    keys: ["Esc"],
    describe: () => "Selects nothing, and shows the apartment's own settings.",
    matches: (press) => press.key === "Escape",
  },

  {
    id: "nudge",
    group: SELECTION_GROUP,
    keys: ["Arrows"],
    describe: (unit) => `Moves a piece ${formatLength(NUDGE_METERS, unit)}.`,
    matches: (press) => isNudge(press) && !press.shiftKey,
  },
  {
    id: "nudge-fine",
    group: SELECTION_GROUP,
    keys: ["Shift", "Arrows"],
    describe: (unit) =>
      `Moves it ${formatLength(FINE_NUDGE_METERS, unit)}, for the last of it.`,
    matches: (press) => isNudge(press) && press.shiftKey,
  },
  {
    id: "turn",
    group: SELECTION_GROUP,
    keys: [...TURN_KEYS],
    describe: () =>
      `Turns a piece ${TURN_DEGREES}°, so four presses square it to a wall.`,
    matches: (press) => isTurn(press) && !press.shiftKey,
  },
  {
    id: "turn-fine",
    group: SELECTION_GROUP,
    keys: ["Shift", ...TURN_KEYS],
    describe: () => `Turns it ${FINE_TURN_DEGREES}°.`,
    matches: (press) => isTurn(press) && press.shiftKey,
  },
  {
    id: "delete",
    group: SELECTION_GROUP,
    keys: ["Delete"],
    describe: () => "Takes it out of the apartment. Undo brings it back.",
    matches: (press) =>
      (press.key === "Delete" || press.key === "Backspace") && !held(press),
  },

  {
    id: "undo",
    group: PROJECT_GROUP,
    keys: ["⌘", "Z"],
    describe: () => "Takes back the last change.",
    matches: (press) =>
      held(press) && press.key.toLowerCase() === "z" && !press.shiftKey,
  },
  {
    id: "redo",
    group: PROJECT_GROUP,
    keys: ["⇧", "⌘", "Z"],
    describe: () => "Puts back what was taken.",
    matches: (press) =>
      held(press) &&
      ((press.key.toLowerCase() === "z" && press.shiftKey) ||
        press.key.toLowerCase() === "y"),
  },
  {
    id: "guide",
    group: PROJECT_GROUP,
    keys: ["?"],
    describe: () => "Shows this list.",
    matches: (press) => press.key === "?",
  },
];

/** One shortcut by id. Throws rather than returning undefined: every id here
 * is written in this file, so a miss is a typo and not a runtime condition. */
export function shortcut(id: string): Shortcut {
  const found = SHORTCUTS.find((one) => one.id === id);
  if (found === undefined) {
    throw new Error(`No shortcut called ${id}`);
  }
  return found;
}

/** True when this press is that shortcut. False for the pointer gestures. */
export function pressIs(id: string, press: KeyPress): boolean {
  return shortcut(id).matches?.(press) ?? false;
}

/** The groups in the order they are declared, for the guide to print. */
export function shortcutGroups(): readonly {
  readonly group: string;
  readonly shortcuts: readonly Shortcut[];
}[] {
  const groups: string[] = [];
  for (const one of SHORTCUTS) {
    if (!groups.includes(one.group)) {
      groups.push(one.group);
    }
  }
  return groups.map((group) => ({
    group,
    shortcuts: SHORTCUTS.filter((one) => one.group === group),
  }));
}

/**
 * The keys for one group of shortcuts, as a sentence.
 *
 * For the hint beside the numeric fields, which says the same thing as the
 * guide about the piece you are looking at rather than about everything.
 */
export function shortcutSentence(group: string, unit: DisplayUnit): string {
  return SHORTCUTS.filter((one) => one.group === group && one.matches)
    .map((one) => `${one.keys.join(" ")} — ${one.describe(unit)}`)
    .join(" ");
}
