import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { type Opening } from "@/domain/room";
import { LIVING_ROOM } from "@/domain/room/fixtures";
import { metersFromInches } from "@/domain/units";
import { OpeningFields, RoomOpeningsForm } from "./room-openings-form";

describe("RoomOpeningsForm", () => {
  it("arms one kind for placement on the selected room", async () => {
    const user = userEvent.setup();
    const onAddOpening = vi.fn();
    const { rerender } = render(
      <RoomOpeningsForm room={LIVING_ROOM} onAddOpening={onAddOpening} />,
    );

    await user.click(screen.getByRole("button", { name: "Add window" }));
    expect(onAddOpening).toHaveBeenCalledWith("window");

    rerender(
      <RoomOpeningsForm
        room={LIVING_ROOM}
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
    expect(screen.getByText(/Click a wall to place it/)).toBeInTheDocument();
  });

  it("lists each opening with its wall, selectable, and deletes none", async () => {
    const user = userEvent.setup();
    const onSelectOpening = vi.fn();
    render(
      <RoomOpeningsForm
        room={LIVING_ROOM}
        onAddOpening={vi.fn()}
        onSelectOpening={onSelectOpening}
      />,
    );

    // The default room ships a south door and a north window.
    await user.click(screen.getByRole("button", { name: /Door 1/ }));
    expect(onSelectOpening).toHaveBeenCalledWith(LIVING_ROOM.openings[0]);

    // Deleting is the opening's own panel's, by name.
    expect(screen.queryByRole("button", { name: /^Remove / })).toBeNull();
  });
});

describe("OpeningFields", () => {
  it("keeps a typed gap exact in the reader's unit, and moves the door by it", () => {
    const opening = LIVING_ROOM.openings[0];
    if (opening === undefined) {
      throw new Error("the default room has a door");
    }
    const onChange = vi.fn();

    render(
      <OpeningFields
        room={LIVING_ROOM}
        opening={opening}
        unit="imperial"
        onChange={onChange}
      />,
    );

    fireEvent.change(
      screen.getByRole("textbox", { name: "Gap from the start corner" }),
      { target: { value: "24" } },
    );

    // A 32" door 24" from the corner is centred 40" along the wall.
    const changed = onChange.mock.lastCall?.[0] as Opening | undefined;
    expect(changed?.centerMeters).toBeCloseTo(metersFromInches(40), 10);
    expect(changed?.widthMeters).toBe(opening.widthMeters);
  });

  it("moves the opening to another wall with one chip", async () => {
    const user = userEvent.setup();
    const door = LIVING_ROOM.openings[0];
    if (door === undefined) {
      throw new Error("the default room has a door");
    }
    const onChange = vi.fn();
    render(
      <OpeningFields
        room={LIVING_ROOM}
        opening={door}
        unit="imperial"
        onChange={onChange}
      />,
    );

    const walls = screen.getByRole("group", {
      name: "Living room door 1 wall",
    });
    expect(
      within(walls).getByRole("button", { name: "South wall (bottom)" }),
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(
      within(walls).getByRole("button", { name: "East wall (right)" }),
    );
    expect((onChange.mock.lastCall?.[0] as Opening).wall).toBe("east");
  });

  it("sets a door's style, hinge and swing with chips, and only a door's", async () => {
    const user = userEvent.setup();
    const [door, window] = LIVING_ROOM.openings;
    if (door === undefined || window === undefined) {
      throw new Error("the default room has a door and a window");
    }
    const onChange = vi.fn();
    const { rerender } = render(
      <OpeningFields
        room={LIVING_ROOM}
        opening={door}
        unit="imperial"
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Sliding" }));
    expect(onChange.mock.lastCall?.[0]).toMatchObject({ style: "sliding" });
    await user.click(screen.getByRole("button", { name: "Out of the room" }));
    expect(onChange.mock.lastCall?.[0]).toMatchObject({ swing: "outward" });
    await user.click(
      screen.getByRole("button", { name: "At the end of the wall" }),
    );
    expect(onChange.mock.lastCall?.[0]).toMatchObject({ hinge: "end" });

    rerender(
      <OpeningFields
        room={LIVING_ROOM}
        opening={window}
        unit="imperial"
        onChange={onChange}
      />,
    );
    expect(screen.queryByRole("region", { name: "Door" })).toBeNull();
  });
});
