import { describe, expect, it } from "vitest";
import {
  PLAN_GROUP,
  PROJECT_GROUP,
  SELECTION_GROUP,
  SHORTCUTS,
  pressIs,
  shortcut,
  shortcutGroups,
  shortcutSentence,
} from "./shortcuts";

/** A key press with nothing held, which is what most of them are. */
function press(key: string, held: Partial<Record<string, boolean>> = {}) {
  return {
    key,
    shiftKey: held.shiftKey ?? false,
    metaKey: held.metaKey ?? false,
    ctrlKey: held.ctrlKey ?? false,
  };
}

describe("shortcuts", () => {
  it("has no two shortcuts under the same id", () => {
    const ids = SHORTCUTS.map((one) => one.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every shortcut at least one key to show", () => {
    for (const one of SHORTCUTS) {
      expect(one.keys.length).toBeGreaterThan(0);
    }
  });

  it("refuses an id it does not have, rather than returning nothing", () => {
    expect(() => shortcut("not-a-shortcut")).toThrow();
  });

  describe("undo", () => {
    it("answers to ⌘Z and to Ctrl+Z alike", () => {
      expect(pressIs("undo", press("z", { metaKey: true }))).toBe(true);
      expect(pressIs("undo", press("z", { ctrlKey: true }))).toBe(true);
    });

    it("ignores Z on its own, which is a letter somebody is typing", () => {
      expect(pressIs("undo", press("z"))).toBe(false);
    });

    it("is not the same press as redo", () => {
      const shifted = press("z", { metaKey: true, shiftKey: true });

      expect(pressIs("undo", shifted)).toBe(false);
      expect(pressIs("redo", shifted)).toBe(true);
    });

    it("takes Ctrl+Y as redo, the way Windows spells it", () => {
      expect(pressIs("redo", press("y", { ctrlKey: true }))).toBe(true);
    });
  });

  describe("delete", () => {
    it("answers to Delete and to Backspace", () => {
      expect(pressIs("delete", press("Delete"))).toBe(true);
      expect(pressIs("delete", press("Backspace"))).toBe(true);
    });

    it("leaves ⌘Backspace alone, which the browser has its own use for", () => {
      expect(pressIs("delete", press("Backspace", { metaKey: true }))).toBe(
        false,
      );
    });
  });

  describe("nudging", () => {
    it("separates a plain arrow from a shifted one", () => {
      expect(pressIs("nudge", press("ArrowLeft"))).toBe(true);
      expect(pressIs("nudge-fine", press("ArrowLeft"))).toBe(false);

      const shifted = press("ArrowLeft", { shiftKey: true });
      expect(pressIs("nudge", shifted)).toBe(false);
      expect(pressIs("nudge-fine", shifted)).toBe(true);
    });

    it("answers to every arrow", () => {
      for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
        expect(pressIs("nudge", press(key))).toBe(true);
      }
    });

    it("separates a plain bracket from a shifted one", () => {
      expect(pressIs("turn", press("["))).toBe(true);
      expect(pressIs("turn-fine", press("]", { shiftKey: true }))).toBe(true);
    });
  });

  it("says false for a gesture that is not a key at all", () => {
    expect(pressIs("pan-scroll", press("Scroll"))).toBe(false);
  });

  describe("the guide it prints", () => {
    it("keeps the groups in the order they are declared", () => {
      expect(shortcutGroups().map((one) => one.group)).toEqual([
        PLAN_GROUP,
        SELECTION_GROUP,
        PROJECT_GROUP,
      ]);
    });

    it("loses no shortcut on the way into a group", () => {
      const grouped = shortcutGroups().flatMap((one) => one.shortcuts);

      expect(grouped).toHaveLength(SHORTCUTS.length);
    });

    it("describes a distance in the reader's own unit", () => {
      expect(shortcut("nudge").describe("imperial")).toContain('"');
      expect(shortcut("nudge").describe("metric")).toContain("cm");
    });

    it("writes a sentence for one group, and only its keys", () => {
      const sentence = shortcutSentence(SELECTION_GROUP, "imperial");

      expect(sentence).toContain("Arrows");
      expect(sentence).not.toContain("Scroll");
    });

    it("leaves the pointer gestures out of a sentence about keys", () => {
      expect(shortcutSentence(PLAN_GROUP, "imperial")).not.toContain(
        "Zooms toward the pointer",
      );
    });
  });
});
