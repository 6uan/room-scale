import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SettingsDialog } from "./settings-dialog";

describe("the settings dialog", () => {
  it("holds the unit choice, and reports the one that was picked", async () => {
    const onUnitChange = vi.fn();
    render(
      <SettingsDialog
        unit="imperial"
        onUnitChange={onUnitChange}
        onClose={() => {}}
      />,
    );

    expect(screen.getByRole("radio", { name: /Inches/ })).toBeChecked();

    await userEvent.click(screen.getByRole("radio", { name: /Centimeters/ }));

    expect(onUnitChange).toHaveBeenCalledWith("metric");
  });

  it("holds the ways out of the browser, which used to live on the overview", () => {
    render(
      <SettingsDialog
        unit="imperial"
        onUnitChange={() => {}}
        onClose={() => {}}
      />,
    );

    for (const name of [
      "Save the project",
      "Save the list as a spreadsheet",
      "Open a project file",
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("closes on the button and on Escape", async () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <SettingsDialog
        unit="imperial"
        onUnitChange={() => {}}
        onClose={onClose}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();

    render(
      <SettingsDialog
        unit="imperial"
        onUnitChange={() => {}}
        onClose={onClose}
      />,
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
