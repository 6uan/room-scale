/**
 * Undo and redo, over any value at all.
 *
 * The whole project is plain serializable data and every edit replaces it with
 * a new one (docs/adr/0002-local-first-persistence.md), so the history is a
 * list of past values rather than a list of operations. There is nothing to
 * invert and nothing to replay: going back is picking up the value from before.
 * A command pattern would have bought the ability to undo something too large
 * to hold in memory, which an apartment is not.
 *
 * Pure and free of React, so the rules can be tested without a store.
 *
 * ## One gesture is one step back
 *
 * A drag calls the store a couple of hundred times, and two hundred presses of
 * ⌘Z to take back one drag is not an undo. Every edit carries a `gesture` — a
 * string naming the thing being done, like `room-move:room-1` — and while it
 * stays the same the history keeps replacing the value at the front rather than
 * pushing a new one. `endGesture` is what closes it, so the next drag of the
 * same room starts a fresh step rather than joining the last one.
 *
 * An edit with no gesture is always its own step. That is the right default:
 * something has to be known to be continuous before it is treated as one move.
 */

/**
 * How far back it goes.
 *
 * Fifty is past the point anybody remembers what they did, and the values are
 * whole projects — an apartment of rooms and a catalogue, kilobytes each. Far
 * enough to be forgiving, small enough that a long session does not grow
 * without bound.
 */
export const HISTORY_DEPTH = 50;

export type History<T> = {
  /** Oldest first. The last of these is where one undo lands. */
  readonly past: readonly T[];
  readonly present: T;
  /** Nearest first: the value one redo away is at index 0. */
  readonly future: readonly T[];
  /** What produced `present`, or null when nothing continuous is happening. */
  readonly gesture: string | null;
};

export function startHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], gesture: null };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0;
}

/**
 * Takes an edit.
 *
 * A named gesture matching the one in progress replaces the present rather than
 * pushing it, which is what collapses a drag into one step. Anything else is a
 * new step, and it drops whatever had been undone — the future only exists as
 * long as nothing has been done instead of it.
 */
export function record<T>(
  history: History<T>,
  present: T,
  gesture: string | null = null,
): History<T> {
  if (gesture !== null && gesture === history.gesture) {
    return { ...history, present, future: [] };
  }

  return {
    past: [...history.past, history.present].slice(-HISTORY_DEPTH),
    present,
    future: [],
    gesture,
  };
}

/**
 * Closes whatever gesture was in progress, without changing the value.
 *
 * Called when a drag ends or a held key comes up. Without it a second drag of
 * the same room would be folded into the first one, and one press of ⌘Z would
 * take back both.
 */
export function endGesture<T>(history: History<T>): History<T> {
  return history.gesture === null ? history : { ...history, gesture: null };
}

export function undo<T>(history: History<T>): History<T> {
  const previous = history.past[history.past.length - 1];
  if (previous === undefined) {
    return history;
  }

  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    // Undoing ends whatever was in progress: the next edit is a new step, even
    // if it is the same drag continuing.
    gesture: null,
  };
}

export function redo<T>(history: History<T>): History<T> {
  const next = history.future[0];
  if (next === undefined) {
    return history;
  }

  return {
    past: [...history.past, history.present].slice(-HISTORY_DEPTH),
    present: next,
    future: history.future.slice(1),
    gesture: null,
  };
}
