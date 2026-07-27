import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { resetProjectStore } from "@/state/project-store";
import { RoomPlanner } from "./room-planner";

// The project store is module-level, so it outlives a single test.
beforeEach(resetProjectStore);

/**
 * The canvas itself is not exercised here: jsdom gives elements a zero size and
 * no 2D context, so the drawing effect returns early. The projection and
 * opening geometry it would use are covered in `src/domain`, and the plan view
 * is checked in a real browser by `e2e/plan.spec.ts`. What matters here is that
 * the room can be read and edited entirely without the drawing.
 */

function dimensions() {
  return within(screen.getByRole("region", { name: "Dimensions" }));
}

function openings() {
  return within(screen.getByRole("region", { name: "Openings" }));
}

function opening(name: string) {
  return within(openings().getByRole("group", { name }));
}

function widthInput() {
  return dimensions().getByLabelText("Width");
}

function planDescription() {
  return screen.getByRole("img", { name: /^Plan view/ });
}

describe("RoomPlanner dimensions", () => {
  it("opens on the default room, in inches", () => {
    render(<RoomPlanner />);

    // 4.2 m is 165.35 inches.
    expect(widthInput()).toHaveValue(165.35);
    expect(dimensions().getAllByText(`13' 9.4"`)).toHaveLength(1);
  });

  it("edits a dimension and updates the summary and the plan description", async () => {
    const user = userEvent.setup();
    render(<RoomPlanner />);

    await user.clear(widthInput());
    await user.type(widthInput(), "120");

    expect(planDescription()).toHaveAccessibleName(/10' 0\.0" wide/);
    // 120 by 141.73 inches is 118.1 square feet.
    expect(screen.getByText("118.1 sq ft")).toBeInTheDocument();
  });

  it("converts the fields when the unit changes, without changing the room", async () => {
    const user = userEvent.setup();
    render(<RoomPlanner />);

    await user.click(screen.getByLabelText("Centimeters"));

    expect(widthInput()).toHaveValue(420);
    expect(dimensions().getByLabelText("Depth")).toHaveValue(360);
    expect(screen.getByText("15.12 m²")).toBeInTheDocument();
  });

  it("refuses an out-of-range dimension and says why", async () => {
    const user = userEvent.setup();
    render(<RoomPlanner />);

    // Pasted rather than typed: typing arrives one digit at a time, and "200"
    // is a legitimate width on the way to an illegitimate "2000".
    await user.clear(widthInput());
    await user.paste("2000");

    expect(widthInput()).toBeInvalid();
    expect(dimensions().getByText(`At most 98' 5.1".`)).toBeInTheDocument();
    // The room itself is untouched, so the plan still shows the last good width.
    expect(planDescription()).toHaveAccessibleName(/13' 9\.4" wide/);
  });

  it("treats an emptied field as incomplete rather than as zero", async () => {
    const user = userEvent.setup();
    render(<RoomPlanner />);

    await user.clear(widthInput());

    expect(dimensions().getByText("Enter a number.")).toBeInTheDocument();
    expect(planDescription()).toHaveAccessibleName(/13' 9\.4" wide/);
  });

  it("keeps wall thickness out of the floor area", async () => {
    const user = userEvent.setup();
    render(<RoomPlanner />);

    const before = screen.getByText("162.8 sq ft");
    expect(before).toBeInTheDocument();

    await user.clear(dimensions().getByLabelText("Wall thickness"));
    await user.paste("12");

    expect(screen.getByText("162.8 sq ft")).toBeInTheDocument();
  });
});

describe("RoomPlanner openings", () => {
  it("describes the default door and window in the plan", () => {
    render(<RoomPlanner />);

    expect(planDescription()).toHaveAccessibleName(
      /a door 2' 8\.0" wide on the south wall/,
    );
    expect(planDescription()).toHaveAccessibleName(
      /a window 4' 0\.0" wide on the north wall/,
    );
  });

  it("adds an opening of a standard size, centered on the wall", async () => {
    const user = userEvent.setup();
    render(<RoomPlanner />);

    await user.click(screen.getByRole("button", { name: "Add passage" }));

    // 36 inches, the walkway minimum, centered on the 4.2 m north wall.
    expect(opening("Passage 1").getByLabelText("Width")).toHaveValue(36);
    expect(opening("Passage 1").getByLabelText("Center")).toHaveValue(82.68);
    expect(planDescription()).toHaveAccessibleName(
      /an open passage 3' 0\.0" wide on the north wall/,
    );
  });

  it("removes an opening", async () => {
    const user = userEvent.setup();
    render(<RoomPlanner />);

    await user.click(screen.getByRole("button", { name: "Remove window 1" }));

    expect(planDescription()).toHaveAccessibleName(/1 opening:/);
    expect(planDescription()).not.toHaveAccessibleName(/window/);
  });

  it("keeps an opening on the wall when it is moved to a shorter one", async () => {
    const user = userEvent.setup();
    render(<RoomPlanner />);

    // The window is centered at 2.1 m, past the middle of the 3.6 m east wall.
    await user.selectOptions(
      opening("Window 1").getByLabelText("Window 1 wall"),
      "east",
    );

    expect(opening("Window 1").queryByRole("alert")).not.toBeInTheDocument();
    expect(planDescription()).toHaveAccessibleName(
      /a window 4' 0\.0" wide on the east wall/,
    );
  });

  it("reports an opening that no longer fits after the room shrinks", async () => {
    const user = userEvent.setup();
    render(<RoomPlanner />);

    // The door is centered 0.9 m along the south wall; a 1 m room cuts it off.
    await user.clear(widthInput());
    await user.paste("40");

    expect(opening("Door 1").getByRole("alert")).toHaveTextContent(
      /runs past the end of a 3' 4\.0" wall/,
    );
  });

  it("offers a hinge and a swing for doors only", () => {
    render(<RoomPlanner />);

    expect(
      opening("Door 1").getByLabelText("Door 1 hinge"),
    ).toBeInTheDocument();
    expect(
      opening("Window 1").queryByLabelText("Window 1 hinge"),
    ).not.toBeInTheDocument();
  });
});
