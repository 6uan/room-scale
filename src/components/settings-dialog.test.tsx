import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_FLOOR } from "@/domain/room";
import { SettingsDialog } from "./settings-dialog";

const apartment = {
  floor: DEFAULT_FLOOR,
  onFloorChange: () => {},
  underlay: null,
  onAddPlanImage: () => {},
  onUnderlayChange: () => {},
};

describe("the settings dialog", () => {
  it("holds the unit choice, and reports the one that was picked", async () => {
    const onUnitChange = vi.fn();
    render(
      <SettingsDialog
        {...apartment}
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
        {...apartment}
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

  it("holds the apartment's own settings: the plan to trace and the wall thickness", async () => {
    const onFloorChange = vi.fn();
    render(
      <SettingsDialog
        {...apartment}
        onFloorChange={onFloorChange}
        unit="imperial"
        onUnitChange={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.getByLabelText("Add plan image")).toBeInTheDocument();
    const walls = screen.getByRole("button", { name: /^Wall thickness/ });
    expect(walls).toHaveTextContent("4.5 in walls");
    await userEvent.click(walls);
    await userEvent.clear(screen.getByLabelText("Wall thickness"));
    await userEvent.type(screen.getByLabelText("Wall thickness"), "9{Tab}");
    expect(onFloorChange).toHaveBeenCalled();
  });

  it("closes on the button and on Escape", async () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <SettingsDialog
        {...apartment}
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
        {...apartment}
        unit="imperial"
        onUnitChange={() => {}}
        onClose={onClose}
      />,
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
