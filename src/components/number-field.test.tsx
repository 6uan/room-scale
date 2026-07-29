import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { metersFromInches } from "@/domain/units";
import { NumberField } from "./number-field";

function ScrubField({
  onChange,
  onGestureEnd,
}: {
  onChange: (meters: number, gesture?: string) => void;
  onGestureEnd: () => void;
}) {
  const [meters, setMeters] = useState(metersFromInches(96));

  return (
    <NumberField
      label="Living room width"
      compactLabel="W"
      scrubGesture="room-field:room-1:width"
      unit="imperial"
      meters={meters}
      limits={{ minMeters: 0.5, maxMeters: 30 }}
      onMetersChange={(next, gesture) => {
        setMeters(next);
        onChange(next, gesture);
      }}
      onGestureEnd={onGestureEnd}
    />
  );
}

function mockPointerCapture(element: HTMLElement) {
  Object.assign(element, {
    setPointerCapture: vi.fn(),
    hasPointerCapture: vi.fn(() => true),
    releasePointerCapture: vi.fn(),
  });
}

describe("NumberField compact scrubbing", () => {
  it("changes one displayed unit per horizontal pixel as one gesture", () => {
    const onChange = vi.fn();
    const onGestureEnd = vi.fn();
    render(<ScrubField onChange={onChange} onGestureEnd={onGestureEnd} />);

    const slider = screen.getByRole("slider", {
      name: "W drag handle",
    });
    mockPointerCapture(slider);

    fireEvent.pointerDown(slider, {
      pointerId: 7,
      button: 0,
      clientX: 100,
    });
    fireEvent.pointerMove(slider, { pointerId: 7, clientX: 112 });
    fireEvent.pointerUp(slider, { pointerId: 7, clientX: 112 });

    expect(
      screen.getByRole("spinbutton", { name: "Living room width" }),
    ).toHaveValue(108);
    expect(onChange).toHaveBeenLastCalledWith(
      metersFromInches(108),
      "room-field:room-1:width",
    );
    expect(onGestureEnd).toHaveBeenCalledOnce();
  });

  it("also adjusts from the keyboard while the number stays typeable", () => {
    const onChange = vi.fn();
    render(<ScrubField onChange={onChange} onGestureEnd={() => undefined} />);

    fireEvent.keyDown(
      screen.getByRole("slider", {
        name: "W drag handle",
      }),
      { key: "ArrowRight" },
    );

    const field = screen.getByRole("spinbutton", {
      name: "Living room width",
    });
    expect(field).toHaveValue(97);
    expect(field).toHaveClass("compact-number-input");
    expect(onChange).toHaveBeenLastCalledWith(metersFromInches(97), undefined);
  });

  it("stops a scrub at the field limits", () => {
    const onChange = vi.fn();
    render(<ScrubField onChange={onChange} onGestureEnd={() => undefined} />);

    const slider = screen.getByRole("slider", { name: "W drag handle" });
    mockPointerCapture(slider);
    fireEvent.pointerDown(slider, {
      pointerId: 8,
      button: 0,
      clientX: 100,
    });
    fireEvent.pointerMove(slider, { pointerId: 8, clientX: -1000 });

    expect(
      screen.getByRole("spinbutton", { name: "Living room width" }),
    ).toHaveValue(19.69);
    expect(onChange.mock.lastCall?.[0]).toBe(0.5);
  });
});
