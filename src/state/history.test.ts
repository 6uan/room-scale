import { describe, expect, it } from "vitest";
import {
  HISTORY_DEPTH,
  canRedo,
  canUndo,
  endGesture,
  record,
  redo,
  startHistory,
  undo,
} from "./history";

describe("history", () => {
  it("starts with nothing to undo or redo", () => {
    const history = startHistory("a");

    expect(history.present).toBe("a");
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
  });

  it("goes back to the value before an edit", () => {
    const history = record(startHistory("a"), "b");

    expect(history.present).toBe("b");
    expect(undo(history).present).toBe("a");
  });

  it("goes back through several edits one at a time", () => {
    let history = record(startHistory("a"), "b");
    history = record(history, "c");

    expect(undo(history).present).toBe("b");
    expect(undo(undo(history)).present).toBe("a");
  });

  it("stays put when there is nothing to undo", () => {
    const history = startHistory("a");

    expect(undo(history)).toBe(history);
    expect(redo(history)).toBe(history);
  });

  it("redoes what was undone", () => {
    const history = undo(record(startHistory("a"), "b"));

    expect(canRedo(history)).toBe(true);
    expect(redo(history).present).toBe("b");
  });

  it("drops the future once something else is done instead", () => {
    const undone = undo(record(startHistory("a"), "b"));

    const history = record(undone, "c");

    expect(canRedo(history)).toBe(false);
    expect(history.present).toBe("c");
    expect(undo(history).present).toBe("a");
  });

  describe("gestures", () => {
    it("collapses a run of one gesture into a single step", () => {
      let history = record(startHistory("a"), "b", "drag");
      history = record(history, "c", "drag");
      history = record(history, "d", "drag");

      expect(history.present).toBe("d");
      expect(undo(history).present).toBe("a");
    });

    it("separates two gestures with the same name once one has ended", () => {
      let history = record(startHistory("a"), "b", "drag");
      history = endGesture(history);
      history = record(history, "c", "drag");

      expect(undo(history).present).toBe("b");
    });

    it("separates two different gestures without being told they ended", () => {
      let history = record(startHistory("a"), "b", "move");
      history = record(history, "c", "resize");

      expect(undo(history).present).toBe("b");
    });

    it("makes every unnamed edit its own step", () => {
      let history = record(startHistory("a"), "b");
      history = record(history, "c");

      expect(undo(history).present).toBe("b");
    });

    it("ends the gesture on undo, so continuing a drag is a new step", () => {
      const dragged = record(startHistory("a"), "b", "drag");

      const history = record(undo(dragged), "c", "drag");

      expect(undo(history).present).toBe("a");
    });

    it("leaves the value alone when a gesture ends", () => {
      const history = endGesture(record(startHistory("a"), "b", "drag"));

      expect(history.present).toBe("b");
      expect(history.gesture).toBeNull();
    });

    it("drops the future while a gesture is being collapsed", () => {
      const undone = undo(record(startHistory("a"), "b"));

      const history = record(record(undone, "c", "drag"), "d", "drag");

      expect(canRedo(history)).toBe(false);
    });
  });

  it("forgets the oldest step rather than growing without bound", () => {
    let history = startHistory(0);
    for (let value = 1; value <= HISTORY_DEPTH + 10; value += 1) {
      history = record(history, value);
    }

    expect(history.past).toHaveLength(HISTORY_DEPTH);
    // The oldest kept is HISTORY_DEPTH steps back from the present, not the
    // first value ever recorded.
    expect(history.past[0]).toBe(10);
    expect(history.past[history.past.length - 1]).toBe(HISTORY_DEPTH + 9);
  });
});
