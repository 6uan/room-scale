import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createProject } from "@/domain/project";
import { RoomFields } from "./room-fields";

describe("RoomFields", () => {
  it("groups design-tool coordinates and dimensions without repeating the name", () => {
    const floor = createProject().floor;
    const room = floor.rooms[0];
    if (room === undefined) {
      throw new Error("a new project starts with a room");
    }

    render(
      <RoomFields
        floor={floor}
        room={room}
        unit="imperial"
        onChange={vi.fn()}
        onGestureEnd={vi.fn()}
        onRemove={vi.fn()}
        onAddOpening={vi.fn()}
      />,
    );

    const position = screen.getByRole("group", { name: "Position" });
    expect(
      within(position).getByRole("spinbutton", {
        name: "Living room X position",
      }),
    ).toBeInTheDocument();
    expect(
      within(position).getByRole("spinbutton", {
        name: "Living room Y position",
      }),
    ).toBeInTheDocument();
    expect(within(position).getAllByRole("slider")).toHaveLength(2);

    const size = screen.getByRole("group", { name: "Size" });
    expect(within(size).getAllByRole("spinbutton")).toEqual([
      within(size).getByRole("spinbutton", { name: "Living room width" }),
      within(size).getByRole("spinbutton", { name: "Living room height" }),
      within(size).getByRole("spinbutton", { name: "Living room depth" }),
    ]);
    expect(within(size).getAllByRole("slider")).toHaveLength(3);
    expect(
      within(size).getByRole("slider", {
        name: "W drag handle",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Name" }),
    ).not.toBeInTheDocument();
  });
});
