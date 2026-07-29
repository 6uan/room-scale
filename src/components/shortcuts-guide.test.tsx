import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ShortcutsGuide } from "./shortcuts-guide";
import { SHORTCUTS, shortcut } from "./shortcuts";

describe("the shortcuts guide", () => {
  it("lists every shortcut the application binds", () => {
    render(<ShortcutsGuide unit="imperial" onClose={() => {}} />);

    for (const one of SHORTCUTS) {
      expect(
        screen.getByText(one.describe("imperial")),
        `${one.id} is bound but not listed`,
      ).toBeInTheDocument();
    }
  });

  it("shows the keys of a shortcut, one cap each", () => {
    render(<ShortcutsGuide unit="imperial" onClose={() => {}} />);

    // Undo is ⌘ then Z, drawn as two caps rather than as one string. Found
    // through its description, since ⌘ and Z each appear in more than one row.
    const row = screen
      .getByText(shortcut("undo").describe("imperial"))
      .closest("div");
    const caps = [...(row?.querySelectorAll("kbd") ?? [])].map(
      (cap) => cap.textContent,
    );

    expect(caps).toEqual(["⌘", "Z"]);
  });

  it("writes distances in the unit being read", () => {
    const { unmount } = render(
      <ShortcutsGuide unit="metric" onClose={() => {}} />,
    );
    expect(screen.getByText(/Moves a piece .*cm/)).toBeInTheDocument();
    unmount();

    render(<ShortcutsGuide unit="imperial" onClose={() => {}} />);
    expect(screen.getByText(/Moves a piece .*"/)).toBeInTheDocument();
  });

  it("closes on the button", async () => {
    const onClose = vi.fn();
    render(<ShortcutsGuide unit="imperial" onClose={onClose} />);

    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<ShortcutsGuide unit="imperial" onClose={onClose} />);

    await userEvent.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalled();
  });

  it("says the keys are never the only way to a value", () => {
    render(<ShortcutsGuide unit="imperial" onClose={() => {}} />);

    expect(screen.getByText(/never the only way/)).toBeInTheDocument();
  });
});
