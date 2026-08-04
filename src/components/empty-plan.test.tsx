import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EmptyPlan } from "./empty-plan";

describe("the empty plan", () => {
  it("names both ways in", () => {
    render(
      <EmptyPlan
        drawing={false}
        onDrawRoom={() => {}}
        onAddPlanImage={() => {}}
      />,
    );

    expect(screen.getByText("Nothing measured yet")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add room" }),
    ).toBeInTheDocument();
    // A file picker, so the label is the control rather than a button.
    expect(screen.getByLabelText("Add plan image")).toBeInTheDocument();
  });

  it("arms the plan, and says the mode is on rather than rewording itself", async () => {
    const onDrawRoom = vi.fn();
    const { rerender } = render(
      <EmptyPlan
        drawing={false}
        onDrawRoom={onDrawRoom}
        onAddPlanImage={() => {}}
      />,
    );

    const add = screen.getByRole("button", { name: "Add room" });
    expect(add).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(add);
    expect(onDrawRoom).toHaveBeenCalledTimes(1);

    rerender(
      <EmptyPlan
        drawing={true}
        onDrawRoom={onDrawRoom}
        onAddPlanImage={() => {}}
      />,
    );

    // Same words, still there to be found — only the state has changed.
    expect(screen.getByRole("button", { name: "Add room" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
