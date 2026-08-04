import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_ROOM, type Opening } from "@/domain/room";
import { metersFromInches } from "@/domain/units";
import { OpeningFields, RoomOpeningsForm } from "./room-openings-form";

describe("RoomOpeningsForm", () => {
  it("arms one kind for placement on the selected room", async () => {
    const user = userEvent.setup();
    const onAddOpening = vi.fn();
    const { rerender } = render(
      <RoomOpeningsForm room={DEFAULT_ROOM} onAddOpening={onAddOpening} />,
    );

    await user.click(screen.getByRole("button", { name: "Add window" }));
    expect(onAddOpening).toHaveBeenCalledWith("window");

    rerender(
      <RoomOpeningsForm
        room={DEFAULT_ROOM}
        placingKind="window"
        onAddOpening={onAddOpening}
      />,
    );
    // Still called what it was called: the armed button is lit rather than
    // reworded, so the one you press to stop is the one you pressed to start.
    expect(screen.getByRole("button", { name: "Add window" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Add door" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(
      screen.getByText(/Click a Living room wall to place it/),
    ).toBeInTheDocument();
  });

  it("lists each opening with its wall, selectable and removable in place", async () => {
    const user = userEvent.setup();
    const onSelectOpening = vi.fn();
    const onRemoveOpening = vi.fn();
    render(
      <RoomOpeningsForm
        room={DEFAULT_ROOM}
        onAddOpening={vi.fn()}
        onSelectOpening={onSelectOpening}
        onRemoveOpening={onRemoveOpening}
      />,
    );

    // The default room ships a south door and a north window.
    await user.click(screen.getByRole("button", { name: /Door 1/ }));
    expect(onSelectOpening).toHaveBeenCalledWith(DEFAULT_ROOM.openings[0]);

    await user.click(
      screen.getByRole("button", { name: "Remove Living room window 1" }),
    );
    expect(onRemoveOpening).toHaveBeenCalledWith(DEFAULT_ROOM.openings[1]);
  });
});

describe("OpeningFields", () => {
  it("keeps a typed center exact in the reader's unit", () => {
    const opening = DEFAULT_ROOM.openings[0];
    if (opening === undefined) {
      throw new Error("the default room has a door");
    }
    const onChange = vi.fn();

    render(
      <OpeningFields
        room={DEFAULT_ROOM}
        opening={opening}
        unit="imperial"
        onChange={onChange}
        onRemove={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole("spinbutton", { name: "Center" }), {
      target: { value: "40" },
    });

    const changed = onChange.mock.lastCall?.[0] as Opening | undefined;
    expect(changed?.centerMeters).toBeCloseTo(metersFromInches(40), 10);
  });
});
