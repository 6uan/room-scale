import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { radiansFromDegrees } from "@/domain/units";
import { AngleField } from "./angle-field";

function Field({
  onRadiansChange,
  presets = true,
  startDegrees = 0,
}: {
  onRadiansChange?: (radians: number) => void;
  presets?: boolean;
  startDegrees?: number;
}) {
  const [radians, setRadians] = useState(radiansFromDegrees(startDegrees));

  return (
    <AngleField
      label="Room 1 angle"
      presets={presets}
      radians={radians}
      onRadiansChange={(next) => {
        setRadians(next);
        onRadiansChange?.(next);
      }}
    />
  );
}

describe("AngleField presets", () => {
  it("turns a section to a named angle in one press", () => {
    const onRadiansChange = vi.fn();
    render(<Field onRadiansChange={onRadiansChange} />);

    fireEvent.click(
      screen.getByRole("button", { name: "Room 1 angle 45 degrees" }),
    );

    expect(onRadiansChange).toHaveBeenCalledWith(radiansFromDegrees(45));
    expect(screen.getByRole("spinbutton")).toHaveValue(45);
  });

  it("shows which angle is the current one", () => {
    render(<Field startDegrees={30} />);

    expect(
      screen.getByRole("button", { name: "Room 1 angle 30 degrees" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "Room 1 angle 45 degrees" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("leaves any other angle typeable", () => {
    const onRadiansChange = vi.fn();
    render(<Field onRadiansChange={onRadiansChange} />);

    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "37" },
    });

    expect(onRadiansChange).toHaveBeenCalledWith(radiansFromDegrees(37));
    for (const degrees of [0, 30, 45, 60, 90]) {
      expect(
        screen.getByRole("button", { name: `Room 1 angle ${degrees} degrees` }),
      ).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("is left out where a section angle is not being edited", () => {
    render(<Field presets={false} />);

    expect(
      screen.queryByRole("button", { name: "Room 1 angle 45 degrees" }),
    ).not.toBeInTheDocument();
  });
});

describe("AngleField messages", () => {
  it("says nothing under a valid angle, because the field already reads it", () => {
    // Without the presets, so the only thing that could print "45°" is the
    // message line that used to echo the value already in the field.
    render(<Field startDegrees={45} presets={false} />);

    expect(screen.queryByText("45°")).not.toBeInTheDocument();
    expect(screen.getByRole("spinbutton")).not.toHaveAttribute(
      "aria-describedby",
    );
  });

  it("says what is wrong when the angle will not parse", () => {
    render(<Field />);

    const field = screen.getByRole("spinbutton");
    fireEvent.change(field, { target: { value: "abc" } });

    expect(screen.getByText("Enter a number.")).toBeInTheDocument();
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field).toHaveAttribute("aria-describedby");
  });
});
