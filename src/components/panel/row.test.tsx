import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PanelRow } from "./row";

/**
 * The row is where the panel's alignment lives, and its one decision is
 * whether to spend a fifth of a 320px panel on a label. Both halves of that
 * are worth pinning: the group is named either way, and the label is *drawn*
 * only when it is asked for.
 *
 * The two are separate on purpose. The name is always in the accessibility
 * tree, on the row's own legend; the drawn label is decoration beside it and
 * is hidden from the reading, so a labelled row is announced once rather than
 * twice.
 */
function drawnLabel(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[aria-hidden="true"]');
}

describe("PanelRow", () => {
  it("names the group without drawing a label", () => {
    render(
      <PanelRow name="Position">
        <input aria-label="X" />
      </PanelRow>,
    );

    expect(screen.getByRole("group", { name: "Position" })).toBeVisible();
    // A field carrying an X badge has already said what it is; printing
    // "Position" beside it says it twice and costs a fifth of the panel.
    expect(drawnLabel()).toBeNull();
  });

  it("draws the label when the controls cannot speak for themselves", () => {
    render(
      <PanelRow name="Walls" label="Walls">
        <button type="button">North</button>
      </PanelRow>,
    );

    expect(screen.getByRole("group", { name: "Walls" })).toBeVisible();
    // Drawn, and kept out of the reading: the group already said it.
    expect(drawnLabel()).toHaveTextContent("Walls");
  });
});
