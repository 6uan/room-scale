import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_ROOM,
  createWalkway,
  withWalkways,
  type Walkway,
} from "@/domain/room";
import { metersFromInches } from "@/domain/units";
import { RoomWalkwaysForm } from "./room-walkways-form";

/**
 * The form is not mounted in `/plan` yet — step 14 decides where it belongs —
 * so it is exercised directly. The rules it feeds are live either way: a stored
 * project holding a route is measured against it and reported in the fit list.
 */

const ROUTE = createWalkway("walkway-1", DEFAULT_ROOM);

/**
 * Held in state rather than mocked away, because these fields are controlled:
 * a parent that never applies an edit leaves the input showing the old value,
 * and the next keystroke lands on top of it.
 */
function Harness({
  initial,
  onWalkwaysChange,
}: {
  initial: readonly Walkway[];
  onWalkwaysChange: (walkways: readonly Walkway[]) => void;
}) {
  const [walkways, setWalkways] = useState(initial);

  return (
    <RoomWalkwaysForm
      room={withWalkways(DEFAULT_ROOM, walkways)}
      unit="imperial"
      onWalkwaysChange={(next) => {
        setWalkways(next);
        onWalkwaysChange(next);
      }}
      onAddWalkway={() => setWalkways([...walkways, ROUTE])}
    />
  );
}

function renderForm(walkways: readonly Walkway[] = []) {
  const onWalkwaysChange = vi.fn();

  render(<Harness initial={walkways} onWalkwaysChange={onWalkwaysChange} />);

  return { onWalkwaysChange };
}

/** The route as it stands after the last edit the form reported. */
function lastWalkway(onWalkwaysChange: ReturnType<typeof vi.fn>): Walkway {
  const calls = onWalkwaysChange.mock.calls;
  const last = calls[calls.length - 1]?.[0] as readonly Walkway[] | undefined;
  const walkway = last?.[0];
  if (walkway === undefined) {
    throw new Error("the form reported no walkway");
  }
  return walkway;
}

function route(name = "Route") {
  return within(screen.getByRole("group", { name }));
}

describe("RoomWalkwaysForm", () => {
  it("says what a route is for when there are none", () => {
    renderForm();

    expect(screen.getByText(/No routes yet/)).toBeInTheDocument();
  });

  it("adds one when asked", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole("button", { name: "Add a route" }));

    expect(screen.getByRole("group", { name: "Route" })).toBeInTheDocument();
  });

  it("opens a route at the widths the guest room rule asks for", () => {
    renderForm([ROUTE]);

    expect(route().getByLabelText("Needs at least")).toHaveValue(36);
    expect(route().getByLabelText("Would rather have")).toHaveValue(42);
  });

  it("shows how long the route is", () => {
    // The default route crosses the 3.6 m depth of the room.
    renderForm([ROUTE]);

    expect(route().getByText(`11' 9.7" long.`)).toBeInTheDocument();
  });

  it("moves an end, in the unit being read", async () => {
    const user = userEvent.setup();
    const { onWalkwaysChange } = renderForm([ROUTE]);

    await user.clear(route().getByLabelText("Route start from west"));
    await user.paste("24");

    expect(lastWalkway(onWalkwaysChange).start).toEqual({
      xMeters: metersFromInches(24),
      zMeters: 0,
    });
  });

  it("takes the name its owner gives it", async () => {
    const user = userEvent.setup();
    const { onWalkwaysChange } = renderForm([ROUTE]);

    await user.clear(route().getByLabelText("Name"));
    await user.paste("To the guest room");

    expect(lastWalkway(onWalkwaysChange).name).toBe("To the guest room");
    // And the fieldset is renamed with it, so the alert beside it says which.
    expect(
      screen.getByRole("group", { name: "To the guest room" }),
    ).toBeInTheDocument();
  });

  it("refuses a route with both ends in the same place, and says why", () => {
    renderForm([{ ...ROUTE, end: { ...ROUTE.start } }]);

    expect(route().getByRole("alert")).toHaveTextContent(
      /Both ends are in nearly the same place/,
    );
  });

  it("refuses a preferred width under the minimum", () => {
    renderForm([
      { ...ROUTE, minimumWidthMeters: 1.1, preferredWidthMeters: 0.9 },
    ]);

    expect(route().getByRole("alert")).toHaveTextContent(
      /cannot be less than the width you need/,
    );
  });

  it("removes a route", async () => {
    const user = userEvent.setup();
    const { onWalkwaysChange } = renderForm([ROUTE]);

    await user.click(screen.getByRole("button", { name: "Remove Route" }));

    expect(onWalkwaysChange).toHaveBeenCalledWith([]);
    expect(screen.getByText(/No routes yet/)).toBeInTheDocument();
  });
});
