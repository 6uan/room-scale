import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { withRoom, type Floor, type Room } from "@/domain/room";
import { createProject } from "@/domain/project";
import type { Selection } from "@/components/selection";
import { ApartmentLayers } from "./apartment-layers";

function LayersHarness() {
  const [floor, setFloor] = useState<Floor>(createProject().floor);
  const [selection, setSelection] = useState<Selection>(null);

  return (
    <ApartmentLayers
      floor={floor}
      furniture={[]}
      selection={selection}
      troubledIds={new Set()}
      onSelect={setSelection}
      onRoomChange={(room: Room) => setFloor(withRoom(floor, room))}
      onAddRoom={() => undefined}
    />
  );
}

describe("ApartmentLayers room names", () => {
  it("renames a room only after a double-click", async () => {
    const user = userEvent.setup();
    render(<LayersHarness />);

    const room = screen.getByRole("button", { name: "Living room" });
    await user.click(room);
    await user.click(room);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    await user.dblClick(room);
    const name = screen.getByRole("textbox", { name: "Rename Living room" });
    expect(name).toHaveFocus();
    expect(name).toHaveProperty("selectionStart", "Living room".length);
    expect(name).toHaveProperty("selectionEnd", "Living room".length);
    await user.clear(name);
    await user.type(name, "Great room{Enter}");

    expect(
      screen.getByRole("button", { name: "Great room" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("leaves the existing name alone when renaming is cancelled", async () => {
    const user = userEvent.setup();
    render(<LayersHarness />);

    await user.dblClick(screen.getByRole("button", { name: "Living room" }));
    const name = screen.getByRole("textbox", { name: "Rename Living room" });
    await user.clear(name);
    await user.type(name, "Not this{Escape}");

    expect(
      screen.getByRole("button", { name: "Living room" }),
    ).toBeInTheDocument();
  });

  it("lists and selects each opening under the room it belongs to", async () => {
    const user = userEvent.setup();
    render(<LayersHarness />);

    const door = screen.getByRole("button", { name: "Door 1" });
    const window = screen.getByRole("button", { name: "Window 1" });
    expect(door).toBeInTheDocument();
    expect(window).toBeInTheDocument();

    await user.click(window);

    expect(window).toHaveAttribute("aria-pressed", "true");
    expect(door).toHaveAttribute("aria-pressed", "false");
  });
});
